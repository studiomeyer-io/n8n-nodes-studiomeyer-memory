import { describe, it, expect } from 'vitest';
import { buildToolCall } from '../nodes/StudioMeyerMemory/StudioMeyerMemory.node';

/**
 * Helper that builds a getParam stub from a flat record. Mirrors how
 * IExecuteFunctions.getNodeParameter behaves (returns the fallback when
 * the key is absent).
 */
function makeGet(params: Record<string, unknown>) {
	return (name: string, fallback?: unknown) =>
		params[name] !== undefined ? params[name] : fallback;
}

describe('buildToolCall', () => {
	describe('Memory resource', () => {
		it('maps memory.search to nex_search with project + types', () => {
			const get = makeGet({
				query: 'auth setup',
				limit: 50,
				project: 'support-bot',
				types: ['decision', 'learning'],
				recencyWeight: 0.5,
			});

			const result = buildToolCall('memory', 'search', get);

			expect(result.tool).toBe('nex_search');
			expect(result.args).toMatchObject({
				query: 'auth setup',
				limit: 50,
				project: 'support-bot',
				types: ['decision', 'learning'],
				recencyWeight: 0.5,
			});
		});

		it('maps memory.recall to nex_recall', () => {
			const result = buildToolCall(
				'memory',
				'recall',
				makeGet({ query: 'last week ssl' }),
			);
			expect(result.tool).toBe('nex_recall');
			expect(result.args.query).toBe('last week ssl');
		});

		it('maps memory.learn with parsed CSV tags', () => {
			const result = buildToolCall(
				'memory',
				'learn',
				makeGet({
					content: 'User prefers dark mode',
					category: 'pattern',
					project: 'voice-bot',
					tags: 'must-read, voice, ux',
					importance: 'high',
				}),
			);

			expect(result.tool).toBe('nex_learn');
			expect(result.args.content).toBe('User prefers dark mode');
			expect(result.args.tags).toEqual(['must-read', 'voice', 'ux']);
			expect(result.args.importance).toBe('high');
		});

		it('maps memory.decide with confidence + status', () => {
			const result = buildToolCall(
				'memory',
				'decide',
				makeGet({
					decision: 'Use OAuth 2.1',
					rationale: 'Builder-friendly onboarding',
					confidence: 0.95,
					status: 'confirmed',
				}),
			);

			expect(result.tool).toBe('nex_decide');
			expect(result.args.decision).toBe('Use OAuth 2.1');
			expect(result.args.confidence).toBe(0.95);
			expect(result.args.status).toBe('confirmed');
		});
	});

	describe('Entity resource', () => {
		it('maps entity.create with newline-split observations + CSV aliases', () => {
			const result = buildToolCall(
				'entity',
				'create',
				makeGet({
					name: 'Acme Bot',
					entityType: 'project',
					observations: 'First obs\nSecond obs\n\n  Third obs  ',
					aliases: 'Bot, Acme',
				}),
			);

			expect(result.tool).toBe('nex_entity_create');
			expect(result.args.observations).toEqual([
				'First obs',
				'Second obs',
				'Third obs',
			]);
			expect(result.args.aliases).toEqual(['Bot', 'Acme']);
		});

		it('maps entity.observe with entityRef', () => {
			const result = buildToolCall(
				'entity',
				'observe',
				makeGet({
					entityRef: 'Acme Bot',
					observations: 'New observation',
				}),
			);

			expect(result.tool).toBe('nex_entity_observe');
			expect(result.args.entityRef).toBe('Acme Bot');
			expect(result.args.observations).toEqual(['New observation']);
		});

		it('maps entity.relate with custom relation type override', () => {
			const result = buildToolCall(
				'entity',
				'relate',
				makeGet({
					fromEntity: 'Acme Bot',
					toEntity: 'Anthropic Claude',
					relationType: 'custom',
					relationTypeCustom: 'sponsors',
					evidence: 'Mentioned in kickoff',
				}),
			);

			expect(result.tool).toBe('nex_entity_relate');
			expect(result.args.relationType).toBe('sponsors');
			expect(result.args.evidence).toBe('Mentioned in kickoff');
		});

		it('maps entity.relate with built-in relation type as-is', () => {
			const result = buildToolCall(
				'entity',
				'relate',
				makeGet({
					fromEntity: 'Acme Bot',
					toEntity: 'Stripe',
					relationType: 'integrates_with',
				}),
			);

			expect(result.args.relationType).toBe('integrates_with');
		});

		it('maps entity.search with filters', () => {
			const result = buildToolCall(
				'entity',
				'search',
				makeGet({ query: 'support', entityType: 'project', limit: 25 }),
			);

			expect(result.tool).toBe('nex_entity_search');
			expect(result.args.query).toBe('support');
			expect(result.args.entityType).toBe('project');
			expect(result.args.limit).toBe(25);
		});

		it('maps entity.open with entityRef', () => {
			const result = buildToolCall(
				'entity',
				'open',
				makeGet({ entityRef: 'Acme Bot' }),
			);
			expect(result.tool).toBe('nex_entity_open');
			expect(result.args.entityRef).toBe('Acme Bot');
		});
	});

	describe('Session resource', () => {
		it('maps session.start with project + agentId', () => {
			const result = buildToolCall(
				'session',
				'start',
				makeGet({ project: 'voice-bot', agentId: 'prod-agent-1' }),
			);
			expect(result.tool).toBe('nex_session_start');
			expect(result.args.project).toBe('voice-bot');
			expect(result.args.agentId).toBe('prod-agent-1');
		});

		it('maps session.end with sessionId', () => {
			const result = buildToolCall(
				'session',
				'end',
				makeGet({ sessionId: 'abc-123', summary: 'done' }),
			);
			expect(result.tool).toBe('nex_session_end');
			expect(result.args.sessionId).toBe('abc-123');
			expect(result.args.summary).toBe('done');
		});

		it('maps session.recallTimeline with days + limit', () => {
			const result = buildToolCall(
				'session',
				'recallTimeline',
				makeGet({ days: 14, limit: 75 }),
			);
			expect(result.tool).toBe('nex_recall_timeline');
			expect(result.args.days).toBe(14);
			expect(result.args.limit).toBe(75);
		});
	});

	describe('Insight resource', () => {
		it('maps insight.synthesize with optional query + category', () => {
			const result = buildToolCall(
				'insight',
				'synthesize',
				makeGet({ query: 'auth', category: 'pattern' }),
			);
			expect(result.tool).toBe('nex_synthesize');
			expect(result.args.query).toBe('auth');
			expect(result.args.category).toBe('pattern');
		});

		it('maps insight.reflect with days', () => {
			const result = buildToolCall(
				'insight',
				'reflect',
				makeGet({ days: 30 }),
			);
			expect(result.tool).toBe('nex_reflect');
			expect(result.args.days).toBe(30);
		});

		it('maps insight.proactive', () => {
			const result = buildToolCall(
				'insight',
				'proactive',
				makeGet({ project: 'memory-product' }),
			);
			expect(result.tool).toBe('nex_proactive');
			expect(result.args.project).toBe('memory-product');
		});
	});

	describe('error handling', () => {
		it('throws on unsupported resource/operation pair', () => {
			expect(() => buildToolCall('memory', 'unknown_op', makeGet({}))).toThrow(
				/Unsupported resource\/operation/,
			);
			expect(() => buildToolCall('mystery', 'search', makeGet({}))).toThrow();
		});
	});

	describe('parsing edge cases', () => {
		it('learn with empty tags string yields empty array', () => {
			const result = buildToolCall(
				'memory',
				'learn',
				makeGet({ content: 'x', tags: '' }),
			);
			expect(result.args.tags).toEqual([]);
		});

		it('entity.create with windows-style line endings', () => {
			const result = buildToolCall(
				'entity',
				'create',
				makeGet({
					name: 'X',
					observations: 'one\r\ntwo\r\n\r\nthree',
				}),
			);
			expect(result.args.observations).toEqual(['one', 'two', 'three']);
		});

		it('entity.create without observations defaults to empty array', () => {
			const result = buildToolCall(
				'entity',
				'create',
				makeGet({ name: 'X' }),
			);
			expect(result.args.observations).toEqual([]);
		});
	});
});
