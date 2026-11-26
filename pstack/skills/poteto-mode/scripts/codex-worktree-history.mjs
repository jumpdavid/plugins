import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const paths = process.argv.slice(2);
const updates = new Map(paths.map((path) => [path, null]));
if (updates.size === 0 || paths.some((path) => !path.startsWith("/"))) {
  console.error("Expected absolute Git worktree paths.");
  process.exit(2);
}

const server = spawn("codex", ["app-server", "--stdio"], {
  stdio: ["pipe", "pipe", "ignore"],
  signal: AbortSignal.timeout(15_000),
});
const lines = createInterface({ input: server.stdout });
const replies = lines[Symbol.asyncIterator]();
let nextId = 0;

server.on("error", () => lines.close());
server.stdin.on("error", () => lines.close());

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

async function request(method, params) {
  const id = ++nextId;
  send({ id, method, params });
  for (;;) {
    const { value, done } = await replies.next();
    if (done) throw new Error("Codex App Server closed before responding.");
    const response = JSON.parse(value);
    if (response.id !== id) continue;
    if (!response.result) throw new Error(`Codex App Server rejected ${method}.`);
    return response.result;
  }
}

try {
  await request("initialize", { clientInfo: { name: "pstack-worktree-audit", version: "1.0.0" } });
  send({ method: "initialized" });

  for (const archived of [false, true]) {
    let cursor = null;
    const seenCursors = new Set();
    do {
      const page = await request("thread/list", {
        cwd: paths,
        archived,
        cursor,
        currentAccountOnly: true,
        useStateDbOnly: true,
        modelProviders: [],
        sourceKinds: ["cli", "vscode", "exec", "appServer", "subAgent", "subAgentReview", "subAgentCompact", "subAgentThreadSpawn", "subAgentOther", "unknown"],
      });
      for (const thread of page.data) {
        // An older server must not silently ignore the cwd filter.
        if (!updates.has(thread.cwd)) throw new Error("Unscoped thread/list response.");
        const previous = updates.get(thread.cwd);
        const timestamp = Number.isInteger(thread.updatedAt) && thread.updatedAt > 0 ? thread.updatedAt : 0;
        updates.set(thread.cwd, {
          timestamp: Math.max(timestamp, previous?.timestamp ?? 0),
          hold: Boolean(previous?.hold || thread.status?.type === "active" || thread.section?.name === "Pinned"),
        });
      }
      cursor = page.nextCursor;
      if (cursor !== null && (typeof cursor !== "string" || seenCursors.has(cursor))) {
        throw new Error("Invalid thread/list cursor.");
      }
      seenCursors.add(cursor);
    } while (cursor !== null);
  }

  console.log(JSON.stringify(Object.fromEntries(updates)));
} catch (error) {
  console.error(`Could not read scoped Codex history. ${error.message}`);
  process.exitCode = 1;
} finally {
  lines.close();
  server.kill();
}
