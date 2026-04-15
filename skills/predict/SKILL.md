---
name: predict
description: "Record an explicit predicted observation before a side-effecting tool call. Use whenever you are about to run a command, edit a file, or invoke any tool whose outcome you have not already observed. Upholds the predict-before-act invariant."
---

Before running the next side-effecting tool call, write down what you
expect to observe. The prediction is recorded in the belief-store and
reconciled with the actual observation after the tool runs.

## When to use

- **ALWAYS** before `Bash`, `Edit`, `Write`, `NotebookEdit`, or any tool
  with side effects.
- **OPTIONAL** before `Read` / `Grep` / `Glob` if the expected content
  materially affects your plan (e.g. "I expect this file to contain
  function `foo`"). For pure exploration reads, skip.

## How to use

1. Decide the action you are about to take.
2. State explicitly, in one or two lines each:
   - `action` — short description ("Edit src/auth.ts: add null-check on line 42")
   - `expected` — the specific, FALSIFIABLE observation you predict
   - `confidence` — 0..1, ordinal (not probabilistic)
3. Call the `belief-store.store_prediction` MCP tool with those fields,
   plus:
   - `task_id` — the current task card's id (from the Cartographer)
   - `tool_name` — the exact tool name you will invoke ("Bash", "Edit", …)
   - `tool_input_hash` — optional; lets the hook disambiguate when
     multiple predictions target the same tool
4. **Then** issue the tool call.

The PostToolUse hook automatically reconciles your prediction with the
actual result and computes a surprise score. You do NOT need to call
`record_observation` yourself.

## Good vs bad predictions

| Bad (unfalsifiable) | Good (falsifiable) |
|---|---|
| "The tests will pass." | "`pytest -q` prints `14 passed` and exits 0 in under 5s." |
| "The file will have my changes." | "`grep -n 'null-check' src/auth.ts` matches line 42." |
| "It should work." | "`tsc --noEmit` prints no errors." |
| "Something will be returned." | "The function returns `{ok: true, id: string}` with id length 36." |

If you cannot state a falsifiable prediction, your confidence should be
low and you should consider `/probe` first to ground the belief before
committing to the action.

## Arguments

- `$ARGUMENTS` — the action you are about to take (free text).

Your response should:
1. Produce the predicted observation in natural language.
2. Call `belief-store.store_prediction` with the structured fields.
3. State the returned `action_id` so downstream reconciliation can cite it.
