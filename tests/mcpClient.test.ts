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

	it('handles self-hosted URLs', () => {
		expect(buildMcpEndpoint('http://localhost:3200').href).toBe(
			'http://localhost:3200/mcp',
		);
	});

	it('throws on invalid URL', () => {
		expect(() => buildMcpEndpoint('not a url')).toThrow();
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
