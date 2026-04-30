import {
	ApplicationError,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { callMemoryTool, pruneArgs } from './McpClient';
import { memoryFields, memoryOperations } from './descriptions/MemoryDescription';
import { entityFields, entityOperations } from './descriptions/EntityDescription';
import { sessionFields, sessionOperations } from './descriptions/SessionDescription';
import { insightFields, insightOperations } from './descriptions/InsightDescription';

interface CredentialsShape {
	baseUrl: string;
	authMode: 'apiKey' | 'oauth2';
	apiKey?: string;
	accessToken?: string;
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

				const data = await callMemoryTool(this, credentials, tool, pruneArgs(args));

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
			return {
				tool: 'nex_recall',
				args: {
					query: getParam('query') as string,
					limit: getParam('limit', 20),
					project: getParam('project', '') as string,
				},
			};

		case 'memory.learn':
			return {
				tool: 'nex_learn',
				args: {
					content: getParam('content') as string,
					category: getParam('category', 'insight') as string,
					project: getParam('project', '') as string,
					tags: parseCsv(getParam('tags', '') as string),
					importance: getParam('importance', 'medium') as string,
				},
			};

		case 'memory.decide':
			return {
				tool: 'nex_decide',
				args: {
					decision: getParam('decision') as string,
					rationale: getParam('rationale') as string,
					project: getParam('project', '') as string,
					confidence: getParam('confidence', 0.8),
					status: getParam('status', 'confirmed') as string,
				},
			};

		// ─── Entity ──────────────────────────────────────────
		case 'entity.create':
			return {
				tool: 'nex_entity_create',
				args: {
					name: getParam('name') as string,
					entityType: getParam('entityType', 'project') as string,
					observations: parseLines(getParam('observations', '') as string),
					aliases: parseCsv(getParam('aliases', '') as string),
				},
			};

		case 'entity.observe':
			return {
				tool: 'nex_entity_observe',
				args: {
					entityRef: getParam('entityRef') as string,
					observations: parseLines(getParam('observations') as string),
				},
			};

		case 'entity.search':
			return {
				tool: 'nex_entity_search',
				args: {
					query: getParam('query') as string,
					entityType: getParam('entityType', '') as string,
					limit: getParam('limit', 10),
				},
			};

		case 'entity.relate':
			return {
				tool: 'nex_entity_relate',
				args: {
					fromEntity: getParam('fromEntity') as string,
					toEntity: getParam('toEntity') as string,
					relationType:
						(getParam('relationType', 'uses') as string) === 'custom'
							? (getParam('relationTypeCustom', '') as string)
							: (getParam('relationType', 'uses') as string),
					evidence: getParam('evidence', '') as string,
				},
			};

		case 'entity.open':
			return {
				tool: 'nex_entity_open',
				args: { entityRef: getParam('entityRef') as string },
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
		case 'insight.synthesize':
			return {
				tool: 'nex_synthesize',
				args: {
					query: getParam('query', '') as string,
					project: getParam('project', '') as string,
					category: getParam('category', '') as string,
				},
			};

		case 'insight.reflect':
			return {
				tool: 'nex_reflect',
				args: {
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
