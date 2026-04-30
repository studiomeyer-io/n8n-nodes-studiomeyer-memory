# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-30

Initial release. Released after a full agent-code-review (Analyst + Critic +
Research) hardening round — the version below already incorporates every
Round-2 finding before the first npm publish.

### Added

- `StudioMeyerMemory` node with four resources:
  - **Memory**: Search, Recall, Learn, Decide
  - **Entity**: Create, Observe, Search, Relate, Open
  - **Session**: Start, End, Recall Timeline
  - **Insight**: Synthesize, Reflect, Proactive Briefing
- `StudioMeyerMemoryApi` credential with two auth modes:
  - API Key (paste from dashboard)
  - OAuth 2.1 with PKCE access token
- Configurable server URL for self-hosted deployments, plus opt-in
  `Allow Private Network` flag for in-cluster setups.
- Per-call request timeout (default 30 s, max 5 min) backed by
  `AbortController`.
- 5 MB hard cap on parsed text responses with truncation marker.
- Connects to MCP Streamable HTTP endpoint at `/mcp` via
  `@modelcontextprotocol/sdk`.
- TypeScript strict mode, 58 vitest unit tests covering tool-call mapping,
  result parsing, SSRF guard branches, confidence clamping, and Windows
  line-ending edge cases.
- GitHub Actions workflows: `ci.yml` (lint + typecheck + test + build on
  Node 20.15 + 22), `publish.yml` (npm publish with provenance on tag
  push, n8n Verified Community Nodes requirement effective May 1, 2026).

### Hardened (agent-code-review Round 2)

- Tool argument shapes verified against the upstream MCP server schemas
  (`mcp-nex` v3.16.10) — the following operations were corrected before
  shipping:
  - `entity.create` now sends the required `entities[]` envelope with
    `observations: [{ content, source }]` — the previous flat shape and
    the unsupported `aliases` field would have failed at runtime.
  - `entity.observe` now sends `observations: [{ entityName, content,
    source }]` — the previous top-level `entityRef` was rejected.
  - `entity.relate` now sends the `relations[]` envelope with
    `fromName` / `toName` — the previous `fromEntity` / `toEntity` keys
    did not exist on the server.
  - `entity.open` now uses `name` — the previous `entityRef` did not
    exist on the server.
  - `memory.decide` sends `reasoning` (not `rationale`), auto-derives a
    `title`, and removes the unsupported `status` field.
  - `memory.learn` removes the unsupported `importance` field; UI now
    exposes the supported `confidence` slider.
  - `insight.synthesize` sends the required `action` and uses `topic`.
- SSRF guard: `buildMcpEndpoint` rejects `file://`, `gopher://`, and
  other non-http(s) protocols; rejects loopback, RFC1918, link-local
  (169.254.x — incl. AWS / GCP / Azure metadata), `.local` and
  `.internal` hostnames unless `Allow Private Network` is enabled.
- Empty / whitespace-only Server URL is now rejected with a clear error.

### Deferred

- AI-Agent Memory Sub-Node (planned for v0.2 — needs live Langchain
  interface validation against the current n8n AI Agent node).
- Connection reuse across items via a shared MCP client (planned
  alongside v0.2 once the SDK exposes a stable hook).
- Bundle `@modelcontextprotocol/sdk` into the published artifact for the
  Verified Community Nodes "Zero Runtime Dependencies" requirement
  (planned before formal Verified-submission; not blocking initial
  install).
- Workflow templates for the n8n marketplace (planned alongside v0.2).
