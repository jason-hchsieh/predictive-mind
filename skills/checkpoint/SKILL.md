---
name: checkpoint
description: "Snapshot the current belief state (and optionally git-stash the working tree) under a label, so a risky action can be rolled back if it produces high surprise or breaks acceptance tests."
allowed-tools: "Bash(git stash push:*) Bash(git stash list:*) Bash(git stash pop:*) Bash(git stash apply:*) Bash(git stash drop:*) Bash(git status:*)"
---

Creates a two-layer checkpoint you can roll back to:

1. **Belief snapshot** via `belief-store.snapshot_beliefs` — preserves
   the inspectable belief state at this moment under a label.
2. **Working-tree snapshot** via `git stash push -m <label>` — preserves
   uncommitted changes so a risky action can be undone.

Use before:
- A high-blast-radius refactor.
- An action the dreamer flagged with significant `risk_flags`.
- An attempt where the policy-selector recommended but did not
  dominate.

## Procedure (checkpoint)

1. Pick a short `<label>` — 1-3 words, no spaces.
2. Call `belief-store.snapshot_beliefs(task_id, label)`. Capture the
   returned `snapshot_id`.
3. If there are uncommitted changes (`git status --short`), run:
   `git stash push -u -m "pm-checkpoint:<label>"`.
4. Record the label in your working context. The label is the handle
   both rollbacks will use.

## Procedure (rollback)

1. Call `belief-store.rollback_beliefs(task_id, label)`.
2. Find the matching stash: `git stash list | grep "pm-checkpoint:<label>"`.
3. Apply it: `git stash apply stash@{N}` (prefer apply over pop so you
   can re-checkpoint the rollback itself).
4. Run `/probe` (e.g. `git status`) to confirm the rollback landed as
   expected.

## Discipline

- Labels are idempotent: re-checkpointing with the same label creates
  a NEW snapshot; it does not overwrite. Rollback defaults to "most
  recent with this label".
- A checkpoint is not a commit. Commit real progress through the
  normal git flow. Checkpoints are for reversible exploration.
- After a successful risky action, consider dropping the stash:
  `git stash drop stash@{N}`. Don't let checkpoint stashes
  accumulate.

## Arguments

`$ARGUMENTS` — the label (required). If absent, use an ISO-timestamp
derived label (e.g. `ckpt-20260101-1200`).

## Output

1. The belief-store snapshot_id.
2. The stash ref if a stash was created, or "no-op" if the working
   tree was clean.
3. A one-line rollback hint showing the exact commands to undo.
