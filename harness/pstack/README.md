# pstack harness tree

This folder is generated from `pstack/skills`, `pstack/agents`, `pstack/docs/guide`, `pstack/docs/harness`, `pstack/README.md`, `pstack/LICENSE`, and `pstack/plugin.json`. Do not edit it by hand.

Cursor uses `pstack/` directly. Claude Code installs `claude-code/` through its marketplace. For Codex, link this checkout's `harness/pstack/codex/skills` to `.agents/skills/pstack` in the target project, then invoke `$poteto-mode`. Read [the Codex adapter](codex/docs/harness/codex.md) for setup.

Each generated tree includes its own adapter and the files it uses. The Codex package ships runtime skill files. Its tests and compile-only fixtures remain in the source tree. A relative link to an omitted source asset points to that asset on GitHub `main`.

After editing those sources, run `node scripts/generate-pstack-harness-trees.mjs` from the repository root and commit the result.
