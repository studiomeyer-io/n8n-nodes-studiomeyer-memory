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

		it('maps memory.recall to nex_recall WITHOUT project (server ignores it)', () => {
			const result = buildToolCall(
				'memory',
				'recall',
				makeGet({ query: 'last week ssl', project: 'ignored' }),
			);
			expect(result.tool).toBe('nex_recall');
			expect(result.args.query).toBe('last week ssl');
			expect(result.args).not.toHaveProperty('project');
		});

		it('maps memory.learn WITHOUT importance (not in server schema)', () => {
			const result = buildToolCall(
				'memory',
				'learn',
				makeGet({
					content: 'User prefers dark mode',
					category: 'pattern',
					project: 'voice-bot',
					tags: 'must-read, voice, ux',
					confidence: 0.9,
				}),
			);

			expect(result.tool).toBe('nex_learn');
			expect(result.args.content).toBe('User prefers dark mode');
			expect(result.args.tags).toEqual(['must-read', 'voice', 'ux']);
			expect(result.args.confidence).toBe(0.9);
			expect(result.args.source).toBe('session');
			// Server schema rejects unknown fields ,  `importance` must not be sent.
			expect(result.args).not.toHaveProperty('importance');
		});

		it('memory.learn clamps confidence to [0, 1]', () => {
			const r1 = buildToolCall(
				'memory',
				'learn',
				makeGet({ content: 'x', confidence: 1.5 }),
			);
			expect(r1.args.confidence).toBe(1);

			const r2 = buildToolCall(
				'memory',
				'learn',
				makeGet({ content: 'x', confidence: -0.3 }),
			);
			expect(r2.args.confidence).toBe(0);

			const r3 = buildToolCall(
				'memory',
				'learn',
				makeGet({ content: 'x', confidence: 'not-a-number' }),
			);
			expect(r3.args.confidence).toBe(0.7);
		});

		it('maps memory.decide with reasoning (not rationale) and no status', () => {
			const result = buildToolCall(
				'memory',
				'decide',
				makeGet({
					decision: 'Use OAuth 2.1',
					reasoning: 'Builder-friendly onboarding',
					confidence: 0.95,
					alternatives: 'Plain API keys',
				}),
			);

			expect(result.tool).toBe('nex_decide');
			expect(result.args.decision).toBe('Use OAuth 2.1');
			expect(result.args.reasoning).toBe('Builder-friendly onboarding');
			expect(result.args.alternatives).toBe('Plain API keys');
			expect(result.args.confidence).toBe(0.95);
			expect(result.args.source).toBe('user');
			expect(result.args).not.toHaveProperty('rationale');
			expect(result.args).not.toHaveProperty('status');
		});

		it('memory.decide derives title from decision when not provided', () => {
			const result = buildToolCall(
				'memory',
				'decide',
				makeGet({
					decision: 'Adopt Stripe Connect',
					reasoning: 'Native split-payments support',
				}),
			);
			expect(result.args.title).toBe('Adopt Stripe Connect');
		});

		it('memory.decide truncates derived title at 80 chars', () => {
			const longDecision =
				'A very long decision that exceeds eighty characters for sure ' +
				'because we want to test truncation behaviour properly';
			const result = buildToolCall(
				'memory',
				'decide',
				makeGet({
					decision: longDecision,
					reasoning: 'because',
				}),
			);
			expect((result.args.title as string).length).toBeLessThanOrEqual(80);
			expect(result.args.decision).toBe(longDecision);
		});

		it('memory.decide uses explicit title when provided', () => {
			const result = buildToolCall(
				'memory',
				'decide',
				makeGet({
					title: 'OAuth Decision',
					decision: 'Use OAuth',
					reasoning: 'security',
				}),
			);
			expect(result.args.title).toBe('OAuth Decision');
		});
	});

	describe('Entity resource', () => {
		it('maps entity.create to nex_entity_create with entities[] array shape', () => {
			const result = buildToolCall(
				'entity',
				'create',
				makeGet({
					name: 'Acme Bot',
					entityType: 'project',
					project: 'voice-bot',
					observations: 'First obs\nSecond obs\n\n  Third obs  ',
				}),
			);

			expect(result.tool).toBe('nex_entity_create');
			// Server schema requires { entities: [{...}] } not flat
			expect(result.args).toHaveProperty('entities');
			expect(Array.isArray(result.args.entities)).toBe(true);
			const entity = (result.args.entities as Array<Record<string, unknown>>)[0];
			expect(entity.name).toBe('Acme Bot');
			expect(entity.entityType).toBe('project');
			expect(entity.project).toBe('voice-bot');
			// Observations are objects { content, source }, not strings
			expect(entity.observations).toEqual([
				{ content: 'First obs', source: 'n8n' },
				{ content: 'Second obs', source: 'n8n' },
				{ content: 'Third obs', source: 'n8n' },
			]);
			// `aliases` is not part of the server schema
			expect(entity).not.toHaveProperty('aliases');
		});

		it('entity.create handles empty observations gracefully', () => {
			const result = buildToolCall(
				'entity',
				'create',
				makeGet({ name: 'Acme', entityType: 'project' }),
			);
			const entity = (result.args.entities as Array<Record<string, unknown>>)[0];
			expect(entity.observations).toEqual([]);
		});

		it('maps entity.observe with per-observation entityName + content', () => {
			const result = buildToolCall(
				'entity',
				'observe',
				makeGet({
					entityRef: 'Acme Bot',
					observations: 'Observation one\nObservation two',
				}),
			);

			expect(result.tool).toBe('nex_entity_observe');
			expect(result.args).toHaveProperty('observations');
			expect(result.args.observations).toEqual([
				{ entityName: 'Acme Bot', content: 'Observation one', source: 'n8n' },
				{ entityName: 'Acme Bot', content: 'Observation two', source: 'n8n' },
			]);
			// Server schema does not accept a top-level entityRef
			expect(result.args).not.toHaveProperty('entityRef');
		});

		it('maps entity.relate with relations[] array shape and fromName/toName', () => {
			const result = buildToolCall(
				'entity',
				'relate',
				makeGet({
					fromEntity: 'Acme Bot',
					toEntity: 'Anthropic Claude',
					relationType: 'integrates_with',
					evidence: 'Mentioned in kickoff',
				}),
			);

			expect(result.tool).toBe('nex_entity_relate');
			expect(Array.isArray(result.args.relations)).toBe(true);
			const rel = (result.args.relations as Array<Record<string, unknown>>)[0];
			expect(rel.fromName).toBe('Acme Bot');
			expect(rel.toName).toBe('Anthropic Claude');
			expect(rel.relationType).toBe('integrates_with');
			expect(rel.evidence).toBe('Mentioned in kickoff');
			// Field names are fromName/toName, not fromEntity/toEntity
			expect(rel).not.toHaveProperty('fromEntity');
			expect(rel).not.toHaveProperty('toEntity');
		});

		it('entity.relate resolves custom relation type correctly', () => {
			const result = buildToolCall(
				'entity',
				'relate',
				makeGet({
					fromEntity: 'Acme Bot',
					toEntity: 'Stripe',
					relationType: 'custom',
					relationTypeCustom: 'sponsors',
				}),
			);
			const rel = (result.args.relations as Array<Record<string, unknown>>)[0];
			expect(rel.relationType).toBe('sponsors');
		});

		it('maps entity.search with query + entityType + limit', () => {
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

		it('maps entity.open with `name` field (NOT entityRef)', () => {
			const result = buildToolCall(
				'entity',
				'open',
				makeGet({ entityRef: 'Acme Bot' }),
			);
			expect(result.tool).toBe('nex_entity_open');
			expect(result.args.name).toBe('Acme Bot');
			// Server schema only knows `name` and `names`
			expect(result.args).not.toHaveProperty('entityRef');
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

		it('maps session.end with sessionId + summary', () => {
			const result = buildToolCall(
				'session',
				'end',
				makeGet({ sessionId: 'abc-123', summary: 'done' }),
			);
			expect(result.tool).toBe('nex_session_end');
			expect(result.args.sessionId).toBe('abc-123');
			expect(result.args.summary).toBe('done');
		});

		it('maps session.recallTimeline with days + limit + project', () => {
			const result = buildToolCall(
				'session',
				'recallTimeline',
				makeGet({ days: 14, limit: 75, project: 'voice-bot' }),
			);
			expect(result.tool).toBe('nex_recall_timeline');
			expect(result.args.days).toBe(14);
			expect(result.args.limit).toBe(75);
			expect(result.args.project).toBe('voice-bot');
		});
	});

	describe('Insight resource', () => {
		it('insight.synthesize with topic uses action=search', () => {
			const result = buildToolCall(
				'insight',
				'synthesize',
				makeGet({ query: 'auth', category: 'pattern' }),
			);
			expect(result.tool).toBe('nex_synthesize');
			expect(result.args.action).toBe('search');
			expect(result.args.topic).toBe('auth');
			expect(result.args.category).toBe('pattern');
		});

		it('insight.synthesize without topic uses action=generate', () => {
			const result = buildToolCall(
				'insight',
				'synthesize',
				makeGet({ category: 'pattern' }),
			);
			expect(result.args.action).toBe('generate');
			expect(result.args.topic).toBeUndefined();
		});

		it('maps insight.reflect with scope=all + days', () => {
			const result = buildToolCall(
				'insight',
				'reflect',
				makeGet({ days: 30 }),
			);
			expect(result.tool).toBe('nex_reflect');
			expect(result.args.scope).toBe('all');
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
			const entity = (result.args.entities as Array<Record<string, unknown>>)[0];
			expect(entity.observations).toEqual([
				{ content: 'one', source: 'n8n' },
				{ content: 'two', source: 'n8n' },
				{ content: 'three', source: 'n8n' },
			]);
		});
	});
});
