import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const event = JSON.parse(readFileSync(0, "utf8"));
if (
  typeof event?.prompt !== "string" ||
  typeof event.session_id !== "string" ||
  event.session_id.length === 0
) throw new Error("Expected a Codex UserPromptSubmit prompt and session ID");

const directory = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "pstack", "mode");
const session = join(directory, createHash("sha256").update(event.session_id).digest("hex"));
const commands = new Map([["poteto-mode on", "on"], ["poteto-mode off", "off"]]);
const action = commands.get(event.prompt.trim());

function readMode() {
  try {
    const mode = readFileSync(session, "utf8");
    if (mode === "on" || mode === "off") return mode;
    throw new Error("Invalid persisted poteto mode");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return "off";
  }
}

function writeMode(mode) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const staging = join(directory, randomUUID());
  try {
    writeFileSync(staging, mode, { flag: "wx", mode: 0o600 });
    renameSync(staging, session);
  } finally {
    rmSync(staging, { force: true });
  }
}

function context() {
  if (action) {
    writeMode(action);
    return `The user set poteto mode to ${action} for this session. Confirm in one sentence. Treat this message as a mode command.`;
  }
  const mode = readMode();
  if (mode === "on") {
    const skill = fileURLToPath(new URL("../../../skills/poteto-mode/SKILL.md", import.meta.url));
    return `Poteto mode is on for this session. Read ${skill} and its linked Codex adapter, then follow the skill's matching playbook before starting the current request.`;
  }
  return "Poteto mode is off for this session. Stop applying it from earlier turns or a forked chat's inherited history. Honor any explicit skill invocation on this turn.";
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context() },
}));
