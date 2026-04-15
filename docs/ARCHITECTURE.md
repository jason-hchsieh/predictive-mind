# Predictive-Mind — Architecture

A Claude Code plugin that provides scaffolding inspired by the **Free Energy
Principle** (Friston) and **World Models** (Ha & Schmidhuber) to make LLM
coding agents more stable at completing tasks.

This document is the design reference. It is plan-only — no code yet.

---

## 1. Positioning & Honest Scope

Current LLM agents are pattern predictors. They lack the explicit
generative-model / prediction-error machinery that FEP describes, and they
lack the learned dynamics model (`M`) that World Models assumes. Until world
models are properly trained, this plugin offers a **procedural substitute**:
a harness that forces the agent to predict before acting, keeps an
inspectable belief state, and separates perception from action.

The value is **coherence and prediction-error bookkeeping**, not novel
mathematics. We are not implementing variational inference; we are using FEP
and World Models as a **design discipline** that organizes a set of otherwise
ad-hoc practices.

### What we explicitly do NOT claim

- We do not compute real free energy or variational bounds.
- LLM "confidence" is treated as ordinal, not probability.
- "Markov blanket" is only a naming convention for tool-allowlist boundaries,
  not a statistical construct.
- Reflection is surprise-triggered, not a variational update.
- Perception and action are asymmetric for coding (reading vs writing have
  very different costs and reversibility) — we do not force symmetry.

---

## 2. Design Invariants

Every subagent, skill, and hook exists to uphold one of four invariants:

1. **Predict-before-act.** Every side-effecting tool call is preceded by an
   explicit predicted observation stored in the belief store.
2. **Perception / Action role separation.** Belief-editing roles cannot
   touch the filesystem; file-editing roles cannot edit beliefs. Enforced
   by tool allowlists and hooks.
3. **Explicit epistemic vs pragmatic scoring.** When the planner ranks
   candidate actions, pragmatic value (goal progress) and epistemic value
   (information gain) are scored separately.
4. **Inspectable persistent belief state.** Beliefs live on disk / in an
   MCP server, not inside the model's self-narration.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3: SKILLS  (procedural playbooks, user-invocable) │
│  /predict  /reconcile  /reflect  /plan-efe  /dream       │
│  /probe    /checkpoint                                   │
├──────────────────────────────────────────────────────────┤
│  Layer 2: SUBAGENTS  (specialized roles, isolated ctx)   │
│  Cartographer · Intent-Distiller · Dreamer · Policy-     │
│  Selector · Belief-Reviser · Hierarchy-Arbiter           │
├──────────────────────────────────────────────────────────┤
│  Layer 1: PERSISTENT STATE  (MCP server + hooks)         │
│  belief-store MCP · SessionStart/Pre/PostToolUse hooks   │
│  CoALA memory: working / episodic / semantic / procedural│
└──────────────────────────────────────────────────────────┘
```

The main Claude session plays the role of **Executor (C)** and
orchestrator. It invokes subagents, runs skills, and is observed by hooks.
There is no "Executor" subagent, because the executor cannot be an isolated
child process.

---

## 4. Layer 1 — Persistent State

### 4.1 `belief-store` MCP server

Backing store: SQLite at `${CLAUDE_PLUGIN_DATA}/beliefs.db`.

Exposed tools:

| Tool | Purpose |
|---|---|
| `store_prediction(action, expected, confidence, task_id)` | Predictor / Dreamer records a prediction before action |
| `record_observation(action_id, actual, surprise_score)` | PostToolUse hook records ground truth + surprise |
| `retrieve_beliefs(task_id)` | Read current belief state for the task |
| `update_belief(key, value, precision)` | Belief-Reviser modifies a belief |
| `recall_similar_episodes(z_context, k)` | Non-parametric M: k-NN over replay log — substitute for a trained MDN-RNN |
| `score_skill_reliability(skill_name)` | Precision-weighted skill library |
| `snapshot_beliefs(label)` / `rollback_beliefs(label)` | Checkpointing |

This MCP server is the actual carrier of **cross-session memory** — the
"poor man's M" identified in the World Models research. We cannot train
parameters, so we approximate dynamics via k-NN retrieval plus a
calibration log.

### 4.2 Hooks (`hooks/hooks.json`)

| Hook | Action | Constraint |
|---|---|---|
| `SessionStart` | Load task-level beliefs; inject repo-specific semantic priors | — |
| `PreToolUse` | (a) Check that the action has a stored prediction; soft-warn otherwise (pure reads exempt). (b) Enforce Markov blanket: belief-editing roles cannot call Write / Edit / Bash | Can block or modify `updatedInput` |
| `PostToolUse` | Diff `tool_response` vs `stored_prediction`; compute surprise; append to episodic log; if surprise > threshold, flag for next-turn context injection | **Cannot change Claude behavior mid-turn** — only log + next-turn injection |
| `Stop` | Produce session summary; update semantic memory; update skill reliability stats | — |

### 4.3 CoALA memory layout

```
${CLAUDE_PLUGIN_DATA}/
├── beliefs.db              # episodic replay log + current beliefs
├── semantic/
│   └── <repo-hash>.md      # accumulated lessons per repo
├── procedural/
│   └── skill-stats.json    # per-skill historical success rate
└── working/
    └── <session-id>/
        └── task-card.json  # current z_t written by Cartographer
