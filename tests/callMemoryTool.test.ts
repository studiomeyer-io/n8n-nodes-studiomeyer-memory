import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IExecuteFunctions, INode } from 'n8n-workflow';

/**
 * Tests for callMemoryTool — the actual MCP round-trip. The @modelcontextprotocol
 * SDK is mocked so we can drive every branch (success parse, server tool-error
 * promotion, transport/network failure, timeout/abort) without a live server.
 */

const mocks = vi.hoisted(() => {
	return {
		connect: vi.fn<(...args: unknown[]) => Promise<void>>(),
		callTool: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
		close: vi.fn<() => Promise<void>>(),
		transportCtor: vi.fn(),
	};
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		connect = mocks.connect;
		callTool = mocks.callTool;
		close = mocks.close;
	},
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
	StreamableHTTPClientTransport: class {
		constructor(...args: unknown[]) {
			mocks.transportCtor(...args);
		}
	},
}));

// Imported AFTER the mocks are registered (vi.mock is hoisted, so this is safe).
import { callMemoryTool, prepareCallSession } from '../nodes/StudioMeyerMemory/McpClient';

const NODE: INode = {
	id: 'test-node',
	name: 'StudioMeyer Memory',
	type: 'studioMeyerMemory',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function makeContext(): IExecuteFunctions {
	return { getNode: () => NODE } as unknown as IExecuteFunctions;
}

const session = prepareCallSession(makeContext(), {
	baseUrl: 'https://memory.studiomeyer.io',
	authMode: 'apiKey',
	apiKey: 'sk_live_test',
});

interface CaughtError {
	message?: string;
	description?: string;
	context?: { itemIndex?: number };
}

/** Run a promise expected to reject and return the typed error. */
async function catchError(p: Promise<unknown>): Promise<CaughtError> {
	try {
		await p;
	} catch (err) {
		return err as CaughtError;
	}
	throw new Error('expected the call to reject, but it resolved');
}

beforeEach(() => {
	mocks.connect.mockReset().mockResolvedValue(undefined);
	mocks.callTool.mockReset();
	mocks.close.mockReset().mockResolvedValue(undefined);
	mocks.transportCtor.mockReset();
});

describe('callMemoryTool', () => {
	it('returns the parsed JSON payload on success', async () => {
		mocks.callTool.mockResolvedValue({
			content: [{ type: 'text', text: '{"hits": 2, "results": []}' }],
		});

		const out = await callMemoryTool(makeContext(), session, 'nex_search', {
			query: 'x',
		});

		expect(out).toEqual({ hits: 2, results: [] });
		expect(mocks.connect).toHaveBeenCalledOnce();
		expect(mocks.callTool).toHaveBeenCalledWith({
			name: 'nex_search',
			arguments: { query: 'x' },
		});
	});

	it('forwards structuredContent verbatim', async () => {
		mocks.callTool.mockResolvedValue({
			structuredContent: { sessionId: 'abc-123' },
			content: [{ type: 'text', text: 'ignored' }],
		});

		const out = await callMemoryTool(makeContext(), session, 'nex_session_start', {});
		expect(out).toEqual({ sessionId: 'abc-123' });
	});

	it('passes the bearer token as an Authorization header to the transport', async () => {
		mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

		await callMemoryTool(makeContext(), session, 'nex_proactive', {});

		const [, transportOpts] = mocks.transportCtor.mock.calls[0] as [
			URL,
			{ requestInit?: { headers?: Record<string, string> } },
		];
		expect(transportOpts.requestInit?.headers?.Authorization).toBe(
			'Bearer sk_live_test',
		);
	});

	it('closes the client even after a successful call', async () => {
		mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
		await callMemoryTool(makeContext(), session, 'nex_proactive', {});
		expect(mocks.close).toHaveBeenCalledOnce();
	});

	describe('server tool errors (isError content)', () => {
		it('promotes an isError result to a thrown NodeApiError with the message text', async () => {
			mocks.callTool.mockResolvedValue({
				isError: true,
				content: [
					{ type: 'text', text: 'Rate limit exceeded' },
					{ type: 'text', text: 'Try again in 60s' },
				],
			});

			await expect(
				callMemoryTool(makeContext(), session, 'nex_learn', { content: 'x' }),
			).rejects.toThrow(/Rate limit exceeded/);
		});

		it('falls back to a generic message when an isError result has no text', async () => {
			mocks.callTool.mockResolvedValue({ isError: true, content: [] });
			await expect(
				callMemoryTool(makeContext(), session, 'nex_learn', {}),
			).rejects.toThrow(/Tool returned an error/);
		});

		it('attaches the supplied itemIndex to a promoted tool error', async () => {
			mocks.callTool.mockResolvedValue({
				isError: true,
				content: [{ type: 'text', text: 'bad' }],
			});

			let caught: { context?: { itemIndex?: number } } | undefined;
			try {
				await callMemoryTool(makeContext(), session, 'nex_learn', {}, 7);
			} catch (err) {
				caught = err as { context?: { itemIndex?: number } };
			}
			expect(caught?.context?.itemIndex).toBe(7);
		});

		it('still closes the client after a tool error', async () => {
			mocks.callTool.mockResolvedValue({
				isError: true,
				content: [{ type: 'text', text: 'bad' }],
			});
			await expect(
				callMemoryTool(makeContext(), session, 'nex_learn', {}),
			).rejects.toThrow();
			expect(mocks.close).toHaveBeenCalledOnce();
		});
	});

	describe('transport / network failures', () => {
		it('wraps a connect() failure in a NodeApiError', async () => {
			mocks.connect.mockRejectedValue(new Error('ECONNREFUSED 1.2.3.4:443'));

			const err = await catchError(
				callMemoryTool(makeContext(), session, 'nex_search', { query: 'x' }),
			);
			// The friendly wrapper is on .message; the raw cause is preserved on .description.
			expect(err.message).toMatch(/Memory call failed: nex_search/);
			expect(err.description).toMatch(/ECONNREFUSED/);
			expect(mocks.callTool).not.toHaveBeenCalled();
		});

		it('wraps a non-2xx / callTool failure in a NodeApiError', async () => {
			mocks.callTool.mockRejectedValue(new Error('HTTP 401 Unauthorized'));

			const err = await catchError(
				callMemoryTool(makeContext(), session, 'nex_search', { query: 'x' }),
			);
			expect(err.message).toMatch(/Memory call failed: nex_search/);
			expect(err.description).toMatch(/401 Unauthorized/);
		});

		it('attaches itemIndex to a wrapped network error', async () => {
			mocks.connect.mockRejectedValue(new Error('boom'));

			let caught: { context?: { itemIndex?: number } } | undefined;
			try {
				await callMemoryTool(makeContext(), session, 'nex_search', {}, 3);
			} catch (err) {
				caught = err as { context?: { itemIndex?: number } };
			}
			expect(caught?.context?.itemIndex).toBe(3);
		});

		it('closes the client even after a network failure', async () => {
			mocks.connect.mockRejectedValue(new Error('boom'));
			await expect(
				callMemoryTool(makeContext(), session, 'nex_search', {}),
			).rejects.toThrow();
			expect(mocks.close).toHaveBeenCalledOnce();
		});

		it('does not throw if close() itself fails (best-effort teardown)', async () => {
			mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
			mocks.close.mockRejectedValue(new Error('already torn down'));

			// Should resolve normally despite close() rejecting.
			await expect(
				callMemoryTool(makeContext(), session, 'nex_proactive', {}),
			).resolves.toBe('ok');
		});
	});

	describe('timeout / abort', () => {
		it('reports a clear timeout message when the call aborts', async () => {
			const fastSession = prepareCallSession(makeContext(), {
				baseUrl: 'https://memory.studiomeyer.io',
				authMode: 'apiKey',
				apiKey: 'sk_live_test',
				requestTimeoutMs: 1_000,
			});

			// Simulate the SDK throwing an AbortError (what fetch raises on abort).
			mocks.callTool.mockImplementation(async () => {
				const err = new Error('The operation was aborted');
				err.name = 'AbortError';
				throw err;
			});

			const err = await catchError(
				callMemoryTool(makeContext(), fastSession, 'nex_search', { query: 'x' }),
			);
			expect(err.description).toMatch(/timed out after 1000ms: nex_search/);
		});
	});
});
