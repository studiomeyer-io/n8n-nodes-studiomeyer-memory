import {
	ApplicationError,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { callMemoryTool, prepareCallSession, pruneArgs } from './McpClient';
import { memoryFields, memoryOperations } from './descriptions/MemoryDescription';
import { entityFields, entityOperations } from './descriptions/EntityDescription';
import { sessionFields, sessionOperations } from './descriptions/SessionDescription';
import { insightFields, insightOperations } from './descriptions/InsightDescription';

interface CredentialsShape {
	baseUrl: string;
	authMode: 'apiKey' | 'oauth2';
	apiKey?: string;
	accessToken?: string;
	allowPrivateNetwork?: boolean;
	requestTimeoutMs?: number;
}

/**
 * StudioMeyer Memory main node.
 *
 * Four resources: Memory, Entity, Session, Insight. Each maps to a small
 * subset of the underlying nex_* MCP tools. Auth + transport is handled
 * by McpClient.callMemoryTool.
 */
export class StudioMeyerMemory implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'StudioMeyer Memory',
		name: 'studioMeyerMemory',
		icon: 'file:studiomeyer.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description:
			'Long-term AI memory with knowledge graph, semantic search, entity tracking, and session continuity. Powered by StudioMeyer Memory.',
		defaults: { name: 'StudioMeyer Memory' },
		// String literals avoid the runtime-vs-type ambiguity of NodeConnectionType
		// while remaining accepted by the n8n loader (verified against
		// n8n-nodes-starter examples).
		inputs: ['main'] as const as never,
		outputs: ['main'] as const as never,
		credentials: [
			{
				name: 'studioMeyerMemoryApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Memory', value: 'memory' },
					{ name: 'Entity', value: 'entity' },
					{ name: 'Session', value: 'session' },
					{ name: 'Insight', value: 'insight' },
				],
				default: 'memory',
			},
			...memoryOperations,
			...memoryFields,
			...entityOperations,
			...entityFields,
			...sessionOperations,
			...sessionFields,
			...insightOperations,
			...insightFields,
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = (await this.getCredentials(
			'studioMeyerMemoryApi',
		)) as unknown as CredentialsShape;

		// Validate credentials + resolve URL ONCE per execute(). The session
		// object is reused for every item so we don't pay the URL-validation
		// cost (incl. SSRF check) per row in a batch workflow.
		const session = prepareCallSession(this, credentials);

		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				const { tool, args } = buildToolCall(
					resource,
					operation,
					(name: string, fallback?: unknown) =>
						this.getNodeParameter(name, i, fallback as never) as unknown,
				);

				const data = await callMemoryTool(this, session, tool, pruneArgs(args));

				results.push({
					json:
						typeof data === 'object' && data !== null && !Array.isArray(data)
							? (data as IDataObject)
							: ({ value: data } as IDataObject),
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					results.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [results];
	}
}

type ParamGetter = (name: string, fallback?: unknown) => unknown;

interface ToolCall {
	tool: string;
	args: Record<string, unknown>;
}

/**
 * Map (resource, operation) to the underlying MCP tool name + argument shape.
 *
 * Pulled out of the node class so it can be unit-tested without an
 * IExecuteFunctions mock.
 */
