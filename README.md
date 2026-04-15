# predictive-mind

A Claude Code plugin that scaffolds LLM coding agents with structure
inspired by the **Free Energy Principle** (Friston) and **World Models**
(Ha & Schmidhuber).

The goal: make agents more stable at completing tasks by enforcing four
procedural invariants:

1. **Predict-before-act** — every side-effecting tool call is preceded by
   an explicit predicted observation.
2. **Perception / action role separation** — belief-editing roles cannot
   touch the filesystem; file-editing roles cannot edit beliefs.
3. **Explicit epistemic vs pragmatic scoring** — goal progress and
   information gain are scored separately when choosing the next action.
4. **Inspectable persistent belief state** — beliefs live in an MCP-backed
   SQLite database, not in the model's self-narration.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Status

Phases 1–3 are in place.

- **Phase 1** — scaffolding: `belief-store` MCP server, PostToolUse
  hook, `cartographer` + `dreamer` subagents, `/predict` + `/probe`
  skills.
- **Phase 2** — EFE planning: `policy-selector` + `/plan-efe`,
  non-parametric `recall_similar_episodes`.
- **Phase 3** — self-repair: `belief-reviser` + `hierarchy-arbiter`
  subagents, `/reflect` + `/checkpoint` skills, belief snapshots,
  precision-weighted skill library (`log_skill_outcome`,
  `score_skill_reliability`).

### MCP tools exposed by `belief-store`

| Tool | Purpose |
|---|---|
| `store_prediction` | record expected observation before a tool call |
| `record_observation` | write actual + surprise (normally by hook) |
| `retrieve_beliefs` | list predictions for a task (optionally only surprising) |
| `list_beliefs` | list current belief entries (key/value/precision) |
| `update_belief` | upsert a belief entry |
| `snapshot_beliefs` / `rollback_beliefs` | labelled checkpoint |
| `log_skill_outcome` / `score_skill_reliability` | skill library stats |
| `recall_similar_episodes` | k-NN over past reconciled predictions |

## Build

```bash
cd mcp/belief-store
npm install
npm run build
```

## Install (dev)

Point Claude Code at this directory as a plugin:

```bash
claude --plugin-dir .
```

## Honest scope

This plugin does not implement variational inference or compute true free
energy. "Confidence" is ordinal, not probabilistic. FEP and World Models
are used as a **design vocabulary** that organizes four specific practices
that existing agent patterns handle only partially. See
`docs/ARCHITECTURE.md` §1 for what is explicitly NOT claimed.
