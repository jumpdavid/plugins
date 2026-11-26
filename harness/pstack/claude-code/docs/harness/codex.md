# pstack in Codex

Use these mappings when pstack runs in Codex. They override Cursor-specific instructions in the skills and playbooks. Keep the playbook's task, scope, and checks.

## Track playbook steps

Codex disables `update_plan` by default in recent versions. Enable it for a trusted project in `.codex/config.toml`, then start a new Codex session in that project. For a one-off CLI run, pass `-c tools.update_plan.enabled=true`.

```toml
[tools.update_plan]
enabled = true
```

In Default mode, read the selected playbook first. Then call `update_plan` with its checklist before gathering task evidence. Mark the first active step `in_progress` and leave later steps `pending`. When a step finishes, call `update_plan` again before moving on. Keep the same step labels and order, mark the finished step `completed`, and mark the next step `in_progress`. Revise the checklist only when the work changes, and explain why. The Codex client renders these updates, and App Server reports them as `turn/plan/updated` events. A playbook that asks for a plan to be reviewed still uses its own review step.

When a skill provides its own phases, use those phase names for a direct invocation. Move each phase to `in_progress` before acting on it. Record an allowed skip before completing an optional phase. Keep delegation in progress until the required agents finish. If required coverage is missing, report the incomplete phase and leave it open. A skill invoked under an existing plan tracks its progress within that plan. Complete the report step after preparing the report and before sending it.

If the tool is unavailable, say that native progress tracking is unavailable and post the numbered steps in commentary. This keeps the steps visible while the work runs. The `turn/plan/updated` events are the check for native tracking.

## Delegate through Codex

Use native Codex subagents when the session provides the required permissions and working directory. Follow the exposed tool schema for model and effort. Cursor `Task` fields for roles, background execution, and cloud checkout do not carry over to the Codex spawn call.

Start each kickoff with the absolute path to `skills/poteto-mode/worker.md` as the entry skill specifies. Give each agent its scope, evidence to gather, and expected output. A `poteto-agent` delegate also reads the absolute `skills/poteto-mode/SKILL.md`. A Comment Sicko delegate follows `agents/comment-sicko.md`. These brief paths work with a skill-directory symlink. If dispatch fails because the payload is invalid, correct it against the live tool schema and retry only the missing seats. Count a delegate after it returns usable evidence.

### Read-only delegates

Use native subagents for a read-only review when the parent turn enforces read-only access or its dispatch tool can enforce it on the child. A [custom agent file](https://learn.chatgpt.com/docs/agent-configuration/subagents) inherits the parent's sandbox. An App Server host can start a dedicated review turn with `sandboxPolicy: { "type": "readOnly", "networkAccess": false }` and `approvalPolicy: "never"` in `turn/start` so native delegates inherit the read-only policy. This override remains active in subsequent turns until the host changes it.

When the parent must stay writable and the spawn tool cannot enforce a tighter policy, use a trusted host launcher to start each reviewer outside the parent's command sandbox. Use the current checkout so reviewers can see uncommitted changes.

```sh
codex --ask-for-approval never exec --ephemeral --sandbox read-only -C "$checkout" "$brief"
```

Keep any repro writes with the parent in a disposable location when the task permits them. If the session cannot launch a sandboxed delegate, report the limitation. Direct investigation can still use read-only operations where the playbook permits it.

### Independent writers

Create one Git worktree per concurrent writer from the verified base commit. Use the host worktree control or `git worktree add --detach "$worktree" "$base_commit"` when available. Explicitly supply each worktree to a separate workspace-write run. Clear additional writable roots and exclude the shared temporary roots so the sandbox keeps sibling worktrees outside each writer’s scope.

```sh
codex --ask-for-approval never exec --ephemeral --sandbox workspace-write \
  -c 'sandbox_workspace_write.writable_roots=[]' \
  -c 'sandbox_workspace_write.exclude_tmpdir_env_var=true' \
  -c 'sandbox_workspace_write.exclude_slash_tmp=true' \
  -C "$worktree" "$brief"
```

Have writers leave their changes in their own worktrees for the parent to inspect and commit. Launch separate CLI writers from the trusted host used for separate read-only reviews. If the required workspace isolation is unavailable, serialize implementation in the parent and report any lost parallel coverage. For separate CLI runs, pass a resolved model with `--model` and a supported effort with `-c 'model_reasoning_effort="<effort>"'`. For inherited seats, use the parent's values if exposed. Report defaults when the launcher cannot resolve them. Wait for each worker result and verify actionable findings or diffs in the parent.

## Resolve role models

Read `.pstack-models.json` from the repository root if it exists. Use the repository root because Codex protects `.codex/` from writes in its workspace sandbox. The file maps the role names used by pstack to an ordered list of seats. Each seat is `{ "model": "<Codex model ID>", "effort": "<reasoning effort>" }`, with `effort` optional, or the string `"inherit-parent"`. For example:

```json
{
  "swarm workers": ["inherit-parent"],
  "interrogate reviewers": ["inherit-parent", "inherit-parent"]
}
```

An absent role defaults to `inherit-parent`, with two independent seats for `arena runners` and `interrogate reviewers`. The user's explicit count controls the number of reviewers. `inherit-parent` means omit both overrides. For an explicit seat, use only model and effort values the current subagent tool supports. Consult the live Codex model catalog when the tool leaves values open. If a configured choice is unavailable or rejected, name it and retry once with both overrides omitted. Apply the same rules to one-off overrides.

Treat independent reviewers on the same provider as multiple perspectives. Call a review cross-provider only when the selected providers are known and differ. If no eligible cross-provider judge is available for Arena, skip that judge and report the gap.

### Configure with setup-pstack

From the target checkout, read the current role file and preserve roles the user is not changing. The native subagent tool schema takes precedence. If it does not enumerate choices and local Codex CLI access is available, use [the model catalog helper](../../skills/poteto-mode/scripts/codex-models.mjs) with `node`. It queries the visible model catalog and supported reasoning efforts through Codex App Server `model/list`. If neither source confirms a choice, offer `inherit-parent` for that role.

Honor choices supplied in the request. Use the session's structured question tool when a choice is needed, or ask in chat. Validate every chosen seat against the available overrides before writing the JSON file. Report the path and the roles updated. The next pstack invocation reads the file directly.
