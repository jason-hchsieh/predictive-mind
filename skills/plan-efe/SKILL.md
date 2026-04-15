---
name: plan-efe
description: "Given a goal and a set of candidate next actions, rank them by Expected Free Energy (pragmatic + epistemic value) using past similar episodes, and pick the winner. Delegates scoring to the policy-selector subagent."
---

Upholds Invariant 3 of predictive-mind: **pragmatic and epistemic value
are scored separately**. Use this skill when multiple candidate actions
are on the table and the "first plausible one" is not obviously the best.

## Typical trigger

- You have a task card but have not committed to a next action yet.
- The dreamer returned multiple candidates with comparable confidence.
- A PostToolUse hook reported surprise, and you need to choose between
  `/probe`, `/reflect`, or a new action.

## Procedure

1. **Enumerate candidates** (2-5 is the sweet spot). Include, at
   minimum:
   - The action you are currently tempted to take.
   - One probe (a `/probe` call that would disambiguate an open
     hypothesis).
   - One "ask the user" option if anything material is unclear.
2. **Delegate to the policy-selector subagent** with:
   - The task card (goal + acceptance criteria + open hypotheses).
   - The `task_id` (so the subagent can call `retrieve_beliefs`).
   - The candidate list.
3. **Report back** the full ranked JSON output and the pick. Do NOT
   rewrite or summarize the scores — the raw scores are the
   accountability trail.
4. If the pick is `ask-user`, stop and ask. If the pick is
   `probe-first`, invoke `/probe`. Otherwise proceed with
   `/predict` then the chosen action.

## What separates this from "just think about it"

- **Similar-episode grounding**: the policy-selector queries
  `recall_similar_episodes` for each candidate, so prior surprises
  actually discount similar-looking plans.
- **Epistemic budget is explicit**: a high-information-gain probe can
  legitimately beat a low-confidence direct attempt, even though the
  probe does not advance the goal.
- **Scores are persisted**: the ranked output becomes part of the
  session record for later review.

## Arguments

`$ARGUMENTS` — the current goal (free text). The skill will ask you
for the candidate list if you did not include it.

## Output shape (from the policy-selector)

```
ranked: [ { action, pragmatic, epistemic, total, recommendation, ... } ]
pick:   { action, rationale }
notes_on_calibration: <honest caveats>
```

Use the pick's `recommendation` field to decide the next skill:
- `execute` → `/predict` then run the action
- `probe-first` → `/probe`
- `dream-first` → invoke the dreamer on the picked action before acting
- `skip` → drop this candidate, re-plan
