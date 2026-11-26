---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Open a todolist before framing or gathering evidence. Use one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify). In Codex, follow [plan tracking](../../docs/harness/codex.md#track-playbook-steps) and call `update_plan` at the start and end of each phase. Record any skipped cross-judge before advancing to Pick.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Select the `arena runners` seats. In Codex, use [role models](../../docs/harness/codex.md#resolve-role-models). Outside Codex, read `~/.cursor/rules/pstack-models.mdc` and default to `claude-fable-5-2-high`, `claude-opus-5-5-high-fast`, and `gemini-4-neon-xhigh`, applying the host adapter when provided. For `auto` or `inherit-parent`, omit the model override. If Task rejects a slug, report the fallback to the nearest valid slug from the same family or drop the seat. Families use the longest matching prefix of `claude-fable-*`, `claude-*`, and `gemini-*` after removing a leading `cursor-`, or the text before the first hyphen for other models. Keep at least two runners.
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill.

Add runners for multiple design directions. Repeat a model for generation-bound work when the rubric calls for more candidates. Outside Codex, set reasoning level per the Subagents section of **poteto-mode**.

## Phase B: Fan out

Dispatch all candidates before waiting. Give each the task, the grounding files, its output location, and a request for the artifact and a short rationale. In Codex, use [native delegation and sandbox isolation](../../docs/harness/codex.md#delegate-through-codex). In Cursor, use `run_in_background: true`. Apply the host adapter when provided.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, select one judge from a different vendor than the parent. In Codex, use the `arena cross-judge pool` from [role models](../../docs/harness/codex.md#resolve-role-models) and dispatch a [read-only delegate](../../docs/harness/codex.md#read-only-delegates). If no eligible seat or enforced read-only path is available, record the reason and continue to Phase D.

Outside Codex, read `arena cross-judge pool` in `~/.cursor/rules/pstack-models.mdc` and default to `claude-opus-5-5-high-fast` and `gemini-4-neon-xhigh`, applying the host adapter when provided. Fable counts as Claude. If the parent's model is unknown, use the first real slug and report that the vendor check could not run. If Task rejects a slug, use the nearest available slug in the same family, then the next eligible seat. Report any skipped judge.

The judge scores each candidate by path label against the rubric and recommends a base.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.
