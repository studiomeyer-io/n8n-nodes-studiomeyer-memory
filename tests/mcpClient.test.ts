import { describe, it, expect } from 'vitest';
import {
	buildMcpEndpoint,
	parseToolResult,
	pruneArgs,
} from '../nodes/StudioMeyerMemory/McpClient';

describe('buildMcpEndpoint', () => {
	it('appends /mcp when missing', () => {
		expect(buildMcpEndpoint('https://memory.studiomeyer.io').href).toBe(
			'https://memory.studiomeyer.io/mcp',
		);
	});

	it('strips trailing slash before appending', () => {
		expect(buildMcpEndpoint('https://memory.studiomeyer.io/').href).toBe(
			'https://memory.studiomeyer.io/mcp',
		);
	});

	it('strips multiple trailing slashes', () => {
		expect(buildMcpEndpoint('https://memory.studiomeyer.io///').href).toBe(
			'https://memory.studiomeyer.io/mcp',
		);
	});

	it('does not double-append when /mcp already present', () => {
		expect(buildMcpEndpoint('https://memory.studiomeyer.io/mcp').href).toBe(
			'https://memory.studiomeyer.io/mcp',
		);
	});

	it('throws on invalid URL', () => {
		expect(() => buildMcpEndpoint('not a url')).toThrow();
	});

	it('throws on empty string', () => {
		expect(() => buildMcpEndpoint('')).toThrow(/required/i);
		expect(() => buildMcpEndpoint('   ')).toThrow(/required/i);
	});

	describe('SSRF guard (allowPrivateNetwork=false)', () => {
		it('blocks file:// protocol', () => {
			expect(() => buildMcpEndpoint('file:///etc/passwd')).toThrow(
				/protocol/i,
			);
		});

		it('blocks gopher:// protocol', () => {
			expect(() => buildMcpEndpoint('gopher://example.com')).toThrow(
				/protocol/i,
			);
		});

		it('blocks loopback IPv4 127.0.0.1', () => {
			expect(() => buildMcpEndpoint('http://127.0.0.1:3200')).toThrow(
				/private\/loopback/i,
			);
			expect(() => buildMcpEndpoint('https://127.0.0.1')).toThrow(
				/private\/loopback/i,
			);
		});

		it('blocks AWS metadata endpoint 169.254.169.254', () => {
			expect(() =>
				buildMcpEndpoint('http://169.254.169.254/latest/meta-data/'),
			).toThrow(/private\/loopback/i);
		});

		it('blocks RFC1918 ranges (10.x, 172.16-31.x, 192.168.x)', () => {
			expect(() => buildMcpEndpoint('https://10.0.0.1')).toThrow();
			expect(() => buildMcpEndpoint('https://172.20.0.5')).toThrow();
			expect(() => buildMcpEndpoint('https://192.168.1.1')).toThrow();
		});

		it('blocks IPv6 loopback ::1', () => {
			expect(() => buildMcpEndpoint('http://[::1]:3200')).toThrow();
		});

		it('blocks localhost hostname', () => {
			expect(() => buildMcpEndpoint('http://localhost:3200')).toThrow(
				/private\/loopback/i,
			);
		});

		it('blocks .local TLD (mDNS)', () => {
			expect(() => buildMcpEndpoint('https://memory.local')).toThrow();
		});

		it('blocks .internal TLD', () => {
			expect(() => buildMcpEndpoint('https://memory.internal')).toThrow();
		});

		it('allows public hostnames', () => {
			expect(buildMcpEndpoint('https://memory.studiomeyer.io').href).toBe(
				'https://memory.studiomeyer.io/mcp',
			);
			expect(buildMcpEndpoint('https://example.com').href).toBe(
				'https://example.com/mcp',
			);
		});
	});

	describe('SSRF guard (allowPrivateNetwork=true opt-in)', () => {
		it('allows localhost when explicitly enabled', () => {
			expect(
				buildMcpEndpoint('http://localhost:3200', {
					allowPrivateNetwork: true,
				}).href,
			).toBe('http://localhost:3200/mcp');
		});

		it('allows 127.0.0.1 when explicitly enabled', () => {
			expect(
				buildMcpEndpoint('http://127.0.0.1:3200', {
					allowPrivateNetwork: true,
				}).href,
			).toBe('http://127.0.0.1:3200/mcp');
		});

		it('still blocks file:// even when private network enabled', () => {
			expect(() =>
				buildMcpEndpoint('file:///etc/passwd', { allowPrivateNetwork: true }),
			).toThrow(/protocol/i);
		});
	});
});

