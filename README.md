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

Work in progress. The plugin is built in phases:

- **Phase 1** — minimum viable scaffolding: `belief-store` MCP server,
  PostToolUse hook, `cartographer` + `dreamer` subagents, `/predict` +
  `/probe` skills.
- **Phase 2** — EFE planning: `policy-selector` + `/plan-efe`, non-parametric
  `recall_similar_episodes`.
- **Phase 3** — self-repair: `belief-reviser` + `hierarchy-arbiter`,
  `/reflect` + `/checkpoint`, precision-weighted skill library.

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
