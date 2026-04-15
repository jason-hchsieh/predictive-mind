# Changelog

All notable changes to this project are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- #2 — upgrade surprise metric from Jaccard to structured diff + LLM-as-judge fallback
- #3 — upgrade `recall_similar_episodes` from token overlap to embedding-based similarity

## [0.1.0] — 2026-04-15

### Added

- Initial plugin scaffolding (`.claude-plugin/plugin.json`, `.mcp.json`, README, architecture doc).
- `belief-store` TypeScript MCP server backed by SQLite (WAL). Exposes 10 tools:
  `store_prediction`, `record_observation`, `retrieve_beliefs`, `list_beliefs`,
  `update_belief`, `snapshot_beliefs` / `rollback_beliefs`,
  `log_skill_outcome` / `score_skill_reliability`, `recall_similar_episodes`.
- `PostToolUse` hook: passive surprise recording with next-turn
  `additionalContext` injection when surprise crosses threshold.
- Six subagents with Markov-blanket tool allowlists:
  `cartographer`, `dreamer`, `policy-selector`, `belief-reviser`, `hierarchy-arbiter`.
- Seven skills: `/predict`, `/probe`, `/plan-efe`, `/reflect`, `/checkpoint`.
- SessionStart bootstrap hook that installs the MCP server's npm
  dependencies into `${CLAUDE_PLUGIN_DATA}` per the Claude Code plugin
  guidelines for persistent data.

### Design invariants enforced

1. Predict-before-act.
2. Perception / action role separation (via subagent tool allowlists).
3. Explicit epistemic vs pragmatic scoring in `/plan-efe`.
4. Inspectable persistent belief state (not in-context self-narration).