describe('parseToolResult', () => {
	it('returns structuredContent verbatim when present', () => {
		const result = parseToolResult({
			structuredContent: { hits: 5, items: [] },
			content: [{ type: 'text', text: 'ignored' }],
		});
		expect(result).toEqual({ hits: 5, items: [] });
	});

	it('parses JSON object from text content', () => {
		const result = parseToolResult({
			content: [{ type: 'text', text: '{"matches": 3, "results": []}' }],
		});
		expect(result).toEqual({ matches: 3, results: [] });
	});

	it('parses JSON array from text content', () => {
		const result = parseToolResult({
			content: [{ type: 'text', text: '[1, 2, 3]' }],
		});
		expect(result).toEqual([1, 2, 3]);
	});

	it('returns raw string when content is plain text', () => {
		const result = parseToolResult({
			content: [{ type: 'text', text: 'Session started: abc-123' }],
		});
		expect(result).toBe('Session started: abc-123');
	});

	it('joins multiple text blocks with newlines', () => {
		const result = parseToolResult({
			content: [
				{ type: 'text', text: 'Line 1' },
				{ type: 'text', text: 'Line 2' },
			],
		});
		expect(result).toBe('Line 1\nLine 2');
	});

	it('falls back to raw when JSON parsing fails', () => {
		const result = parseToolResult({
			content: [{ type: 'text', text: '{invalid json' }],
		});
		expect(result).toBe('{invalid json');
	});

	it('returns the input when no parseable content present', () => {
		const input = { content: [{ type: 'image', text: 'binary' }] };
		expect(parseToolResult(input)).toBe(input);
	});

	it('returns primitives as-is', () => {
		expect(parseToolResult(null)).toBeNull();
		expect(parseToolResult(42)).toBe(42);
		expect(parseToolResult('hello')).toBe('hello');
	});

	it('caps oversized response at 5MB with truncation marker', () => {
		// Build an 8MB JSON-like string. Should be truncated and the prefix
		// is no longer parseable as JSON (cap is not JSON-aware), so we get
		// the truncated string back instead.
		const oversized = '[' + '"x",'.repeat(2_000_000) + '"y"]';
		expect(oversized.length).toBeGreaterThan(5 * 1024 * 1024);

		const result = parseToolResult({
			content: [{ type: 'text', text: oversized }],
		});

		expect(typeof result).toBe('string');
		expect((result as string).length).toBeLessThan(oversized.length);
		expect(result as string).toContain('[truncated by n8n-nodes-studiomeyer-memory');
	});
});

describe('pruneArgs', () => {
	it('drops undefined and null', () => {
		expect(
			pruneArgs({ a: 1, b: undefined, c: null, d: 'x' }),
		).toEqual({ a: 1, d: 'x' });
	});

	it('drops empty strings', () => {
		expect(pruneArgs({ a: '', b: 'value' })).toEqual({ b: 'value' });
	});

	it('drops empty arrays', () => {
		expect(pruneArgs({ tags: [], values: [1, 2] })).toEqual({
			values: [1, 2],
		});
	});

	it('keeps zero and false values', () => {
		expect(pruneArgs({ count: 0, flag: false })).toEqual({
			count: 0,
			flag: false,
		});
	});

	it('keeps nested objects untouched', () => {
		const args = { config: { nested: 'value' } };
		expect(pruneArgs(args)).toEqual({ config: { nested: 'value' } });
	});
});
