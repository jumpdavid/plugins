import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const audit = fileURLToPath(new URL("../worktree-audit.sh", import.meta.url));
const models = fileURLToPath(new URL("../codex-models.mjs", import.meta.url));

test("worktree audit requires known history and uses scoped, paginated Codex metadata", (ctx) => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "pstack-worktree-test-")));
  ctx.after(() => rmSync(tmp, { recursive: true, force: true }));
  const repo = join(tmp, "repo");
  const bin = join(tmp, "bin");
  const paths = ["recent tree", "old", "pinned", "absent", "closed", "untracked", "missing"].map((name) => join(tmp, name));
  const [recent, old, pinned, absent, closed, untracked, missing] = paths;

  mkdirSync(bin);
  writeFileSync(join(bin, "origin"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  writeFileSync(join(bin, "gh"), "#!/bin/sh\necho '[{\"number\":4,\"state\":\"CLOSED\",\"headRefName\":\"abandoned\"}]'\n", { mode: 0o755 });
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-q", "--allow-empty", "-m", "fixture"]);
  for (const path of paths) {
    const branch = path === closed ? ["-b", "abandoned"] : ["--detach"];
    execFileSync("git", ["-C", repo, "worktree", "add", "-q", ...branch, path, "HEAD"]);
  }
  execFileSync("git", ["-C", closed, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-q", "--allow-empty", "-m", "unmerged"]);
  writeFileSync(join(untracked, "draft.txt"), "Keep this file.\n");
  rmSync(missing, { recursive: true });

  // Supply controlled timestamps through the CLI protocol. The audit still runs against real Git worktrees.
  writeFileSync(join(bin, "codex"), `#!/usr/bin/env node
const assert = require("node:assert/strict");
const { createInterface } = require("node:readline");
assert.deepEqual(process.argv.slice(2), ["app-server", "--stdio"]);
const paths = JSON.parse(process.env.PSTACK_AUDIT_PATHS);
const [recent, old, pinned, , closed, untracked, missing] = paths;
const now = Math.floor(Date.now() / 1000);
const weekAgo = now - 7 * 86400;
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  const send = (result) => console.log(JSON.stringify({ id, result }));
  if (method === "initialize") return send({});
  if (method === "initialized") return;
  if (method === "model/list") {
    const model = params.cursor === null ? "first-model" : "second-model";
    const nextCursor = params.cursor === null || process.env.PSTACK_REPEAT_CURSOR ? "models-2" : null;
    return send({ data: [{ model, supportedReasoningEfforts: [{ reasoningEffort: "low" }] }], nextCursor });
  }
  assert.equal(method, "thread/list");
  assert.deepEqual(new Set(params.cwd), new Set(paths));
  assert.equal(params.currentAccountOnly, true);
  assert.equal(params.useStateDbOnly, true);
  assert(params.sourceKinds.includes("appServer"));
  if (process.env.PSTACK_AUDIT_UNSCOPED === "1") {
    return send({ data: [{ cwd: "/other/project", updatedAt: now }], nextCursor: null });
  }
  if (params.archived) return send({
    data: [old, closed, untracked, missing].map(cwd => ({ cwd, updatedAt: weekAgo })),
    nextCursor: null,
  });
  if (params.cursor === null) return send({ data: [{ cwd: recent, updatedAt: now }], nextCursor: "page-2" });
  assert.equal(params.cursor, "page-2");
  send({ data: [{ cwd: pinned, updatedAt: weekAgo, section: { name: "Pinned" } }], nextCursor: null });
});
`, { mode: 0o755 });

  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, PSTACK_AUDIT_PATHS: JSON.stringify(paths) };
  const run = (unscoped: string) => {
    const output = execFileSync("bash", [relative(tmp, audit), "--history", "codex", "-b", "HEAD", repo], {
      cwd: tmp,
      encoding: "utf8",
      env: { ...env, PSTACK_AUDIT_UNSCOPED: unscoped },
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
  assert.equal(rows.get(closed)?.bucket, "review");
  assert.equal(rows.get(untracked)?.bucket, "hold-untracked");
  assert.equal(rows.get(missing)?.bucket, "review-git-unknown");

  const rejectedRows = run("1");
  assert.equal(rejectedRows.size, paths.length);
  for (const row of rejectedRows.values()) {
    assert.equal(row.lastChat, "unknown");
    assert.notEqual(row.bucket, "safe");
  }

  const catalog = spawnSync(process.execPath, [models], { env, encoding: "utf8" });
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.deepEqual(JSON.parse(catalog.stdout), [
    { model: "first-model", efforts: ["low"] },
    { model: "second-model", efforts: ["low"] },
  ]);
  const repeated = spawnSync(process.execPath, [models], {
    env: { ...env, PSTACK_REPEAT_CURSOR: "1" },
    encoding: "utf8",
  });
  assert.equal(repeated.status, 1);
  assert.equal(repeated.stdout, "");
  assert.match(repeated.stderr, /Invalid model\/list cursor/);
});
