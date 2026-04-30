import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const PACKAGE_NAME = 'n8n-nodes-studiomeyer-memory';
const PACKAGE_VERSION = '0.1.0';

interface McpCredentials {
	baseUrl: string;
	authMode: 'apiKey' | 'oauth2';
	apiKey?: string;
	accessToken?: string;
}

/**
 * Resolve the bearer token for the active auth mode.
 * Throws a typed n8n error if the credential is missing/empty.
 */
function resolveBearerToken(
	context: IExecuteFunctions,
	credentials: McpCredentials,
): string {
	const token =
		credentials.authMode === 'oauth2'
			? credentials.accessToken
			: credentials.apiKey;

	if (!token || token.trim().length === 0) {
		throw new NodeApiError(context.getNode(), {
			message:
				credentials.authMode === 'oauth2'
					? 'OAuth access token missing. Re-authenticate the credential.'
					: 'API key missing. Paste a key from https://memory.studiomeyer.io/dashboard/keys.',
		});
	}

	return token;
}

/**
 * Build the MCP endpoint URL from a base URL.
 * Tolerates trailing slashes and existing /mcp suffix.
 */
export function buildMcpEndpoint(baseUrl: string): URL {
	const trimmed = baseUrl.replace(/\/+$/, '');
	const withMcp = trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`;
	return new URL(withMcp);
}

/**
 * Open an MCP client session, run a single tool call, close cleanly.
 *
 * Each n8n node execution is stateless, so we connect/call/close per
 * invocation. The hosted memory.studiomeyer.io endpoint completes a
 * full initialize+tool-call round-trip in well under a second for
 * typical payloads.
 */
export async function callMemoryTool(
	context: IExecuteFunctions,
	credentials: McpCredentials,
	toolName: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const token = resolveBearerToken(context, credentials);
	const url = buildMcpEndpoint(credentials.baseUrl);

	const transport = new StreamableHTTPClientTransport(url, {
		requestInit: {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	});

	const client = new Client(
		{ name: PACKAGE_NAME, version: PACKAGE_VERSION },
		{ capabilities: {} },
	);

	try {
		await client.connect(transport);
		const result = await client.callTool({ name: toolName, arguments: args });

		// Tool errors come back as `isError: true` content blocks. Promote them
		// to thrown NodeApiError so n8n's continueOnFail / error-output paths
		// behave correctly.
		if ((result as { isError?: boolean }).isError) {
			const content = (result as { content?: Array<{ type: string; text?: string }> })
				.content;
			const message = Array.isArray(content)
				? content
						.map((c) => (c.type === 'text' ? c.text ?? '' : ''))
						.join('\n')
						.trim()
				: 'Tool returned an error';
			throw new NodeApiError(context.getNode(), {
				message: message || 'Tool returned an error',
				description: `Tool: ${toolName}`,
			});
		}

		return parseToolResult(result);
	} catch (error) {
		if (error instanceof NodeApiError) throw error;
		const err = error as Error;
		throw new NodeApiError(
			context.getNode(),
			{ message: err?.message ?? String(error), name: err?.name ?? 'Error' },
			{ message: `Memory call failed: ${toolName}` },
		);
	} finally {
		try {
			await client.close();
		} catch {
			// best-effort; transport may already be torn down
		}
	}
}

/**
 * Parse an MCP tool result into a plain JSON value when possible.
 *
 * Memory tools return a `content` array of text blocks. Most blocks are
 * JSON-encoded, so we try to parse and fall back to the raw string.
 * If the SDK already provides `structuredContent` we use that directly.
 */
export function parseToolResult(result: unknown): unknown {
	if (result === null || typeof result !== 'object') return result;

	const r = result as {
		structuredContent?: unknown;
		content?: Array<{ type: string; text?: string }>;
	};

	if (r.structuredContent !== undefined) return r.structuredContent;

	if (!Array.isArray(r.content) || r.content.length === 0) return result;

	const textBlocks = r.content
		.filter((c) => c.type === 'text' && typeof c.text === 'string')
		.map((c) => c.text as string);

	if (textBlocks.length === 0) return result;

	const joined = textBlocks.join('\n');
	const trimmed = joined.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return joined;
		}
	}

	return joined;
}

/**
 * Strip undefined values from a tool argument object.
 * MCP servers reject unknown/invalid types more loudly than missing keys,
 * so we drop empty optionals on the client side.
 */
export function pruneArgs(
	args: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(args)) {
		if (value === undefined || value === null) continue;
		if (typeof value === 'string' && value.length === 0) continue;
		if (Array.isArray(value) && value.length === 0) continue;
		out[key] = value;
	}
	return out;
}
