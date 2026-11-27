import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("../docs/harness/codex/codex-mode-hook.mjs", import.meta.url));
const skill = fileURLToPath(new URL("../skills/poteto-mode/SKILL.md", import.meta.url));
const active = "thr_active";
const other = "thr_other";

function invoke(home: string, session: string, prompt: string) {
  return spawnSync(process.execPath, [hook], {
    env: { ...process.env, CODEX_HOME: home },
    input: JSON.stringify({ session_id: session, prompt }),
    encoding: "utf8",
  });
}

test("the hook applies mode only to its own session and honors turn-level invocation after off", (t) => {
  const home = mkdtempSync(join(tmpdir(), "pstack-mode-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const state = join(home, "pstack", "mode", createHash("sha256").update(active).digest("hex"));
  function send(session: string, prompt: string) {
    const result = invoke(home, session, prompt);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).hookSpecificOutput?.additionalContext;
  }

  assert.match(send(active, "Explain what poteto-mode on does."), /Poteto mode is off/);
  assert.equal(existsSync(state), false);
  assert.match(send(active, "poteto-mode on"), /set poteto mode to on/);
  assert.match(send(active, "Inspect the test workflow."), /Poteto mode is on/);
  assert.ok(send(active, "Inspect CI.").includes(skill));
  assert.match(send(other, "Inspect the test workflow."), /Poteto mode is off.*forked chat's inherited history/);
  assert.match(send(other, "$poteto-mode Read the README."), /Honor any explicit skill invocation/);
  const otherState = join(home, "pstack", "mode", createHash("sha256").update(other).digest("hex"));
  assert.equal(existsSync(otherState), false);

  assert.match(send(active, "poteto-mode off"), /set poteto mode to off/);
  const after = send(active, "Inspect the test workflow.");
  assert.match(after, /Poteto mode is off/);
  assert.match(send(active, "$poteto-mode Read the README."), /Honor any explicit skill invocation/);
  assert.equal(readFileSync(state, "utf8"), "off");
});

test("an empty session ID cannot change mode state", (t) => {
  const home = mkdtempSync(join(tmpdir(), "pstack-mode-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const result = invoke(home, "", "poteto-mode on");
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(home, "pstack")), false);
});

test("an opaque session ID stays inside the mode state directory", (t) => {
  const home = mkdtempSync(join(tmpdir(), "pstack-mode-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const result = invoke(home, "../../outside", "poteto-mode on");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(home, "outside")), false);
  assert.match(invoke(home, "../../outside", "Inspect CI.").stdout, /Poteto mode is on/);
});
