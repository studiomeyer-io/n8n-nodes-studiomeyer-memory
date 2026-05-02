import type { INodeProperties } from 'n8n-workflow';

/**
 * Session resource: start, end, and replay agent sessions.
 *
 * Maps to:
 *   Start          → nex_session_start
 *   End            → nex_session_end
 *   RecallTimeline → nex_recall_timeline
 */

export const sessionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['session'] } },
		options: [
			{
				name: 'Start',
				value: 'start',
				action: 'Start a new agent session and load context',
				description:
					'Returns the session ID + auto-loaded context (sprint, recent decisions, top learnings)',
			},
			{
				name: 'End',
				value: 'end',
				action: 'End the current session and persist a summary',
				description: 'Closes a session and writes the final summary',
			},
			{
				name: 'Recall Timeline',
				value: 'recallTimeline',
				action: 'Return a chronological timeline of recent activity',
				description: 'Recent learnings, decisions, and sessions in time order',
			},
		],
		default: 'start',
	},
];

export const sessionFields: INodeProperties[] = [
	// ─── Start ──────────────────────────────────────────────
	{
		displayName: 'Project',
		name: 'project',
		type: 'string',
		default: '',
		placeholder: 'customer-support-bot',
		description: 'Scope this session to a single project',
		displayOptions: {
			show: { resource: ['session'], operation: ['start', 'recallTimeline'] },
		},
	},
	{
		displayName: 'Agent ID',
		name: 'agentId',
		type: 'string',
		default: '',
		placeholder: 'voice-agent-prod',
		description:
			'Agent identifier for multi-agent setups. Sessions are scoped per agent.',
		displayOptions: { show: { resource: ['session'], operation: ['start'] } },
	},

	// ─── End ────────────────────────────────────────────────
	{
		displayName: 'Session ID',
		name: 'sessionId',
		type: 'string',
		default: '',
		required: true,
		placeholder: '45984645-bf8a-4232-9ae1-2f0a96c56aac',
		description: 'UUID returned by the Session Start operation',
		displayOptions: { show: { resource: ['session'], operation: ['end'] } },
	},
	{
		displayName: 'Summary',
		name: 'summary',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description:
			'Optional summary text. If omitted, the server auto-generates one from observations.',
		displayOptions: { show: { resource: ['session'], operation: ['end'] } },
	},

	// ─── Recall Timeline ────────────────────────────────────
	{
		displayName: 'Days',
		name: 'days',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 90 },
		default: 7,
		description: 'Look back N days',
		displayOptions: {
			show: { resource: ['session'], operation: ['recallTimeline'] },
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		default: 50,
		displayOptions: {
			show: { resource: ['session'], operation: ['recallTimeline'] },
		},
	},
];
