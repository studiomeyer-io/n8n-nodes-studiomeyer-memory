import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IExecuteFunctions, INode, INodeExecutionData } from 'n8n-workflow';

/**
 * Integration-style tests for the node's execute() loop. The MCP SDK is mocked
 * (same pattern as callMemoryTool.test.ts) and IExecuteFunctions is stubbed so
 * we can assert the per-item behaviour: result wrapping, pairedItem, batch
 * iteration, and the continueOnFail vs throw paths.
 */

const mocks = vi.hoisted(() => ({
	connect: vi.fn<(...args: unknown[]) => Promise<void>>(),
	callTool: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
	close: vi.fn<() => Promise<void>>(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: class {
		connect = mocks.connect;
		callTool = mocks.callTool;
		close = mocks.close;
	},
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
	StreamableHTTPClientTransport: class {},
}));

import { StudioMeyerMemory } from '../nodes/StudioMeyerMemory/StudioMeyerMemory.node';

const NODE: INode = {
	id: 'test-node',
	name: 'StudioMeyer Memory',
	type: 'studioMeyerMemory',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

interface StubOptions {
	itemCount: number;
	/** Per-item parameter records keyed by item index. */
	params: Record<string, unknown>[];
	continueOnFail?: boolean;
	credentials?: Record<string, unknown>;
}

/**
 * Build a minimal IExecuteFunctions that the node's execute() relies on.
 * getNodeParameter resolves against the per-item params record, honouring the
 * fallback argument the way n8n does.
 */
function makeExecuteContext(opts: StubOptions): IExecuteFunctions {
	const items: INodeExecutionData[] = Array.from(
		{ length: opts.itemCount },
		() => ({ json: {} }),
	);

	const credentials = opts.credentials ?? {
		baseUrl: 'https://memory.studiomeyer.io',
		authMode: 'apiKey',
		apiKey: 'sk_live_test',
	};

	const ctx = {
		getInputData: () => items,
		getCredentials: async () => credentials,
		continueOnFail: () => opts.continueOnFail === true,
		getNode: () => NODE,
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) => {
			const row = opts.params[itemIndex] ?? {};
			return row[name] !== undefined ? row[name] : fallback;
		},
	};

	return ctx as unknown as IExecuteFunctions;
}

async function run(opts: StubOptions): Promise<INodeExecutionData[]> {
	const node = new StudioMeyerMemory();
	const out = await node.execute.call(makeExecuteContext(opts));
	return out[0];
}

beforeEach(() => {
	mocks.connect.mockReset().mockResolvedValue(undefined);
	mocks.callTool.mockReset();
	mocks.close.mockReset().mockResolvedValue(undefined);
});

describe('StudioMeyerMemory.execute', () => {
	it('returns one output item per input item with pairedItem set', async () => {
		mocks.callTool.mockResolvedValue({
			content: [{ type: 'text', text: '{"ok": true}' }],
		});

		const out = await run({
			itemCount: 2,
			params: [
				{ resource: 'memory', operation: 'search', query: 'a' },
				{ resource: 'memory', operation: 'search', query: 'b' },
			],
		});

		expect(out).toHaveLength(2);
		expect(out[0].json).toEqual({ ok: true });
		expect(out[0].pairedItem).toEqual({ item: 0 });
		expect(out[1].pairedItem).toEqual({ item: 1 });
		expect(mocks.callTool).toHaveBeenCalledTimes(2);
	});

	it('wraps a primitive tool result under a `value` key', async () => {
		mocks.callTool.mockResolvedValue({
			content: [{ type: 'text', text: 'Session started: abc-123' }],
		});

		const out = await run({
			itemCount: 1,
			params: [{ resource: 'session', operation: 'start' }],
		});

		expect(out[0].json).toEqual({ value: 'Session started: abc-123' });
	});

	it('wraps an array tool result under a `value` key (not spread as object)', async () => {
		mocks.callTool.mockResolvedValue({
			content: [{ type: 'text', text: '[1, 2, 3]' }],
		});

		const out = await run({
			itemCount: 1,
			params: [{ resource: 'memory', operation: 'search', query: 'x' }],
		});

		expect(out[0].json).toEqual({ value: [1, 2, 3] });
	});

	it('passes the per-item itemIndex through to the tool call', async () => {
		mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

		await run({
			itemCount: 1,
			params: [{ resource: 'memory', operation: 'learn', content: 'remember this' }],
		});

		expect(mocks.callTool).toHaveBeenCalledWith({
			name: 'nex_learn',
			arguments: expect.objectContaining({ content: 'remember this' }),
		});
	});

	describe('continueOnFail = false (default)', () => {
		it('throws with itemIndex when a tool call fails', async () => {
			mocks.callTool.mockRejectedValue(new Error('HTTP 500 server error'));

			let caught:
				| { context?: { itemIndex?: number }; message?: string; description?: string }
				| undefined;
			try {
				await run({
					itemCount: 2,
					params: [
						{ resource: 'memory', operation: 'search', query: 'a' },
						{ resource: 'memory', operation: 'search', query: 'b' },
					],
				});
			} catch (err) {
				caught = err as {
					context?: { itemIndex?: number };
					message?: string;
					description?: string;
				};
			}

			// NodeApiError keeps the friendly wrapper on `.message` and the underlying
			// cause on `.description` — assert both are preserved, plus the itemIndex.
			expect(caught?.message).toMatch(/Memory call failed: nex_search/);
			expect(caught?.description).toMatch(/500 server error/);
			// First item (index 0) fails, so the error must carry itemIndex 0.
			expect(caught?.context?.itemIndex).toBe(0);
		});

		it('throws on an unsupported resource/operation pair', async () => {
			await expect(
				run({
					itemCount: 1,
					params: [{ resource: 'memory', operation: 'bogus' }],
				}),
			).rejects.toThrow(/Unsupported resource\/operation/);
		});
	});

	describe('continueOnFail = true', () => {
		it('captures the error in json.error + itemIndex and keeps going', async () => {
			// Item 0 fails, item 1 succeeds.
			mocks.callTool
				.mockRejectedValueOnce(new Error('boom on item 0'))
				.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"ok": true}' }] });

			const out = await run({
				itemCount: 2,
				continueOnFail: true,
				params: [
					{ resource: 'memory', operation: 'search', query: 'a' },
					{ resource: 'memory', operation: 'search', query: 'b' },
				],
			});

			expect(out).toHaveLength(2);
			expect(out[0].json.error).toMatch(/boom on item 0/);
			expect(out[0].json.itemIndex).toBe(0);
			expect(out[0].pairedItem).toEqual({ item: 0 });
			expect(out[1].json).toEqual({ ok: true });
		});

		it('captures an unsupported-operation error per item without throwing', async () => {
			const out = await run({
				itemCount: 1,
				continueOnFail: true,
				params: [{ resource: 'memory', operation: 'bogus' }],
			});

			expect(out).toHaveLength(1);
			expect(out[0].json.error).toMatch(/Unsupported resource\/operation/);
		});
	});

	describe('credential validation', () => {
		it('throws once (before the loop) when the API key is missing', async () => {
			await expect(
				run({
					itemCount: 3,
					params: [{ resource: 'memory', operation: 'search', query: 'a' }],
					credentials: {
						baseUrl: 'https://memory.studiomeyer.io',
						authMode: 'apiKey',
						apiKey: '',
					},
				}),
			).rejects.toThrow(/API key missing/i);

			// Session prep fails before any tool call is attempted.
			expect(mocks.callTool).not.toHaveBeenCalled();
		});
	});
});
