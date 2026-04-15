---
name: probe
description: "Run a cheap, reversible real probe to ground a belief instead of hallucinating. Use when dreamer confidence is low or when you catch yourself guessing about repository state."
allowed-tools: "Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git branch:*) Bash(ls:*) Bash(pwd:*) Bash(tsc --noEmit:*) Bash(npx tsc --noEmit:*) Bash(pytest --collect-only:*) Bash(pytest -q --collect-only:*) Bash(ruff check:*) Bash(eslint --no-fix:*) Bash(npm ls:*) Bash(node --version:*) Bash(python --version:*) Bash(python3 --version:*) Bash(which:*)"
---

World Models research observation: when the learned dynamics model (M)
is unreliable, prefer a cheap real probe over an imagined rollout. This
skill is that safety valve.

## When to use `/probe`

- Dreamer confidence < 0.5 for a proposed action.
- You catch yourself guessing about a file's contents, a dependency
  version, or a test count.
- A PostToolUse hook reported high surprise and you want to re-ground
  before the next step.
- You are about to state a prediction you can't actually defend.

## Cheap, reversible probes (pre-approved)

The following are side-effect-free (or trivially reversible) and are
pre-approved in this skill's allowlist:

| Intent | Probe |
|---|---|
| What changed locally? | `git status`, `git diff`, `git log -5 --oneline` |
| What branch am I on? | `git branch --show-current` |
| What's in this directory? | `ls -la <path>` |
| Type check without emit | `tsc --noEmit` |
| What tests exist? | `pytest --collect-only -q` |
| Are there lint errors? | `ruff check <path>`, `eslint --no-fix <path>` |
| Is this dep installed? | `npm ls <pkg>`, `node --version`, `python --version` |
| Is this tool on PATH? | `which <cmd>` |

## Procedure

1. State the one-sentence QUESTION you want grounded.
2. Choose the MINIMUM probe that answers it. Smaller is better — a
   probe is not a survey.
3. Run it; read the actual output.
4. Update your working belief (and, if this probe was prompted by a
   prior surprise, consider `/reflect` next).

## What `/probe` is NOT for

- Anything that writes to the filesystem.
- Anything that installs packages or touches the network.
- Anything that takes more than a few seconds.
- "While I'm here, let me also check…" — keep it to the single grounded
  question.

For everything else, use `/predict` then run the action normally.

## Arguments

`$ARGUMENTS` — the question you want grounded, in one sentence.

Your response should:
1. Restate the question.
2. Choose and run the single minimum probe.
3. Report the observed answer (ground truth), nothing more.
