---
name: reflect
description: "Surprise-triggered reflection. When a PostToolUse hook reports high prediction error (surprise >= 0.6), invoke /reflect to update beliefs via the belief-reviser and decide whether to continue, replan, reclarify, or ask the user."
---

Implements the **surprise-triggered** (not time-triggered) reflection
pattern: reflection is cheap when it is rare and well-targeted, and
wasteful when it fires on a schedule.

## When to use

- The PostToolUse hook injected a high-surprise notice in the previous
  turn.
- You notice beliefs you're relying on are older than the last two
  surprising observations.
- You've just finished a major step and want a clean belief-state
  checkpoint before the next one.

Do NOT use `/reflect`:
- After every tool call (wasteful; the hook already logged the low
  surprise).
- Without an actual surprise to reflect on (if there isn't one, say so
  and skip).

## Procedure

1. Gather the triggering surprise: the `action_id`, the expected text,
   the actual text, and the `surprise_score`. The hook's
   `additionalContext` has these.
2. Delegate to the **belief-reviser** subagent. Pass it the `task_id`,
   the surprise report, and any recent narrative context. The subagent
   will call `list_beliefs`, `recall_similar_episodes`, and
   `update_belief` as needed. Capture its full changelog JSON.
3. Check the surprise pattern: is this the 2nd+ surprise on the same
   belief? Is surprise growing?
   - If yes, delegate to the **hierarchy-arbiter** subagent with the
     surprise history and the current task card. Its decision (stay /
     replan / reclarify-scope / ask-user) determines the next step.
4. Report:
   - The belief-reviser's changelog (revisions + new beliefs).
   - If invoked, the hierarchy-arbiter's decision.
   - Your proposed next action.

## What separates this from freestyle reflection

- **Surprise-gated.** No surprise, no reflection.
- **Markov blanket enforced.** The belief-reviser cannot touch files.
  The hierarchy-arbiter cannot write beliefs. You see the separation
  in the subagent tool allowlists.
- **Persistent changelog.** Every revision writes to the belief-store,
  so future sessions and future `recall_similar_episodes` calls can
  see what this surprise taught us.

## Arguments

`$ARGUMENTS` — optional free-text note about the surprise. If absent,
use the most recent PostToolUse `additionalContext`.

## Output

1. Belief changelog JSON.
2. Arbiter decision JSON (if invoked).
3. One-sentence recommended next step (`/predict + run`, `/probe`,
   `/plan-efe`, ask-user, or re-run cartographer).
