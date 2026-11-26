---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

## Start

Open a todolist with one entry per phase before framing or gathering evidence. In Codex, follow [plan tracking](../../docs/harness/codex.md#track-playbook-steps) and call `update_plan` before starting each phase, including before the first spawn. Complete Fan out after collecting the requested coverage.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Select the `swarm workers` model. In Codex, use [role models](../../docs/harness/codex.md#resolve-role-models). Outside Codex, read `~/.cursor/rules/pstack-models.mdc` and use `claude-opus-5-5-high-fast` when the line is missing, applying the host adapter when provided. For `auto` or `inherit-parent`, omit the model override. If Task rejects a slug, report the fallback to the default or the nearest available slug of the same family. Name each arm's model up front for a model race.
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

Outside Codex, set reasoning level per the Subagents section of **poteto-mode**.

## Phase B: Fan out

In Codex, use [native delegation and sandbox isolation](../../docs/harness/codex.md#delegate-through-codex) for the requested read or write scope. Dispatch the workers before waiting for results.

Outside Codex, spawn all N workers in one message with `subagent_type: generalPurpose`, `environment: "cloud"`, `run_in_background: true`, and the step 3 model, applying the host adapter when provided. Use `environment: "local"` when a worker needs the user's computer. For a non-default pushed branch, pass `cloud_base_branch`.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.
