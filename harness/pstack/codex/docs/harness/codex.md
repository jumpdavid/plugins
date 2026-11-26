# pstack in Codex

pstack skills use Cursor names. In Codex, apply the mappings below before following the shared skills and playbooks. Resolve skill-relative links from the physical `SKILL.md` path reported by discovery or `realpath`. A project link such as `.agents/skills/pstack` points to the installed `skills/` directory, so its logical path cannot locate sibling package files such as `docs/harness/codex.md`. Keep the task, scope, and checks from the original workflow.

## Tools

| Cursor | Codex |
| --- | --- |
| `Task` | Spawn native Codex subagents using the available tool schema. Dispatch independent agents before waiting. Count a delegate after it returns usable evidence. If a call is rejected, check the tool schema and correct the call for missing seats. |
| `AskQuestion` | Use the host's structured user-input tool when available. Otherwise ask in chat. |
| Open a todolist or write playbook steps to it | Use `update_plan` in Default mode. Follow [Plan tracking](#plan-tracking). |
| Run another pstack skill (`/name` or “the **name** skill”) | Read the installed `skills/<name>/SKILL.md` and follow it with this adapter. Use `$<name>` for the project-skills installation. |
| `Grep`, `Glob` | Use `rg` and `rg --files` when the host exposes a shell. |

### Plan tracking

Enable the Codex plan tool in user or trusted project configuration, then start a new session.

```toml
[tools.update_plan]
enabled = true
```

Read the adapter and the selected playbook or skill phases first. For a direct invocation, the first workflow action is `update_plan`. Call it before starting the first step or gathering evidence. Use the playbook's steps or the exact phase labels in the table below, with the first step `in_progress` and later steps `pending`. At each boundary call `update_plan` before starting the next phase. This includes short phases and optional phases whose outcome is a recorded skip. Keep the same labels throughout. A nested skill tracks progress in the caller's existing plan. If the tool is unavailable, report that native tracking is unavailable and list the steps in commentary.

For a direct call, use the following phases:

| Skill | Plan |
| --- | --- |
| `arena` | Frame, Fan out, Cross-judge, Pick, Graft, Verify. Start Cross-judge before evaluating vendor availability. Record the result or the reason it was skipped before starting Pick. |
| `swarm` | Frame, Fan out, Aggregate, Report. Complete Fan out after collecting the requested coverage. |
| `interrogate` | Frame, Fan out, Verify, Report. Complete Frame and start Fan out before the first reviewer spawn. After all required reviewers return, start Verify before replaying their commands. Start Report before preparing the final findings, then complete it before sending them. |

If required coverage is missing, leave Fan out open, report what is missing, and end the review. Resume when the required coverage is available. App Server reports real plan updates as `turn/plan/updated` events.

## Subagent fields

| Cursor | Codex |
| --- | --- |
| `subagent_type: generalPurpose` | Use a native general-purpose subagent. |
| `poteto-agent`, `comment-sicko` | Use native subagents with the bundled role brief. Give a poteto delegate the absolute path to the installed `skills/poteto-mode/SKILL.md` and tell it to read the full file. Give Comment Sicko the absolute path to `agents/comment-sicko.md`. Ask it for proposed comment edits and apply accepted edits in the parent. Begin each kickoff with the absolute path to `skills/poteto-mode/worker.md`, as specified in poteto mode. |
| `readonly: true` | Use [enforced read-only delegation](#read-only-delegation). |
| `readonly: false` | Use the writable scope granted for the task. Give concurrent writers independent worktrees. |
| `environment: "cloud"` | Use a host-provided isolated environment or a separate [writable worktree](#independent-writers) when checkout isolation is the requirement. A local worktree needs a separate writable scope. |
| `environment: "local"` | Use a native delegate in the current checkout when it has the required permissions. |
| `cloud_base_branch` | Resolve the requested base to a commit and create the isolated worktree there. |
| `run_in_background: true` | Omit the field. Wait for the terminal result through the available agent tool. |
| `resume` | Follow up with the same agent when the workflow depends on state it holds. Otherwise start a fresh agent with the previous evidence. |
| `file_attachments` | Give the agent the paths in its brief. |

Use fresh context for native delegates in an ephemeral Codex session. Set `fork_context` to false when the tool exposes it, and include the task and absolute file paths in the brief. If a spawn reports that the parent has no stored rollout, retry only the missing delegate with fresh context and preserve its sandbox policy.

### Read-only delegation

The review needs a sandbox that enforces read-only access. A native subagent can inherit it from a read-only parent. An App Server host can set `sandboxPolicy: { "type": "readOnly", "networkAccess": false }` and `approvalPolicy: "never"` for the review turn. A custom agent file inherits the parent's sandbox. When the parent must stay writable, a trusted host launcher can start a separate read-only CLI run against the same checkout.

```sh
codex --ask-for-approval never exec --ephemeral --sandbox read-only -C "$checkout" "$brief"
```

When a review is read-only, give every reviewer the current checkout, including local changes. Keep repro writes in a disposable location when the scope permits them. If neither native nor externally launched delegates can enforce read-only access, report the missing coverage. For `how`, a direct read-only investigation can still answer the user. For `interrogate`, keep Fan out open and end the review.

### Independent writers

Give each concurrent writer a worktree based on the verified commit. Use a host tool that enforces the worktree as the writable scope or start a separate CLI run from a trusted launcher.

```sh
codex --ask-for-approval never exec --ephemeral --sandbox workspace-write \
  -c 'sandbox_workspace_write.writable_roots=[]' \
  -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' \
  -c 'sandbox_workspace_write.exclude_slash_tmp=true' \
  -C "$worktree" "$brief"
```

Collect and inspect each diff in the parent before committing. If the host cannot isolate writable scopes, serialize implementation and report the lost parallel coverage. For Autopilot, the isolated owner hands the parent its diff and verification evidence. The parent handles Git metadata, PR publication, CI checks, and merge operations within the operator's grant. Keep the owner and independent verifier separate.

## Models

| Cursor | Codex |
| --- | --- |
| A Cursor slug such as `claude-*`, `grok-*`, or `gpt-*` | Select a model ID and reasoning effort supported by the Codex host. A Cursor slug is not a Codex override. For separate CLI runs use `--model` and `-c model_reasoning_effort=<effort>`. |
| `auto` or `inherit-parent` | Inherit the parent model and effort. A separate CLI run can use the parent's explicit values when they are known. |
| `pstack-models.mdc` | Read `.pstack-models.json` from the repository root. Each role maps to an ordered list of seats. A seat is `"inherit-parent"` or an object with `model` and optional `effort`. |

An unconfigured role inherits the parent. The `arena runners` and `interrogate reviewers` roles default to two independent seats. Honor the explicit count in the request. If an explicit choice is unavailable, report it and inherit for that seat. For a cross-judge, require a known different vendor. Report a skipped cross-judge when no eligible seat is available.

For `setup-pstack`, use the current host's model and effort choices. If the tool schema leaves them open and the local CLI is available, run [the model catalog helper](codex/codex-models.mjs) with Node. Update only the roles the user changes. Write the JSON file after validating the selected seats. For example:

```json
{
  "swarm workers": ["inherit-parent"],
  "interrogate reviewers": ["inherit-parent", "inherit-parent"]
}
```

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/` and `~/.cursor/skills/` | Install the generated `harness/pstack/codex/skills` in the target project's `.agents/skills/pstack`. Write new project skills in `.agents/skills/`. |
| `~/.cursor/plugins/` and `.cursor-plugin/plugin.json` | Find the skills through Codex discovery. Resolve role briefs, guides, and runtime files from the generated tree next to `skills/`. |
| `.cursor/rules/` and always-applied rules | Follow project `AGENTS.md` and Codex configuration. Use the repository-root JSON file for pstack model roles. |
| `agent-transcripts` in the workspace | Use the Codex chat list and thread reader for the current project. Check active and pinned chats before worktree cleanup. If chat history is unavailable, report the gap. |

## Cursor-only features

| Cursor | Codex |
| --- | --- |
| Cursor Automations, webhooks, and Bugbot setup | These integrations require a separate migration. Record the skipped step. Process existing GitHub review threads with the forge commands in the playbook. |
| A built-in PR tool | Use the forge command the step provides, such as `gh pr create`. |
| `/loop` | Keep the current task active and run the named check until its exit condition is met. Use the watcher command when the playbook provides one. |
| `/create-skill` | Use `$skill-creator` when available. |
| `/deslop` | Read the bundled `cursor-team-kit/skills/deslop/SKILL.md` if available. Otherwise review the actual diff for redundant comments, unnecessary guards, type-check bypasses, avoidable nesting, and departures from surrounding code. Apply behavior-preserving edits and run `git diff --check` and the relevant tests before committing. |
| `control-ui`, `control-cli` | Run the behavior through the project's UI driver, the browser or computer tool, or the actual CLI entry point. For visual parity capture the baseline and target on the same surface and state. Require equal dimensions and zero decoded pixel difference. Keep the captures and comparator output as evidence. |

### Worktree cleanup

Use [the shared worktree audit](../../skills/poteto-mode/scripts/worktree-audit.sh) with `--history-command` set to the absolute installed path of [the Codex history reader](codex/codex-worktree-history.mjs). The reader queries scoped chat metadata for the exact Git worktree paths. Check pinned and active chats separately, including chats that operate on the worktree from another working directory.

Only a clean checkout whose commit is reachable from the selected base is eligible for cleanup. Hold unknown history, unknown Git state, and untracked or modified work. Use `git worktree remove <path>` for confirmed candidates. If Git refuses, keep the worktree and report the reason.