```

---

## 5. Layer 2 — Subagents

Each subagent lives at `agents/<name>.md` with YAML frontmatter. Tool
allowlists enforce the Markov blanket procedurally.

| # | Name | Role | Inputs | Outputs | Tools | Fires when |
|---|------|------|--------|---------|-------|-----------|
| 1 | **cartographer** | V: repo → task card | user prompt, repo root | `task-card.json` (goal, in-scope files, symbol graph, relevant tests) | Read, Grep, Glob | Task start; major scope change |
| 2 | **intent-distiller** | V: prompt → structured goal | raw user msg, history | acceptance criteria + success test list | (no tools, pure reasoning) | Task start; user interjection |
| 3 | **dreamer** | M: counterfactual prediction | `z_t`, candidate action | predicted `z_{t+1}` per candidate (test delta, risk flags, confidence) | Read, Grep, Glob (read-only; **no Write/Edit/Bash**) | Before each non-trivial side-effecting action |
| 4 | **policy-selector** | EFE scorer | candidate actions + beliefs | ranked list (pragmatic_score, epistemic_score, total); selected policy + rationale | `belief-store` MCP tools only | Outer-loop tick |
| 5 | **belief-reviser** | Pure perceptual update | current beliefs + surprise report | revised beliefs + changelog | `belief-store` MCP tools only (**no filesystem**) | Surprise > threshold |
| 6 | **hierarchy-arbiter** | Cross-level error propagation | cumulative surprise, unresolved-error count | `stay` / `replan` / `ask-user` | (pure reasoning) | N consecutive belief revisions fail to absorb surprise |

### Roles consciously omitted

- **Executor** — played by the main session, not a subagent.
- **Predictor** — merged into **dreamer** (both are M).
- **Boundary Guard** — replaced by hook + tool allowlist enforcement.

---

## 6. Layer 3 — Skills

Skills are **procedural playbooks**; subagents are **specialized workers**.
Most skills are thin orchestrators around subagents and MCP tools.

| Skill | Responsibility | Implementation |
|---|---|---|
| `/predict <action>` | Force writing an explicit expected observation into the belief store | Inline; calls `store_prediction` |
| `/reconcile` | Manually trigger prediction-vs-observation comparison (normally automatic via PostToolUse) | Inline; reads MCP, computes surprise |
| `/reflect` | Surprise-triggered reflection: invokes belief-reviser | `context: fork`, delegates to belief-reviser |
| `/plan-efe <goal>` | Enumerate candidate actions; invoke policy-selector; return ranked list | Delegates to policy-selector |
| `/dream <action>` | Ask dreamer for imagination rollout | Delegates to dreamer |
| `/probe <question>` | **Cheap real probe** that substitutes for hallucination: `git status`, `tsc --noEmit`, `pytest --collect-only`, `grep -r`, `ls -la`, etc. | Inline; `allowed-tools` pre-approved |
| `/checkpoint <label>` | Snapshot beliefs + `git stash` for rollback | Inline; `snapshot_beliefs` + `git stash` |

### Key design decision: `/probe` is the safety valve

When dreamer confidence is low or ensemble disagreement is high, the
system prefers **cheap real probes** over trusting LLM hallucination. This
directly implements the "tool calls as grounded dynamics" insight from the
World Models research — the dreamer's job becomes **choosing which oracle
to consult**, not guessing outcomes.

---

## 7. Plugin Directory Layout

```
predictive-mind/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── cartographer.md
│   ├── intent-distiller.md
│   ├── dreamer.md
│   ├── policy-selector.md
│   ├── belief-reviser.md
│   └── hierarchy-arbiter.md
├── skills/
│   ├── predict/SKILL.md
│   ├── reconcile/SKILL.md
│   ├── reflect/SKILL.md
│   ├── plan-efe/SKILL.md
│   ├── dream/SKILL.md
│   ├── probe/SKILL.md
│   └── checkpoint/SKILL.md
├── hooks/
│   └── hooks.json
├── mcp/
│   └── belief-store/
│       ├── server.py            # SQLite-backed MCP server
│       └── schema.sql
├── .mcp.json
├── docs/
│   └── ARCHITECTURE.md          # this file
└── README.md
```

---

## 8. Main Loop (Task Lifecycle)

```
1. SessionStart hook       → load semantic priors
2. intent-distiller        → acceptance criteria
3. cartographer            → task-card.json (z_0)
4. LOOP:
   a. policy-selector      → EFE-ranked candidate actions
   b. [if candidate has side effects]
        dreamer            → predict z_{t+1}
      OR /probe            → cheap real observation instead
   c. /predict             → write expected observation
   d. Executor (main Claude)→ run tool call
   e. PostToolUse hook     → compare → compute surprise → log
   f. IF surprise > T:
        belief-reviser     → update beliefs
      IF N consecutive revisions fail:
        hierarchy-arbiter  → replan / ask-user
