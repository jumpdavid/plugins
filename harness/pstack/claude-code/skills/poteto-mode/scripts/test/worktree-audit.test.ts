import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const audit = fileURLToPath(new URL("../worktree-audit.sh", import.meta.url));

test("worktree audit requires known history and uses scoped, paginated Codex metadata", (ctx) => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "pstack-worktree-test-")));
  ctx.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = join(tmp, "repo");
  const bin = join(tmp, "bin");
  const paths = ["recent tree", "old", "pinned", "absent"].map((name) => join(tmp, name));
  const [recent, old, pinned, absent] = paths;

  mkdirSync(bin);
  for (const tool of ["origin", "gh"]) {
    writeFileSync(join(bin, tool), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  }
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-q", "--allow-empty", "-m", "fixture"]);
  for (const path of paths) execFileSync("git", ["-C", repo, "worktree", "add", "-q", "--detach", path, "HEAD"]);

  // Supply controlled timestamps through the CLI protocol. The audit still runs against real Git worktrees.
  writeFileSync(join(bin, "codex"), `#!/usr/bin/env node
const assert = require("node:assert/strict");
const { createInterface } = require("node:readline");
assert.deepEqual(process.argv.slice(2), ["app-server", "--stdio"]);
const paths = JSON.parse(process.env.PSTACK_AUDIT_PATHS);
const [recent, old, pinned] = paths;
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - 7 * 86400;
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  const send = (result) => console.log(JSON.stringify({ id, result }));
  if (method === "initialize") return send({});
  if (method === "initialized") return;
  assert.equal(method, "thread/list");
  assert.deepEqual(new Set(params.cwd), new Set(paths));
  assert.equal(params.currentAccountOnly, true);
  assert.equal(params.useStateDbOnly, true);
  assert(params.sourceKinds.includes("appServer"));
  if (process.env.PSTACK_AUDIT_UNSCOPED === "1") {
    return send({ data: [{ cwd: "/other/project", updatedAt: now }], nextCursor: null });
  }
  if (params.archived) return send({ data: [{ cwd: old, updatedAt: weekAgo }], nextCursor: null });
  if (params.cursor === null) return send({ data: [{ cwd: recent, updatedAt: now }], nextCursor: "page-2" });
  assert.equal(params.cursor, "page-2");
  send({ data: [{ cwd: pinned, updatedAt: weekAgo, section: { name: "Pinned" } }], nextCursor: null });
});
`, { mode: 0o755 });

  const run = (unscoped: string) => {
    const output = execFileSync("bash", [audit, "--history", "codex", "-b", "HEAD", repo], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        PSTACK_AUDIT_PATHS: JSON.stringify(paths),
        PSTACK_AUDIT_UNSCOPED: unscoped,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return new Map(output.trimEnd().split("\n").slice(2).map((line) => {
      const fields = line.split("\t");
      return [fields[8], { lastChat: fields[6], bucket: fields[7] }];
    }));
  };

  const rows = run("0");
  assert.equal(rows.get(recent)?.bucket, "verify-recent-chat");
  assert.equal(rows.get(pinned)?.bucket, "verify-recent-chat");
  assert.equal(rows.get(old)?.bucket, "safe");
  assert.deepEqual(rows.get(absent), { lastChat: "unknown", bucket: "review-history-unknown" });

  const rejectedRows = run("1");
  assert.equal(rejectedRows.size, paths.length);
  for (const row of rejectedRows.values()) {
    assert.deepEqual(row, { lastChat: "unknown", bucket: "review-history-unknown" });
  }
});
