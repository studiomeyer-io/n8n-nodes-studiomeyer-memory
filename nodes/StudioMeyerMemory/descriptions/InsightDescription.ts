import type { INodeProperties } from 'n8n-workflow';

/**
 * Insight resource — higher-level synthesis on top of stored memory.
 *
 * Maps to:
 *   Synthesize → nex_synthesize
 *   Reflect    → nex_reflect
 *   Proactive  → nex_proactive
 */

export const insightOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['insight'] } },
		options: [
			{
				name: 'Proactive Briefing',
				value: 'proactive',
				action: 'Get a proactive briefing',
				description:
					'A status briefing for the current memory state — useful at session start',
			},
			{
				name: 'Reflect',
				value: 'reflect',
				action: 'Reflect on recent activity',
				description:
					'Review the last N days for emerging patterns, contradictions, and recurring themes',
			},
			{
				name: 'Synthesize',
				value: 'synthesize',
				action: 'Synthesize a topic',
				description: 'Cluster recent learnings into a higher-level insight',
			},
		],
		default: 'proactive',
	},
];

export const insightFields: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		placeholder: 'authentication patterns',
		description: 'Topic to synthesize around (empty = synthesize all recent)',
		displayOptions: { show: { resource: ['insight'], operation: ['synthesize'] } },
	},
	{
		displayName: 'Project',
		name: 'project',
		type: 'string',
		default: '',
		description: 'Limit to a single project',
		displayOptions: {
			show: {
				resource: ['insight'],
				operation: ['synthesize', 'reflect', 'proactive'],
			},
		},
	},
	{
		displayName: 'Category',
		name: 'category',
		type: 'options',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Architecture', value: 'architecture' },
			{ name: 'Insight', value: 'insight' },
			{ name: 'Mistake', value: 'mistake' },
			{ name: 'Pattern', value: 'pattern' },
			{ name: 'Research', value: 'research' },
			{ name: 'Workflow', value: 'workflow' },
		],
		default: '',
		description: 'Filter the input set by learning category',
		displayOptions: {
			show: { resource: ['insight'], operation: ['synthesize'] },
		},
	},
	{
		displayName: 'Days',
		name: 'days',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 90 },
		default: 7,
		description: 'Look back N days',
		displayOptions: { show: { resource: ['insight'], operation: ['reflect'] } },
	},
];
