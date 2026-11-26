---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Adversaries try to break a change or design, and only findings proven by a run survive."
disable-model-invocation: true
---

# Interrogate

In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. It maps the Cursor names in pstack skills to Claude Code.

In Codex, follow [plan tracking](../../docs/harness/codex.md#track-playbook-steps) before framing the review. For a direct invocation, initialize `update_plan` with `Frame`, `Fan out`, `Verify`, and `Report`. Complete Fan out after collecting the required independent reviews.

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch, through the working tree. State the intent with the **in-your-own-words** skill, from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Before dispatching the first reviewer in Codex, call `update_plan` to complete Frame and start Fan out.

In Codex, select the `interrogate reviewers` seats using [role models](../../docs/harness/codex.md#resolve-role-models). Give each [read-only delegate](../../docs/harness/codex.md#read-only-delegates) the current checkout so it can inspect uncommitted changes. Run any repro that writes files from the parent in a disposable location when the review scope allows it. If the host cannot provide the required isolated reviews or they fail to return, leave Fan out open, report the missing coverage, and end the review there.

Outside Codex, run Phase A steps 3 and 4 and Phase B of **arena** using `interrogate reviewers` in place of `arena runners`. Copy the scoped uncommitted changes into each worktree and spawn each adversary as `generalPurpose`, using the host adapter when provided.

Give each reviewer the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repro writes within the scope and writable location assigned to you. If a check needs writes outside that scope, send its command to the parent for verification. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. No findings is a valid result.

## Verify

After the required reviews return, call `update_plan` in Codex to finish Fan out and start Verify before running verification commands. Rerun each finding per arena Phase F. Run any in-scope repro that a read-only reviewer handed back. Keep a finding when the output shows the failure and the failure breaks the intent. Drop the rest. Merge findings that share a root cause.

Skip arena Phases C, D, and E. Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list.

## Output

In Codex, call `update_plan` to finish Verify and start Report before preparing the final findings. Complete Report just before sending them. Keep any incomplete review phase open.

- **Intent**: the restatement.
- **Findings**: for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped**: for each adversary, the count of dropped findings and why.
