# Verification in Codex

## Pre-commit cleanup

Use Git in the current worktree. Find the merge base against the intended PR base and review the branch diff through the working tree. Include staged and unstaged changes and any untracked files intended for the PR. Preserve unrelated work.

Read `cursor-team-kit/skills/deslop/SKILL.md` directly when it is available. Otherwise, check the patch for redundant comments, unnecessary guards or exception handling on trusted paths, casts that bypass type checking, avoidable nesting, and inconsistencies with surrounding code. Apply focused, behavior-preserving edits. Reread the resulting patch, run `git diff --check <merge-base>` and the repository's checks for the touched paths, and record the results before committing.

## Visual evidence

Use the project's existing browser, Electron, or visual regression driver when available. Otherwise, drive the local app with Codex's browser or computer tools or a local automation driver that can capture the required surface. Capture the baseline before editing. Use the same browser, viewport, device scale, fonts, theme, and application state for each paired capture. Wait for the target view to settle.

Use the project's image comparator or an available local pixel comparator. Compare decoded pixels at zero tolerance and check that the image dimensions match. For example, ImageMagick can report the peak pixel error and save a diff with `magick compare -metric PAE -fuzz 0 baseline.png actual.png diff.png`. Save each capture to a new file and keep the baseline. Require matching dimensions and a zero pixel error to pass. Record the artifact paths and comparison result, then recapture and compare after each fix. If the target surface cannot be captured or a valid comparison cannot run, report the blocker and leave parity unverified.
