import type { INodeProperties } from 'n8n-workflow';

/**
 * Entity resource: knowledge graph operations.
 *
 * Maps to the canonical Nex tools:
 *   Create   → nex_entity_create
 *   Observe  → nex_entity_observe
 *   Search   → nex_entity_search
 *   Relate   → nex_entity_relate
 *   Open     → nex_entity_open
 */

export const entityOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['entity'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create an entity',
				description:
					'Add a person, project, service, or concept to the knowledge graph',
			},
			{
				name: 'Observe',
				value: 'observe',
				action: 'Observe an entity',
				description: 'Append facts, attributes, or context to an existing entity',
			},
			{
				name: 'Open',
				value: 'open',
				action: 'Open an entity',
				description: 'Get the full record for one entity by name or ID',
			},
			{
				name: 'Relate',
				value: 'relate',
				action: 'Relate two entities',
				description:
					'Connect entities (uses, depends_on, competes_with, owns, mentions)',
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search entities',
				description: 'Fuzzy search across entity names and observations',
			},
		],
		default: 'search',
	},
];

const ENTITY_TYPES = [
	{ name: 'Person', value: 'person' },
	{ name: 'Project', value: 'project' },
	{ name: 'Service', value: 'service' },
	{ name: 'Tool', value: 'tool' },
	{ name: 'Customer', value: 'customer' },
	{ name: 'Customer Project', value: 'customer-project' },
	{ name: 'Reference', value: 'reference' },
	{ name: 'Component', value: 'component' },
	{ name: 'Feature', value: 'feature' },
	{ name: 'System', value: 'system' },
	{ name: 'Infrastructure', value: 'infrastructure' },
	{ name: 'Decision', value: 'decision' },
	{ name: 'Strategy', value: 'strategy' },
	{ name: 'Concept', value: 'concept' },
	{ name: 'Other', value: 'other' },
];

export const entityFields: INodeProperties[] = [
	// ─── Create ──────────────────────────────────────────────
	{
		displayName: 'Entity Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'Acme Customer Support Bot',
		description: 'Unique name for this entity (case-insensitive)',
		displayOptions: { show: { resource: ['entity'], operation: ['create'] } },
	},
	{
		displayName: 'Entity Type',
		name: 'entityType',
		type: 'options',
		options: ENTITY_TYPES,
		default: 'project',
		displayOptions: { show: { resource: ['entity'], operation: ['create'] } },
	},
	{
		displayName: 'Project',
		name: 'project',
		type: 'string',
		default: '',
		placeholder: 'my-saas-bot',
		description: 'Project this entity belongs to (optional)',
		displayOptions: { show: { resource: ['entity'], operation: ['create'] } },
	},
	{
		displayName: 'Initial Observations',
		name: 'observations',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		placeholder: 'One observation per line',
		description:
			'One observation per line. Each line is stored as a separate fact about the entity.',
		displayOptions: { show: { resource: ['entity'], operation: ['create'] } },
	},

	// ─── Observe ─────────────────────────────────────────────
	{
		displayName: 'Entity Name',
		name: 'entityRef',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'Acme Customer Support Bot',
		description:
			'Entity name (fuzzy-resolved). All observations on this run are attached to this entity.',
		displayOptions: { show: { resource: ['entity'], operation: ['observe', 'open'] } },
	},
	{
		displayName: 'Observations',
		name: 'observations',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		placeholder: 'One observation per line',
		description: 'One observation per line. Each line becomes a separate fact.',
		displayOptions: { show: { resource: ['entity'], operation: ['observe'] } },
	},

	// ─── Search ──────────────────────────────────────────────
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'support bot',
		description: 'Fuzzy search across entity names and observations',
		displayOptions: { show: { resource: ['entity'], operation: ['search'] } },
	},
	{
		displayName: 'Entity Type Filter',
		name: 'entityType',
		type: 'options',
		options: [{ name: 'Any', value: '' }, ...ENTITY_TYPES],
		default: '',
		description: 'Limit results to a single entity type',
		displayOptions: { show: { resource: ['entity'], operation: ['search'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		default: 50,
		displayOptions: { show: { resource: ['entity'], operation: ['search'] } },
	},

	// ─── Relate ──────────────────────────────────────────────
	{
		displayName: 'From Entity',
		name: 'fromEntity',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'Acme Customer Support Bot',
		description: 'Source entity (name or UUID)',
		displayOptions: { show: { resource: ['entity'], operation: ['relate'] } },
	},
	{
		displayName: 'Relation Type',
		name: 'relationType',
		type: 'options',
		options: [
			{ name: 'Competes With', value: 'competes_with' },
			{ name: 'Contains', value: 'contains' },
			{ name: 'Custom', value: 'custom' },
			{ name: 'Depends On', value: 'depends_on' },
			{ name: 'Integrates With', value: 'integrates_with' },
			{ name: 'Located In', value: 'located_in' },
			{ name: 'Manages', value: 'manages' },
			{ name: 'Mentions', value: 'mentions' },
			{ name: 'Owns', value: 'owns' },
			{ name: 'Replaces', value: 'replaces' },
			{ name: 'Uses', value: 'uses' },
			{ name: 'Works For', value: 'works_for' },
		],
		default: 'uses',
		displayOptions: { show: { resource: ['entity'], operation: ['relate'] } },
	},
	{
		displayName: 'Custom Relation Type',
		name: 'relationTypeCustom',
		type: 'string',
		default: '',
		placeholder: 'sponsors',
		description: 'Free-form relation type (lowercase, snake_case)',
		displayOptions: {
			show: {
				resource: ['entity'],
				operation: ['relate'],
				relationType: ['custom'],
			},
		},
	},
	{
		displayName: 'To Entity',
		name: 'toEntity',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'Anthropic Claude',
		description: 'Target entity (name or UUID)',
		displayOptions: { show: { resource: ['entity'], operation: ['relate'] } },
	},
	{
		displayName: 'Evidence',
		name: 'evidence',
		type: 'string',
		default: '',
		placeholder: 'Customer mentioned the integration in the kickoff call',
		description: 'Optional human-readable note explaining the relationship',
		displayOptions: { show: { resource: ['entity'], operation: ['relate'] } },
	},
];
