---
name: how
description: "Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). Explains subsystem architecture, runtime flow, onboarding mental models. Use why for motivation."
disable-model-invocation: true
---

# How

In Claude Code, read [the Claude Code adapter](../../docs/harness/claude-code.md) once per session before you follow this skill. It maps the Cursor names in pstack skills to Claude Code.

Explore the codebase to answer "how does X work?" questions.

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

## 1. Explain

In Codex, follow [the delegation adapter](../../docs/harness/codex.md#delegate-through-codex) and use one read-only delegate. In an already read-only Codex session, the native subagent inherits that sandbox. If no delegated path can enforce read-only access, report the limitation and explore the codebase yourself without editing files.

Outside Codex, spawn one Task subagent with `subagent_type: generalPurpose` and `readonly: true`, applying the host adapter's tool mappings when provided.

Give the subagent the user's question and this brief. If you are exploring directly, use the same brief:

> You are writing an architectural explanation for a senior engineer. Explore the codebase and write an explanation that a senior engineer unfamiliar with this area could read and walk away with a solid mental model. They should understand the architecture well enough to start working in it confidently. Use only read-only operations.

## 2. Present

Present the explanation. When a subagent wrote it, edit lightly for clarity or conversational context.
