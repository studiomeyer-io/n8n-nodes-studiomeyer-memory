import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * StudioMeyer Memory API credentials.
 *
 * Two auth modes:
 *   - apiKey: paste a key from the dashboard (simple, fastest path)
 *   - oauth2: browser-based OAuth 2.1 + PKCE flow (no copy-paste, ~30 seconds)
 *
 * Both target the same MCP endpoint at memory.studiomeyer.io/mcp.
 * Self-hosted deployments override `baseUrl` (e.g. https://memory.example.com).
 */
export class StudioMeyerMemoryApi implements ICredentialType {
	name = 'studioMeyerMemoryApi';

	displayName = 'StudioMeyer Memory API';

	// eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased
	documentationUrl = 'https://studiomeyer.io/services/memory';

	icon = 'file:studiomeyer.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://memory.studiomeyer.io',
			placeholder: 'https://memory.studiomeyer.io',
			description:
				'Base URL of the Memory server. Use the default for the hosted SaaS, or your own URL for self-hosted deployments.',
			required: true,
		},
		{
			displayName: 'Authentication',
			name: 'authMode',
			type: 'options',
			options: [
				{ name: 'API Key', value: 'apiKey' },
				{ name: 'OAuth 2.1 (Browser Flow)', value: 'oauth2' },
			],
			default: 'apiKey',
			description:
				'API Key is the fastest path: paste a key from your dashboard. OAuth 2.1 opens a browser tab for sign-in (Magic Link, ~30 seconds, no copy-paste).',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: 'sk_live_...',
			description:
				'Get your key from https://memory.studiomeyer.io/dashboard/keys. Free tier includes 1000 learnings + 100 entities.',
			displayOptions: { show: { authMode: ['apiKey'] } },
		},
		{
			displayName: 'OAuth Access Token',
			name: 'accessToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'OAuth 2.1 access token. Use the n8n credential test to start the browser flow.',
			displayOptions: { show: { authMode: ['oauth2'] } },
		},
		{
			displayName: 'Allow Private Network',
			name: 'allowPrivateNetwork',
			type: 'boolean',
			default: false,
			description:
				'Whether to allow private/loopback hostnames (127.0.0.1, RFC1918 ranges, .local, link-local). Off by default to prevent SSRF. Enable for self-hosted Memory inside the same Docker network.',
		},
		{
			displayName: 'Request Timeout (ms)',
			name: 'requestTimeoutMs',
			type: 'number',
			typeOptions: { minValue: 1000, maxValue: 300000 },
			default: 30000,
			description: 'Per-call timeout in milliseconds. Default 30 seconds, max 5 minutes.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization:
					'={{ "Bearer " + ($credentials.authMode === "oauth2" ? $credentials.accessToken : $credentials.apiKey) }}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.baseUrl }}',
			url: '/health',
			method: 'GET',
		},
	};
}
