# n8n-nodes-studiomeyer-memory

Long-term AI memory for n8n agents. Drop-in memory layer with knowledge graph, semantic search, entity tracking, and session continuity. Powered by [StudioMeyer Memory](https://studiomeyer.io/services/memory).

[![npm version](https://img.shields.io/npm/v/n8n-nodes-studiomeyer-memory)](https://www.npmjs.com/package/n8n-nodes-studiomeyer-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What this is

n8n's built-in memory options (Postgres, Redis, Motorhead) handle short-term conversation history but stop there. **StudioMeyer Memory** is a long-term layer:

- **Semantic search** across past decisions, learnings, and sessions
- **Knowledge graph** with typed entities (people, projects, services) and relations
- **Bi-temporal tracking** so you can query "what did we know about X on date Y?"
- **Confidence + decay** so old contradicted facts fade automatically
- **Multi-tenant on Supabase EU** — DSGVO-compliant by default

This community node connects your n8n workflows to a hosted or self-hosted Memory server and exposes the most useful operations as a clean Resource/Operation tree.

## Why this matters

A voice agent that remembers callers across sessions. A customer support bot that knows the customer's preferences from three months ago. A personal assistant that builds a profile of you over years, not minutes. n8n is the perfect glue layer — but it lacks a real long-term memory primitive. This node fills that gap.

## Install

In your n8n instance: **Settings → Community Nodes → Install**

Enter the package name:

```
n8n-nodes-studiomeyer-memory
```

Or via npm in self-hosted setups:

```bash
npm install n8n-nodes-studiomeyer-memory
```

## Quick start

1. **Get an API key.** Free tier covers 1.000 learnings + 100 entities. Sign up at [memory.studiomeyer.io](https://memory.studiomeyer.io).
2. **Add the credential in n8n.** Settings → Credentials → New → "StudioMeyer Memory API". Paste your key.
3. **Drop the StudioMeyer Memory node into a workflow.** Pick a Resource (Memory / Entity / Session / Insight) and an Operation.

## Resources & Operations

### Memory

The four core read/write operations.

| Operation | Maps to | Use case |
|---|---|---|
| **Search** | `nex_search` | Semantic + keyword search across all memory types with temporal decay |
| **Recall** | `nex_recall` | Faster lightweight recall (full-text only) |
| **Learn** | `nex_learn` | Persist a fact, pattern, mistake, or workflow note |
| **Decide** | `nex_decide` | Record a decision with rationale and confidence |

### Entity

Knowledge graph operations.

| Operation | Maps to | Use case |
|---|---|---|
| **Create** | `nex_entity_create` | Add a person, project, service, or concept |
| **Observe** | `nex_entity_observe` | Append observations to an existing entity |
| **Search** | `nex_entity_search` | Fuzzy search across names + observations |
| **Relate** | `nex_entity_relate` | Connect entities (`uses`, `depends_on`, `competes_with`, custom) |
| **Open** | `nex_entity_open` | Fetch one entity with all observations + relations |

### Session

Manage long-running agent sessions.

| Operation | Maps to | Use case |
|---|---|---|
| **Start** | `nex_session_start` | Open a session, load context, get a session ID |
| **End** | `nex_session_end` | Close a session and persist a summary |
| **Recall Timeline** | `nex_recall_timeline` | Chronological view of recent activity |

### Insight

Higher-level synthesis.

| Operation | Maps to | Use case |
|---|---|---|
| **Synthesize** | `nex_synthesize` | Cluster recent learnings into an insight |
| **Reflect** | `nex_reflect` | Surface emerging patterns + contradictions |
| **Proactive Briefing** | `nex_proactive` | Status briefing — stale learnings, open decisions, knowledge gaps |

## Authentication

Two modes, same endpoint:

- **API Key** (default). Paste a key from your dashboard. Fastest path.
- **OAuth 2.1 + PKCE**. Browser-based magic-link sign-in, no copy-paste.

Both modes target `https://memory.studiomeyer.io/mcp`. Set a custom **Server URL** in the credential for self-hosted deployments.

## Recipes

### Voice agent that remembers callers

```
Voice Webhook (Vapi/Retell)
  → Memory: Search (query: caller_phone, types: ["entity", "learning"])
  → AI Agent (with caller context in system prompt)
  → Memory: Learn (content: "Caller X asked about Y, agent answered Z")
```

### Customer support with full ticket history

```
WhatsApp Trigger
  → Entity: Search (query: customer_email, entityType: customer)
  → Entity: Open (entityRef: matched_id)
  → Anthropic Claude (with full customer context)
  → Memory: Learn (tag the ticket outcome)
```

### Personal assistant with long-term memory

```
Telegram Trigger
  → Session: Start (project: telegram-bot, agentId: user_id)
  → Memory: Search (query: telegram_message, recencyWeight: 0.5)
  → AI Agent
  → Memory: Learn (whatever the user just told you)
```

## Pricing

Free tier (1000 learnings + 100 entities) is enough for a single bot in development. Pro is €29/month and lifts the limits. Team is €49/month with multi-agent isolation. See [studiomeyer.io/services/memory](https://studiomeyer.io/services/memory) for the latest pricing.

Self-hosted is free under MIT for the client; the server is source-available with the SaaS-multi-tenant pieces under a separate license. Contact for self-hosted licensing details.

## Roadmap

- **v0.1** (current): Memory / Entity / Session / Insight resources, API Key + OAuth credentials
- **v0.2**: AI-Agent Memory Sub-Node (drops directly into the n8n AI Agent's Memory slot, replacing Postgres / Redis / Motorhead)
- **v0.3**: Streaming support for long search results, batch operations
- **v0.4**: Workflow templates published to n8n.io marketplace

## Development

```bash
git clone https://github.com/studiomeyer-io/n8n-nodes-studiomeyer-memory
cd n8n-nodes-studiomeyer-memory
npm install
npm run build
npm test
```

To test locally in your n8n instance:

```bash
npm link
cd ~/.n8n/custom
npm link n8n-nodes-studiomeyer-memory
n8n start
```

## Contributing

Pull requests welcome. Please open an issue first for non-trivial changes.

## License

MIT — see [LICENSE](LICENSE).

## Links

- [Memory product page](https://studiomeyer.io/services/memory)
- [Live demo (3D knowledge graph)](https://studiomeyer.io/services/memory/demo)
- [API documentation](https://memory.studiomeyer.io)
- [GitHub](https://github.com/studiomeyer-io/n8n-nodes-studiomeyer-memory)
- [npm](https://www.npmjs.com/package/n8n-nodes-studiomeyer-memory)
