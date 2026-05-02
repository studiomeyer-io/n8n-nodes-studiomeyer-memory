import type { INodeProperties } from 'n8n-workflow';

/**
 * Memory resource: the four primary write/read operations.
 *
 * Maps to the canonical Nex tools:
 *   Search  → nex_search
 *   Learn   → nex_learn
 *   Recall  → nex_recall
 *   Decide  → nex_decide
 */

export const memoryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['memory'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search memory',
				description: 'Unified semantic + keyword search with temporal decay',
			},
			{
				name: 'Learn',
				value: 'learn',
				action: 'Learn a fact',
				description: 'Add a learning to long-term memory with category + tags',
			},
			{
				name: 'Recall',
				value: 'recall',
				action: 'Recall memory',
				description: 'Lightweight full-text recall across decisions, learnings, sessions',
			},
			{
				name: 'Decide',
				value: 'decide',
				action: 'Record a decision',
				description: 'Persist a decision so future sessions can revisit it',
			},
		],
		default: 'search',
	},
];

export const memoryFields: INodeProperties[] = [
	// ─── Search ──────────────────────────────────────────────
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'authentication setup last week',
		description: 'Search query, fuzzy matching, no need for exact wording',
		displayOptions: {
			show: { resource: ['memory'], operation: ['search', 'recall'] },
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['memory'], operation: ['search', 'recall'] },
		},
	},
	{
		displayName: 'Project Filter',
		name: 'project',
		type: 'string',
		default: '',
		placeholder: 'my-saas-bot',
		description: 'Filter results to a single project',
		displayOptions: {
			show: { resource: ['memory'], operation: ['search', 'recall'] },
		},
	},
	{
		displayName: 'Result Types',
		name: 'types',
		type: 'multiOptions',
		options: [
			{ name: 'Decisions', value: 'decision' },
			{ name: 'Entities', value: 'entity' },
			{ name: 'Learnings', value: 'learning' },
			{ name: 'Sessions', value: 'session' },
			{ name: 'Skills', value: 'skill' },
		],
		default: [],
		description: 'Restrict to specific memory types (empty = all)',
		displayOptions: { show: { resource: ['memory'], operation: ['search'] } },
	},
	{
		displayName: 'Recency Weight',
		name: 'recencyWeight',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
		default: 0.3,
		description:
			'How much recency matters: 0 = relevance only, 1 = recency only',
		displayOptions: { show: { resource: ['memory'], operation: ['search'] } },
	},

	// ─── Learn ────────────────────────────────────────────────
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		placeholder: 'User prefers dark mode and never wants email notifications.',
		description: 'The fact, pattern, or insight to remember',
		displayOptions: { show: { resource: ['memory'], operation: ['learn'] } },
	},
	{
		displayName: 'Category',
		name: 'category',
		type: 'options',
		options: [
			{ name: 'Architecture', value: 'architecture' },
			{ name: 'Insight', value: 'insight' },
			{ name: 'Mistake', value: 'mistake' },
			{ name: 'Pattern', value: 'pattern' },
			{ name: 'Reference', value: 'reference' },
			{ name: 'Research', value: 'research' },
			{ name: 'Workflow', value: 'workflow' },
		],
		default: 'insight',
		description: 'Type of learning. Drives downstream filtering.',
		displayOptions: { show: { resource: ['memory'], operation: ['learn'] } },
	},
	{
		displayName: 'Project',
		name: 'project',
		type: 'string',
		default: '',
		placeholder: 'my-saas-bot',
		description: 'Project this learning belongs to (optional)',
		displayOptions: { show: { resource: ['memory'], operation: ['learn'] } },
	},
	{
		displayName: 'Tags',
		name: 'tags',
		type: 'string',
		default: '',
		placeholder: 'authentication,must-read',
		description: 'Comma-separated tags',
		displayOptions: { show: { resource: ['memory'], operation: ['learn'] } },
	},
	{
		displayName: 'Confidence',
		name: 'confidence',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
		default: 0.7,
		description:
			'Confidence 0 to 1. Below 0.5 marks the learning as low-trust. Default 0.7.',
		displayOptions: { show: { resource: ['memory'], operation: ['learn'] } },
	},

	// ─── Decide ────────────────────────────────────────────────
	{
		displayName: 'Decision',
		name: 'decision',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		required: true,
		placeholder: 'Use OAuth 2.1 over plain API keys for the public landing page',
		description: 'The decision being made (one sentence)',
		displayOptions: { show: { resource: ['memory'], operation: ['decide'] } },
	},
	{
		displayName: 'Reasoning',
		name: 'reasoning',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		description: 'Why this decision. The rationale future sessions will read.',
		displayOptions: { show: { resource: ['memory'], operation: ['decide'] } },
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		placeholder: 'Auto-derived from decision text if empty',
		description: 'Short label (max 500 chars). Auto-derived from the decision if omitted.',
		displayOptions: { show: { resource: ['memory'], operation: ['decide'] } },
	},
	{
		displayName: 'Alternatives',
		name: 'alternatives',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		description: 'What other options existed. Useful for revisiting later.',
		displayOptions: { show: { resource: ['memory'], operation: ['decide'] } },
	},
	{
		displayName: 'Project',
		name: 'project',
		type: 'string',
		default: '',
		description: 'Project this decision belongs to',
		displayOptions: { show: { resource: ['memory'], operation: ['decide'] } },
	},
	{
		displayName: 'Confidence',
		name: 'confidence',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
		default: 0.8,
		description:
			'Confidence 0 to 1. 0.9+ = CONFIRMED (user said it explicitly), 0.5-0.8 = INFERRED (derived from context), below 0.5 = EXPERIMENTAL.',
		displayOptions: { show: { resource: ['memory'], operation: ['decide'] } },
	},
];
