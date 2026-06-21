import { describe, it, expect } from 'vitest';
import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { prepareCallSession } from '../nodes/StudioMeyerMemory/McpClient';

/**
 * Tests for prepareCallSession + the resolveBearerToken / timeout-clamping
 * logic it drives. These paths do not touch the network, so no SDK mock is
 * needed — we only need a context stub that returns a minimal node for error
 * construction.
 */

const NODE: INode = {
	id: 'test-node',
	name: 'StudioMeyer Memory',
	type: 'studioMeyerMemory',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

function makeContext(): IExecuteFunctions {
	return {
		getNode: () => NODE,
	} as unknown as IExecuteFunctions;
}

type Creds = Parameters<typeof prepareCallSession>[1];

const baseCreds: Creds = {
	baseUrl: 'https://memory.studiomeyer.io',
	authMode: 'apiKey',
	apiKey: 'sk_live_test',
};

describe('prepareCallSession', () => {
	it('resolves the /mcp endpoint and apiKey bearer', () => {
		const session = prepareCallSession(makeContext(), baseCreds);
		expect(session.url.href).toBe('https://memory.studiomeyer.io/mcp');
		expect(session.bearer).toBe('sk_live_test');
	});

	it('uses the OAuth access token when authMode is oauth2', () => {
		const session = prepareCallSession(makeContext(), {
			baseUrl: 'https://memory.studiomeyer.io',
			authMode: 'oauth2',
			accessToken: 'oauth-token-xyz',
		});
		expect(session.bearer).toBe('oauth-token-xyz');
	});

	describe('timeout clamping', () => {
		it('uses the default (30s) when requestTimeoutMs is undefined', () => {
			const session = prepareCallSession(makeContext(), baseCreds);
			expect(session.timeoutMs).toBe(30_000);
		});

		it('honours a valid in-range timeout', () => {
			const session = prepareCallSession(makeContext(), {
				...baseCreds,
				requestTimeoutMs: 12_000,
			});
			expect(session.timeoutMs).toBe(12_000);
		});

		it('caps an over-max timeout at 5 minutes', () => {
			const session = prepareCallSession(makeContext(), {
				...baseCreds,
				requestTimeoutMs: 999_999_999,
			});
			expect(session.timeoutMs).toBe(5 * 60_000);
		});

		it('falls back to default on zero', () => {
			const session = prepareCallSession(makeContext(), {
				...baseCreds,
				requestTimeoutMs: 0,
			});
			expect(session.timeoutMs).toBe(30_000);
		});

		it('falls back to default on a negative value', () => {
			const session = prepareCallSession(makeContext(), {
				...baseCreds,
				requestTimeoutMs: -5,
			});
			expect(session.timeoutMs).toBe(30_000);
		});

		it('falls back to default on NaN / non-numeric input', () => {
			const session = prepareCallSession(makeContext(), {
				...baseCreds,
				requestTimeoutMs: 'not-a-number' as unknown as number,
			});
			expect(session.timeoutMs).toBe(30_000);
		});
	});

	describe('missing credential errors', () => {
		it('throws a NodeApiError with the portal URL when API key is empty', () => {
			expect(() =>
				prepareCallSession(makeContext(), {
					...baseCreds,
					apiKey: '',
				}),
			).toThrow(/API key missing/i);
		});

		it('throws when API key is whitespace-only', () => {
			expect(() =>
				prepareCallSession(makeContext(), {
					...baseCreds,
					apiKey: '   ',
				}),
			).toThrow(/API key missing/i);
		});

		it('points API-key users at the portal/api URL (not the stale dashboard URL)', () => {
			let caught: Error | undefined;
			try {
				prepareCallSession(makeContext(), { ...baseCreds, apiKey: '' });
			} catch (err) {
				caught = err as Error;
			}
			expect(caught?.message).toMatch(/studiomeyer\.io\/portal\/api/);
			expect(caught?.message).not.toMatch(/dashboard\/keys/);
		});

		it('throws an OAuth-specific message when access token is missing', () => {
			expect(() =>
				prepareCallSession(makeContext(), {
					baseUrl: 'https://memory.studiomeyer.io',
					authMode: 'oauth2',
					accessToken: '',
				}),
			).toThrow(/OAuth access token missing/i);
		});

		it('attaches the supplied itemIndex to the thrown error context', () => {
			let caught: { context?: { itemIndex?: number } } | undefined;
			try {
				prepareCallSession(makeContext(), { ...baseCreds, apiKey: '' }, 4);
			} catch (err) {
				caught = err as { context?: { itemIndex?: number } };
			}
			expect(caught?.context?.itemIndex).toBe(4);
		});

		it('defaults itemIndex to 0 when not provided', () => {
			let caught: { context?: { itemIndex?: number } } | undefined;
			try {
				prepareCallSession(makeContext(), { ...baseCreds, apiKey: '' });
			} catch (err) {
				caught = err as { context?: { itemIndex?: number } };
			}
			expect(caught?.context?.itemIndex).toBe(0);
		});
	});

	it('propagates the SSRF guard from buildMcpEndpoint (loopback blocked)', () => {
		expect(() =>
			prepareCallSession(makeContext(), {
				...baseCreds,
				baseUrl: 'http://127.0.0.1:3200',
			}),
		).toThrow(/private\/loopback/i);
	});

	it('allows a private host when allowPrivateNetwork is set', () => {
		const session = prepareCallSession(makeContext(), {
			...baseCreds,
			baseUrl: 'http://localhost:3200',
			allowPrivateNetwork: true,
		});
		expect(session.url.href).toBe('http://localhost:3200/mcp');
	});
});
