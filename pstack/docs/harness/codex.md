# pstack in Codex

pstack skills use Cursor names. In Codex, apply the mappings below before following the shared skills and playbooks. Resolve skill-relative links from the physical `SKILL.md` path reported by discovery or `realpath`. A project link such as `.agents/skills/pstack` points to the installed `skills/` directory, so its logical path cannot locate sibling package files such as `docs/harness/codex.md`. Keep the task, scope, and checks from the original workflow.

## Install

For Babysit or Shipping on GitHub, prepare `watch-pr` from the plugin checkout in a terminal with write access and Bun on `PATH`. Run this for a fresh installation or after the watcher's package manifest or lockfile changes:

```sh
harness/pstack/codex/skills/poteto-mode/scripts/watch-pr/watch-pr --help
```

The launcher uses Bun to install the locked dependencies next to the watcher and prints its usage on success. Once prepared, a Codex session can start the watcher without write access to the installed skill.

Link this checkout's `harness/pstack/codex/skills` directory to `.agents/skills/pstack` in the target project. Open the target project in Codex and invoke `$poteto-mode`.

## Tools

| Cursor | Codex |
| --- | --- |
| `Task` | Spawn native Codex subagents using the available tool schema. Dispatch independent agents before waiting. Count a delegate after it returns usable evidence. If a call is rejected, check the tool schema and correct the call for missing seats. |
| `AskQuestion` | Use the host's structured user-input tool when available. Follow [Collect a user choice](#collect-a-user-choice). |
| Open a todolist or write playbook steps to it | Use `update_plan` in Default mode. Follow [Plan tracking](#plan-tracking). |
| Run another pstack skill (`/name` or “the **name** skill”) | Read the installed `skills/<name>/SKILL.md` and follow it with this adapter. Use `$<name>` for the project-skills installation. |
| `Grep`, `Glob` | Use `rg` and `rg --files` when the host exposes a shell. |

### Collect a user choice

Call the host's structured input tool, such as `request_user_input`, when available. Treat the native question as open only after the host accepts the tool call. If the tool is unavailable or the call fails to open a question, ask the same choices in chat and end the turn so the user can reply. Apply the choice only after receiving an answer. If the user cancels, leave the proposed changes unapplied.

### Plan tracking

Enable the Codex plan tool in user or trusted project configuration, then start a new session.

```toml
[tools.update_plan]
enabled = true
```

Read the adapter and the selected playbook or skill phases first. For a direct invocation, the first workflow action is `update_plan`. Call it before starting the first step or gathering evidence. Use the playbook's steps or the exact phase labels in the table below, with the first step `in_progress` and later steps `pending`. At each boundary call `update_plan` before starting the next phase. Send the complete ordered plan on each call. Every update replaces the previous plan, so keep the same labels and carry forward unchanged steps. A nested skill tracks progress in the caller's existing plan. If the tool is unavailable, report that native tracking is unavailable and list the steps in commentary.

For an optional phase whose decision is complete, use `explanation` to record the skip and its reason when advancing the plan. If a required phase cannot run, leave its step incomplete and report the missing prerequisite.

After resuming a thread, look for the most recent complete `update_plan` call in the restored conversation context. The history view may omit those updates. Before starting dependent work, submit the complete snapshot again with the same step labels, order, and statuses. Use a verified checkpoint when the restored context lacks the complete snapshot. If neither is available, report that the plan state is missing.

For a direct call, use the following phases:

| Skill | Plan |
| --- | --- |
| `arena` | Frame, Fan out, Cross-judge, Pick, Graft, Verify. Start Cross-judge before evaluating vendor availability. Record the result or the reason it was skipped before starting Pick. |
| `swarm` | Frame, Fan out, Aggregate, Report. Complete Fan out after collecting the requested coverage. |
| `interrogate` | Frame, Fan out, Verify, Report. Complete Frame and start Fan out before the first reviewer spawn. After all required reviewers return, complete Fan out and start Verify. Run the parent's independent evidence checks and command reruns during Verify. Start Report before preparing the final findings, then complete it before sending them. |

If required coverage is missing, leave Fan out open, report what is missing, and end the review. Resume when the required coverage is available. App Server reports real plan updates as `turn/plan/updated` events.

For `interrogate`, before completing Verify, record each retained finding with the parent command as submitted to the native tool and its result from Verify. In Report, copy that command verbatim, preserving the executable as invoked and every argument. Include the relevant output and any exit status the finding relies on. Attribute supporting reviewer evidence to its reviewer. Leave a finding unverified when the matching parent result is missing.

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
| `run_in_background: true` | Omit the field. Native agents run concurrently after dispatch. Start independent agents before waiting, and collect terminal results before work that depends on them. |
| `resume` | Follow up with the same agent when the workflow depends on state it holds. Otherwise start a fresh agent with the previous evidence. |
| `file_attachments` | Give the agent the paths in its brief. |

Use fresh context for native delegates in an ephemeral Codex session. Set `fork_context` to false when the tool exposes it, and include the task and absolute file paths in the brief. If a spawn reports that the parent has no stored rollout, retry only the missing delegate with fresh context and preserve its sandbox policy.

After a client disconnect, reconnect to the original running host before dispatching again. In App Server, use `thread/resume` with the stored parent thread ID and check the existing delegates' results. If another host reports an active writer, verify the original host's state before retrying. For a confirmed interruption, use [durable follow-up](#durable-follow-up) from the last verified checkpoint.

### Read-only delegation

The review needs a sandbox that enforces read-only access. A native subagent can inherit it from a read-only parent. An App Server host can set `sandboxPolicy: { "type": "readOnly", "networkAccess": false }` and `approvalPolicy: "never"` when starting the review turn. These overrides apply to subsequent turns until replaced. Set the authorized policies explicitly when switching between review and editing. A custom agent file inherits the parent's sandbox. When the parent must stay writable, a trusted host launcher can start a separate read-only CLI run against the same checkout.

```sh
codex --ask-for-approval never exec --ephemeral --sandbox read-only -C "$checkout" "$brief"
```

A trusted project can register a separate reviewer launcher in `.codex/config.toml`. Child CLI `mcp_servers` overrides merge with the loaded configuration. Disable the launcher and any other unused configured servers in the child. If the review needs neither plugin-provided servers nor app connectors, pass `--disable plugins --disable apps` to the child. Compare the enabled servers from `codex mcp list --json` with the intended allowlist using the child's feature and MCP overrides. Use `enabled_tools` to restrict the tools on each allowed server.

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
| `pstack-models.mdc` | Read `.pstack-models.json` from the repository root. Each role maps to an ordered list of seats. A seat is `"inherit-parent"` or an object with `model` and optional `effort`. The optional `budget` field records the last budget selected in setup. Dispatch reads the resulting seat values. |

An unconfigured role inherits the parent. The `arena runners` and `interrogate reviewers` roles default to two independent seats. Honor the explicit count in the request. If an explicit choice is unavailable, report it and inherit for that seat. For a cross-judge, require a known different vendor. Report a skipped cross-judge when no eligible route is available.

For example:

```json
{
  "swarm workers": ["inherit-parent"],
  "interrogate reviewers": ["inherit-parent", "inherit-parent"]
}
```

### Judge anonymized Eval outputs

For a blinded Eval, have the host start each candidate in a fresh session with a separate named permission profile. Grant read access to `":minimal"` runtime paths and scope the task's file permissions to that candidate's absolute project root. Keep the other candidates and judging material outside those roots. A parent using broad read-only access cannot supply this boundary to its native delegates.

In App Server, select the profile with `thread/start.permissions`. Before kickoff, verify that the same profile can read the candidate's inputs and rejects reads of the other candidates and the rubric. If the host cannot enforce those reads, report filesystem isolation as unverified.

When native dispatch cannot select a separate profile, use the operator-authorized `launch_eval_candidates` host tool if configured. Pass only the organic candidate prompt. Keep the rubric and judge instructions with the coordinator. The host binds the prompt to prepared candidate roots, launches the fresh sessions in parallel, and returns labeled results with the active profiles, isolation preflight results, and observed reads. Verify those receipts before dispatching the judge.

Use an eligible native judge when available. If none is available, the operator can authorize a configured host tool named `cross_vendor_judge` for the Eval judge step. Pass the parent and candidate vendors in `excludedVendors` using the host's canonical vendor IDs. Pass the rubric, shared reference facts, and anonymous labeled answers in `packet`. Keep variant names, model IDs, transcripts, credentials, and workspace paths out of the packet.

The host checks vendor eligibility before sending only the packet in a single call to its configured judge. Accept the result when the receipt identifies the actual vendor and model, the vendor is eligible, and the scores cover every label and rubric criterion. Independently check the result against the candidates. If the vendor cannot be established, no eligible route is authorized, or the result is incomplete, record the skipped or failed judge step before synthesizing.

## setup-pstack

- Read the repository-root `.pstack-models.json`. Files with only role entries are valid. Use the active host's effective model and effort choices. If the host exposes a `current_model_catalog` tool backed by its `model/list`, use it before the [local CLI catalog helper](codex/codex-models.mjs). A separate CLI process can load a different catalog from the session. Use its result when it shares the session's configuration. If the effective catalog cannot be established, report the missing information before changing a budget.
- If the user chooses Plan mode to collect native choices, keep `.pstack-models.json` unchanged in that mode and summarize the confirmed seats or budget. After the user switches the same conversation to Default and asks to apply the choices, re-read the file and validate them against the current model catalog before writing. A canceled or unanswered choice leaves the file unchanged.
- Offer the shared budget choices. When the user asks for a budget change, apply the choice to every configured model seat. Use the role's baseline to calculate each target. The baseline is `high` for `arena runners`, `arena cross-judge pool`, `swarm workers`, and `interrogate reviewers`, and `xhigh` for the other setup roles. Use `large` for zero steps down, `medium` for one step down, and `small` for two steps down on the ladder `xhigh`, `high`, `medium`, `low`.
- Set each seat's `effort` to the highest value that its existing model supports at or below the target. Keep model IDs, seat counts and order, and `inherit-parent` seats. Missing roles continue to inherit. If a configured model has no eligible effort or is unavailable, report the seat and resolve it before writing the budget change. Calculate each change from the baseline so repeated setup and changing back to a previous level give the same result.
- Validate the selected seats, then write the budget label as the top-level `budget` string in the same JSON object as the role arrays. Keep the budget and updated efforts together. When the user requests changes to specific roles only, update only those roles and keep any recorded budget.

## Paths

| Cursor | Codex |
| --- | --- |
| `.cursor/skills/` and `~/.cursor/skills/` | Install the generated `harness/pstack/codex/skills` in the target project's `.agents/skills/pstack`. Write project-owned skills in `.agents/skills/` using [a scoped authoring turn](#write-a-project-skill). |
| `~/.cursor/plugins/` and `.cursor-plugin/plugin.json` | Find the skills through Codex discovery. Resolve role briefs, guides, and runtime files from the generated tree next to `skills/`. |
| `.cursor/rules/` and always-applied rules | Follow project `AGENTS.md` and Codex configuration. Use the repository-root JSON file for pstack model roles. |
| `agent-transcripts` in the workspace | Use the Codex chat list and thread reader for the current project. Check active and pinned chats before worktree cleanup. If chat history is unavailable, report the gap. |

### Switch poteto mode inside a session

For a project that uses the generated skills link, add this handler to the project's `.codex/hooks.json`. Replace the example path with the physical path of the [installed hook](codex/codex-mode-hook.mjs). If `UserPromptSubmit` already has handlers, append this one.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node '/absolute/path/to/harness/pstack/codex/docs/harness/codex/codex-mode-hook.mjs'",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Trust the project and review the handler using `/hooks` in the CLI or Settings → Hooks in the app. Review the installed helper when updating it at the same path. Send `poteto-mode on` or `poteto-mode off` as its own chat message. The hook stores the selection under `$CODEX_HOME/pstack/mode/` by session ID and applies it to later prompts in that session, including after resume. Fresh chats and forks start with the mode off, including forks whose copied history contains earlier mode instructions. Use `$poteto-mode` when you want to invoke the skill for a single turn. [Codex hook trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)

### Read project chat history

Use a host reader scoped to the current account and project. Resolve thread IDs from a listing scoped to both before calling a thread reader, including for known IDs. With App Server, set `cwd` and `currentAccountOnly: true` on `thread/list`, then call `thread/items/list` for matching IDs. The desktop thread reader can return a message preview from another project on the same account even when turns are omitted. If no scoped listing or reader is available, report that project history is unavailable.

For parallel history mining, give the coordinator and delegates the same scoped read-only tool. A trusted MCP server can check project membership before reading turns. When the host must enforce isolation, offer delegates only the scoped reader for chat history. Assign each delegate a history slice and require a source thread ID. If only the coordinator can read scoped history, keep the reads there and report the narrower coverage.

### Write a project skill

Codex's workspace permissions protect `.agents/` by default. For generation or maintenance, use a host-selected authoring profile that grants write access to the named project skill. Keep the installed pstack package and other skills outside the write scope. Add a specific evidence or scratch directory when the verifier needs one.

When defining named profiles in a config file, set top-level `default_permissions` to the project's ordinary policy. This example uses `:workspace`.

```toml
default_permissions = ":workspace"

[permissions.pstack-skill-edit]
extends = ":read-only"

[permissions.pstack-skill-edit.filesystem.":workspace_roots"]
".agents/skills/verify-example" = "write"
```

Select the profile for the authoring session with `codex -c 'default_permissions="pstack-skill-edit"'`. An App Server host can select it through `turn/start.permissions` or grant the absolute target directory as a writable root when starting the approved edit. Keep review turns read-only. When the edit grant ends, explicitly restore the intended policy on the next turn.

If the host cannot grant the target, prepare the complete skill in a writable staging directory for trusted installation. Treat it as a draft until the final path is installed and a new session discovers and runs the skill.

## Cursor-only features

| Cursor | Codex |
| --- | --- |
| Cursor Automations | For Benny, follow [the Slack event handoff](#run-benny-from-slack-events) on a configured host. Record unavailable Cursor routine steps. |
| Webhook routines and `SendToUser` sender-key cards | For `make-bot-ui`, use [a host-configured webhook receiver](#connect-a-bot-ui-to-codex). |
| Bugbot | Follow [GitHub reviews](#follow-github-reviews) for Codex code review. Triage existing Bugbot findings as GitHub review threads using the forge commands in the playbook. |
| A built-in PR tool | Use the forge command the step provides, such as `gh pr create`. |
| `/loop` | Keep the current task active and run the named check until its exit condition is met. Use the watcher command when the playbook provides one. For a follow-up after disconnect, use [durable follow-up](#durable-follow-up). |
| `/create-skill` | Use `$skill-creator` when available. |
| `/deslop` | Read the bundled `cursor-team-kit/skills/deslop/SKILL.md` if available. Otherwise review the actual diff for redundant comments, unnecessary guards, type-check bypasses, avoidable nesting, and departures from surrounding code. Apply behavior-preserving edits and run `git diff --check` and the relevant tests before committing. |
| `control-ui`, `control-cli` | Run the behavior through the project's UI driver, the browser or computer tool, or the actual CLI entry point. For visual parity capture the baseline and target on the same surface and state. Require equal dimensions and zero decoded pixel difference. Keep the captures and comparator output as evidence. |

### Run Benny from Slack events

Use the committed Benny operational files and the operator's separate project configuration. Have each host run read its role's `SKILL.md` from the committed pack by path. Resolve shared pstack skills through the target's Codex installation. The host needs approved Slack thread and attachment actions, the tracker adapter, and the target app control adapter. Leave a stage disabled if its required actions or configured identities are missing.

Map the authenticated event's channel and message timestamp to `trigger.source_channel_id` and `trigger.ts`, including when the host exposes the timestamp as `message_ts`. Preserve the timestamps as strings and require the source channel to match configuration. A missing `thread_ts` or one equal to `ts` means a top-level report. A distinct `thread_ts` identifies the reply's root thread. [Slack thread coordinates](https://docs.slack.dev/messaging/retrieving-messages/#spotting-threads)

Start triage for a new top-level report. To start reproduction from a reply, filter for the configured triage identity in the source channel. The reproduction run must read the original thread and verify the author's identity, root coordinates, and exactly one bug or performance marker before acting. Keep posting and tracker writes with the coordinator and use the same source coordinates through both runs. Deduplicate event deliveries before starting another run for the same stage and root. ChatGPT web and mobile can filter eligible Slack event tasks by channel, author, and thread replies. When a host batches events, validate and dispatch each event with its own coordinates. Confirm the chosen host's actual payload and actions before enabling either stage. [Supported app events](https://learn.chatgpt.com/docs/automations#trigger-tasks-from-app-events)

### Connect a bot UI to Codex

Use an operator-configured authenticated receiver bound to a saved Codex thread. Skip the Cursor routine, sender-key card, and tailnet setup steps. If the receiver or thread binding is missing, name the missing prerequisite and stop before wiring or exposing the UI.

Send the declared JSON event from the UI backend. Keep the sender credential in the host's server-side credential store. The receiver authenticates, validates the payload against the declared actions and fields, and persists delivery state by its configured thread and event ID before delivery. On a replay, return the recorded state, including after a receiver restart.

Use [durable follow-up](#durable-follow-up) to deliver the validated event as data to the configured thread. After restarting, continue accepted events that have yet to be submitted. If the enqueue result is uncertain, keep the event pending until the receiving host provides evidence that resolves delivery for that thread and event ID.

Before reporting the connection live, send a harmless event. Verify that a new turn on the same thread completes with a result matching the event ID. An HTTP acceptance or enqueue receipt records delivery progress.

### Follow GitHub reviews

For automatic code review, the operator enables it in the connected repository's Codex settings and selects the trigger. For an authorized one-off review, use `@codex review` on the PR. [Codex GitHub code review](https://learn.chatgpt.com/docs/third-party/github#set-up-codex-code-review)

Use the Babysit watcher to check for running reviews and open threads. A clear watcher status means it detected no running review. When a step requires proof that Codex code review completed, verify the Connector's review receipt says `completed` and matches the PR's current head SHA. Triage posted findings through the playbook's review-thread workflow.

### Durable follow-up

A trusted host can enqueue a follow-up to a saved Codex thread:

```sh
codex queue --resume --thread "$thread" --message "$message"
```

This uses a running local daemon. To target an App Server endpoint supplied by the host, add `--remote "$endpoint"`. Use the original thread ID and include the verified checkpoint and next action in the message.

Record the enqueue and the new turn's terminal result separately. A successful CLI exit confirms the enqueue. If it warns that resume failed, check whether the named thread actually ran the follow-up. Another host can report `notLoaded` or `interrupted` while the receiving host is still running the turn. Before retrying, verify the terminal result on the receiving host or from a saved terminal event. Recover from the last verified checkpoint after a confirmed interruption. A watcher or scheduler owns the event that sends the follow-up.

For timed follow-ups, confirm the previous tick's terminal result on the same thread before arming the next. Keep an unverified tick pending while the turn is running. If the terminal result lacks the expected checkpoint, report the incomplete check. Stop scheduling when the workflow's completion condition is verified.

### Worktree cleanup

Use [the shared worktree audit](../../skills/poteto-mode/scripts/worktree-audit.sh) with `--history-command` set to the absolute installed path of [the Codex history reader](codex/codex-worktree-history.mjs). The reader scopes the history query to the current account and registered Git worktrees, including the main checkout. It uses saved command working directories and structured absolute targets from recent, pinned, or active threads to recognize activity in another worktree. It returns activity metadata for the worktrees being audited.

For commands from those scoped threads, the reader checks both the saved paths and their current physical paths. This includes reads through a working symlink to a registered worktree. If a link has disappeared or changed since the command ran, use direct confirmation from the original host before approving cleanup.

Before removing a `safe` candidate, cross-check active and pinned use with the original host for that project. Keep a candidate for review when live coverage or a command's target is uncertain. Use a trusted host to run the audit when the current command sandbox cannot start the history reader.

Use the original client's `item/started` and `item/completed` events for live commands. A trusted host with that subscription can combine saved history and live state in the existing `--history-command` result. Set `hold` for each worktree a running `commandExecution` item's working directory or structured absolute targets touch, and retain the newest known activity timestamp. Keep the response scoped to the current account and repository. An authorized client resuming a specific persistent thread on the same App Server can also recover the running command. For ephemeral threads, use the original client's event record. [App Server command events](https://learn.chatgpt.com/docs/app-server#command-execution)

Only a clean checkout whose commit is reachable from the selected base is eligible for cleanup. Hold unknown history, unknown Git state, and untracked or modified work. Use `git worktree remove <path>` for confirmed candidates. If Git refuses, keep the worktree and report the reason.