5. Acceptance tests pass AND no high-uncertainty beliefs remain
   → Stop hook (update semantic memory + skill stats)
```

---

## 9. Failure Modes This Architecture Addresses

Six problems that existing patterns (ReAct, Reflexion, ToT, Plan-and-Execute,
Voyager, Generative Agents) each solve only partially:

1. **Over-confident execution without preconditions** — addressed by
   mandated predicted-observation contracts before every side-effecting
   call (Invariant 1).
2. **Context rot / goal drift** — addressed by a persisted top-of-hierarchy
   belief that cannot be evicted from context (Invariant 4).
3. **Hallucinated file paths, APIs, test outcomes** — addressed by
   surprise measurement + `/probe` fallback when dreamer confidence is low.
4. **Lack of exploration** — addressed by explicit epistemic value in
   policy-selector (Invariant 3).
5. **Poor recovery from unexpected tool results** — addressed by
   surprise-triggered belief-reviser + hierarchy-arbiter escalation.
6. **Give-up vs double-down asymmetry** — addressed by comparing expected
   free energy of `{continue, ask_user, stop}` via hierarchy-arbiter.

---

## 10. Implementation Phases

### Phase 1 — Skeleton (minimum verifiable value)

- `belief-store` MCP server — subset: `store_prediction`, `record_observation`, `retrieve_beliefs`
- `PostToolUse` hook — passive surprise recording
- Skills: `/predict`, `/probe`
- Subagents: `cartographer`, `dreamer`

This validates Invariants 1 and 4 — the smallest delta that should be
measurably more stable than stock Claude Code.

### Phase 2 — EFE planning

- Subagent: `policy-selector`
- Skill: `/plan-efe`
- MCP tool: `recall_similar_episodes` (non-parametric M)

### Phase 3 — Hierarchy & self-repair

- Subagents: `belief-reviser`, `hierarchy-arbiter`
- Skills: `/reflect`, `/checkpoint`
- Skill reliability tracking + precision weighting

---

## 11. Open Questions

- **MCP server language.** Python (fast prototyping) vs TypeScript
  (ecosystem consistency). Decision pending.
- **Surprise metric.** What counts as "surprise" when predictions are
  natural language? Candidates: embedding distance, LLM-as-judge, rule-based
  diff for structured predictions (test pass/fail counts, type-check deltas).
  Likely a composite.
- **Ensemble dreams.** Parallel subagent execution is not supported in a
  single session. Sequential k-sample dreaming is expensive. Deferred until
  Phase 2 validates that single-dream + `/probe` is insufficient.
- **Calibration loop.** How do we turn the replay log into updated priors
  that survive compaction? Candidate: periodic semantic-memory rewrite at
  `Stop` hook.
- **Invocation ergonomics.** How aggressively should `/predict` be
  enforced? Soft-warn vs hard-block. Likely configurable per tool class.
