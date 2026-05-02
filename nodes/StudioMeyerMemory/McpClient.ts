import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { IExecuteFunctions } from 'n8n-workflow';
import { ApplicationError, NodeApiError } from 'n8n-workflow';
import { isIP } from 'node:net';

// Imported from package.json so the User-Agent always matches the published
// package version. tsconfig has `resolveJsonModule: true`, the json file is
// in the `include` list, and the build copies it into dist alongside.
import { name as PACKAGE_NAME, version as PACKAGE_VERSION } from '../../package.json';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB hard cap on parsed text

interface McpCredentials {
	baseUrl: string;
	authMode: 'apiKey' | 'oauth2';
	apiKey?: string;
	accessToken?: string;
	allowPrivateNetwork?: boolean;
	requestTimeoutMs?: number;
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
 * Hostnames that resolve to private/loopback/link-local ranges.
 * The check is intentionally conservative — when in doubt we block and let
 * the user opt in via the `allowPrivateNetwork` credential flag.
 */
function isPrivateOrLoopbackHostname(hostname: string): boolean {
	const lower = hostname.toLowerCase();

	// Common host strings that resolve locally.
	if (
		lower === 'localhost' ||
		lower === '0.0.0.0' ||
		lower === '::' ||
		lower === '[::]' ||
		lower.endsWith('.localhost') ||
		lower.endsWith('.local') ||
		lower.endsWith('.internal')
	) {
		return true;
	}

	// IPv4 / IPv6 numeric checks. node:net.isIP returns 0 for non-IPs.
	const stripped = lower.replace(/^\[|\]$/g, '');
	const ipKind = isIP(stripped);

	if (ipKind === 4) {
		const parts = stripped.split('.').map((p) => Number(p));
		if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
		const [a, b] = parts;
		// Loopback 127.0.0.0/8
		if (a === 127) return true;
		// RFC1918 private ranges
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		// Link-local 169.254.0.0/16 — incl. AWS / GCP / Azure metadata
		if (a === 169 && b === 254) return true;
		// Multicast + reserved
		if (a >= 224) return true;
		// 0.0.0.0/8 unspecified
		if (a === 0) return true;
	}

	if (ipKind === 6) {
		const v6 = stripped;
		// Loopback ::1
		if (v6 === '::1') return true;
		// Unique local fc00::/7
		if (/^fc[0-9a-f]{2}:/.test(v6) || /^fd[0-9a-f]{2}:/.test(v6)) return true;
		// Link-local fe80::/10
		if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;
		// IPv4-mapped ::ffff:127.0.0.1 etc — strip prefix and recurse
		const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(v6);
		if (v4Mapped) return isPrivateOrLoopbackHostname(v4Mapped[1]);
	}

	return false;
}

/**
 * Build the MCP endpoint URL from a base URL.
 *
 * Hardens against:
 *   - non-http(s) protocols (file://, gopher://, javascript:)
 *   - SSRF via private/loopback hostnames (127.x, 169.254.x AWS metadata,
 *     RFC1918 ranges, ::1, fc00::/7, fe80::/10) unless explicitly allowed
 *
 * Tolerates trailing slashes and an existing /mcp suffix.
 */
export function buildMcpEndpoint(
	baseUrl: string,
	options: { allowPrivateNetwork?: boolean } = {},
): URL {
	if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
		throw new ApplicationError('Server URL is required.');
	}

	const trimmed = baseUrl.trim().replace(/\/+$/, '');
	const withMcp = /\/mcp$/i.test(trimmed) ? trimmed : `${trimmed}/mcp`;

	let url: URL;
	try {
		url = new URL(withMcp);
	} catch {
		throw new ApplicationError(`Invalid Server URL: ${baseUrl}`);
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new ApplicationError(
			`Unsupported protocol "${url.protocol}". Use http:// or https://.`,
		);
	}

	if (
		!options.allowPrivateNetwork &&
		isPrivateOrLoopbackHostname(url.hostname)
	) {
		throw new ApplicationError(
			`Refusing to connect to private/loopback host "${url.hostname}". ` +
				'If this is a self-hosted Memory server, enable "Allow Private Network" in the credential.',
		);
	}

	return url;
}

interface CallSession {
	url: URL;
	bearer: string;
	timeoutMs: number;
}

/**
 * Resolve a credential bundle into the parameters required for one or
 * more MCP tool calls. Used by the node's execute() loop so we don't
 * re-validate per item.
 */
export function prepareCallSession(
	context: IExecuteFunctions,
	credentials: McpCredentials,
): CallSession {
	const bearer = resolveBearerToken(context, credentials);
	const url = buildMcpEndpoint(credentials.baseUrl, {
		allowPrivateNetwork: credentials.allowPrivateNetwork === true,
	});
	const rawTimeout = Number(credentials.requestTimeoutMs);
	const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
		? Math.min(rawTimeout, 5 * 60_000)
		: DEFAULT_TIMEOUT_MS;
	return { url, bearer, timeoutMs };
}

/**
 * Open an MCP client session, run a single tool call, close cleanly.
 *
 * Each call still creates a fresh client (the n8n SDK does not currently
 * give us a hook to share one across items without leaking state between
 * workflows). The session is wrapped in a per-call AbortController so a
 * hung server cannot block the workflow indefinitely.
 */
export async function callMemoryTool(
	context: IExecuteFunctions,
	session: CallSession,
	toolName: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), session.timeoutMs);
	timer.unref?.();

	const transport = new StreamableHTTPClientTransport(session.url, {
		requestInit: {
			headers: {
				Authorization: `Bearer ${session.bearer}`,
			},
			signal: controller.signal,
		},
	});

	const client = new Client(
		{ name: PACKAGE_NAME, version: PACKAGE_VERSION },
		{ capabilities: {} },
	);

	try {
		await client.connect(transport);
		const result = await client.callTool({
			name: toolName,
			arguments: args,
		});

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
		const aborted = err?.name === 'AbortError' || controller.signal.aborted;
		throw new NodeApiError(
			context.getNode(),
			{
				message: aborted
					? `Tool call timed out after ${session.timeoutMs}ms: ${toolName}`
					: err?.message ?? String(error),
				name: err?.name ?? 'Error',
			},
			{ message: `Memory call failed: ${toolName}` },
		);
	} finally {
		clearTimeout(timer);
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
 *
 * Hardens against an oversized response by capping the joined text at
 * MAX_RESPONSE_BYTES so a misconfigured server can't OOM the worker.
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

	let joined = textBlocks.join('\n');
	if (joined.length > MAX_RESPONSE_BYTES) {
		joined =
			joined.slice(0, MAX_RESPONSE_BYTES) +
			`\n\n[truncated by n8n-nodes-studiomeyer-memory at ${MAX_RESPONSE_BYTES} bytes]`;
	}

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
 * Strip undefined / null / empty values from a tool argument object.
 * MCP servers reject unknown/invalid types more loudly than missing keys,
 * so we drop empty optionals on the client side. Preserves zero, false,
 * and explicit booleans.
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