export function buildToolCall(
	resource: string,
	operation: string,
	getParam: ParamGetter,
): ToolCall {
	const r = `${resource}.${operation}`;

	switch (r) {
		// ─── Memory ──────────────────────────────────────────
		case 'memory.search':
			return {
				tool: 'nex_search',
				args: {
					query: getParam('query') as string,
					limit: getParam('limit', 20),
					project: getParam('project', '') as string,
					types: getParam('types', []) as string[],
					recencyWeight: getParam('recencyWeight', 0.3),
				},
			};

		case 'memory.recall':
			// nex_recall takes only `query` + `limit`. `project` is silently
			// ignored server-side (verified S947 against schema).
			return {
				tool: 'nex_recall',
				args: {
					query: getParam('query') as string,
					limit: getParam('limit', 20),
				},
			};

		case 'memory.learn':
			// nex_learn does not accept `importance` — the server schema only
			// knows confidence + memoryType + source (verified S947).
			return {
				tool: 'nex_learn',
				args: {
					content: getParam('content') as string,
					category: getParam('category', 'insight') as string,
					project: getParam('project', '') as string,
					tags: parseCsv(getParam('tags', '') as string),
					confidence: clampConfidence(getParam('confidence', 0.7)),
					source: 'session',
				},
			};

		case 'memory.decide': {
			// nex_decide expects `reasoning` (not `rationale`) and has no
			// `status` field. Optional `title` + `alternatives` available.
			const decisionText = getParam('decision') as string;
			return {
				tool: 'nex_decide',
				args: {
					title: deriveTitle(getParam('title', '') as string, decisionText),
					decision: decisionText,
					reasoning: getParam('reasoning') as string,
					alternatives: getParam('alternatives', '') as string,
					project: getParam('project', '') as string,
					confidence: clampConfidence(getParam('confidence', 0.8)),
					source: 'user',
				},
			};
		}

		// ─── Entity ──────────────────────────────────────────
		case 'entity.create': {
			// nex_entity_create expects { entities: [{ name, entityType,
			// observations: [{ content, source? }] }] } — array form, not flat.
			// `aliases` does NOT exist in the server schema (verified S947).
			const entityName = getParam('name') as string;
			const observationLines = parseLines(getParam('observations', '') as string);
			return {
				tool: 'nex_entity_create',
				args: {
					entities: [
						{
							name: entityName,
							entityType: getParam('entityType', 'project') as string,
							project: getParam('project', '') as string,
							observations: observationLines.map((content) => ({
								content,
								source: 'n8n',
							})),
						},
					],
				},
			};
		}

		case 'entity.observe': {
			// nex_entity_observe expects { observations: [{ entityName | entityId,
			// content, source? }] }. Per-observation entity reference, not a
			// shared entityRef. We accept the previous "entityRef" UI field name
			// and route it as entityName for fuzzy matching server-side.
			const entityRef = getParam('entityRef') as string;
			return {
				tool: 'nex_entity_observe',
				args: {
					observations: parseLines(
						getParam('observations') as string,
					).map((content) => ({
						entityName: entityRef,
						content,
						source: 'n8n',
					})),
				},
			};
		}

		case 'entity.search':
			return {
				tool: 'nex_entity_search',
				args: {
					query: getParam('query') as string,
					entityType: getParam('entityType', '') as string,
					limit: getParam('limit', 10),
				},
			};

		case 'entity.relate': {
			// nex_entity_relate expects { relations: [{ fromName | fromEntityId,
			// toName | toEntityId, relationType, evidence?, validFrom?, ... }] }
			// Field names changed from fromEntity/toEntity to fromName/toName.
			const relationType = getParam('relationType', 'uses') as string;
			const resolvedRelation =
				relationType === 'custom'
					? (getParam('relationTypeCustom', '') as string)
					: relationType;
			return {
				tool: 'nex_entity_relate',
				args: {
					relations: [
						{
							fromName: getParam('fromEntity') as string,
							toName: getParam('toEntity') as string,
							relationType: resolvedRelation,
							evidence: getParam('evidence', '') as string,
						},
					],
				},
			};
		}

		case 'entity.open':
			// nex_entity_open uses `name` (single) or `names` (array).
			// `entityRef` does not exist (verified S947).
			return {
				tool: 'nex_entity_open',
				args: { name: getParam('entityRef') as string },
			};

		// ─── Session ─────────────────────────────────────────
		case 'session.start':
			return {
				tool: 'nex_session_start',
				args: {
					project: getParam('project', '') as string,
					agentId: getParam('agentId', '') as string,
				},
			};

		case 'session.end':
			return {
				tool: 'nex_session_end',
				args: {
					sessionId: getParam('sessionId') as string,
					summary: getParam('summary', '') as string,
				},
			};

		case 'session.recallTimeline':
			return {
				tool: 'nex_recall_timeline',
				args: {
					days: getParam('days', 7),
					limit: getParam('limit', 50),
					project: getParam('project', '') as string,
				},
			};

		// ─── Insight ─────────────────────────────────────────
		case 'insight.synthesize': {
			// nex_synthesize requires `action`. `query` maps to `topic` for
			// the search action; otherwise generate is the default that
			// clusters all matching learnings.
			const topic = getParam('query', '') as string;
			return {
				tool: 'nex_synthesize',
				args: {
					action: topic ? 'search' : 'generate',
					topic: topic || undefined,
					category: getParam('category', '') as string,
				},
			};
		}

		case 'insight.reflect':
			// nex_reflect takes scope + days + project + category (verified S947).
			return {
				tool: 'nex_reflect',
				args: {
					scope: 'all',
					days: getParam('days', 7),
					project: getParam('project', '') as string,
				},
			};

		case 'insight.proactive':
			return {
				tool: 'nex_proactive',
				args: { project: getParam('project', '') as string },
			};

		default:
			throw new ApplicationError(`Unsupported resource/operation: ${r}`);
	}
}

function parseCsv(input: string): string[] {
	if (!input || typeof input !== 'string') return [];
	return input
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function parseLines(input: string): string[] {
	if (!input || typeof input !== 'string') return [];
	return input
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Coerce confidence to a server-accepted [0, 1] number. */
function clampConfidence(input: unknown): number {
	const n = typeof input === 'number' ? input : Number(input);
	if (!Number.isFinite(n)) return 0.7;
	return Math.min(1, Math.max(0, n));
}

/**
 * The server treats `title` as a short label. If the user did not provide
 * one, derive a sensible fallback from the decision text (first 80 chars).
 */
function deriveTitle(explicit: string, decisionText: string): string {
	const provided = (explicit || '').trim();
	if (provided.length > 0) return provided.slice(0, 500);
	const fallback = (decisionText || '').trim().split(/\r?\n/)[0];
	return fallback.slice(0, 80) || 'Decision';
}
