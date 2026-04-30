# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-30

### Added

- Initial release.
- `StudioMeyerMemory` node with four resources:
  - **Memory**: Search, Recall, Learn, Decide
  - **Entity**: Create, Observe, Search, Relate, Open
  - **Session**: Start, End, Recall Timeline
  - **Insight**: Synthesize, Reflect, Proactive Briefing
- `StudioMeyerMemoryApi` credential with two auth modes:
  - API Key (paste from dashboard)
  - OAuth 2.1 with PKCE access token
- Connects to MCP Streamable HTTP endpoint at `/mcp`
- Configurable server URL for self-hosted deployments
- TypeScript strict mode, vitest unit tests for tool-call mapping + result parsing
- GitHub Actions workflow with npm provenance attestation
  (n8n Verified Community Nodes requirement effective May 1, 2026)

### Deferred

- AI-Agent Memory Sub-Node (planned for v0.2 — needs live Langchain
  interface validation against current n8n AI Agent node)
- Workflow templates for the n8n marketplace (planned alongside v0.2)
