import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const server = spawn("codex", ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "inherit"] });
const lines = createInterface({ input: server.stdout });
const models = [];
let stopped = false;

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

function list(cursor = null) {
  send({ id: 2, method: "model/list", params: { cursor, includeHidden: true } });
}

function stop(error) {
  if (stopped) return;
  stopped = true;
  clearTimeout(timeout);
  lines.close();
  server.kill();
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

const timeout = setTimeout(() => stop("Timed out reading the Codex model catalog."), 15_000);
server.once("error", (error) => stop(error.message));
server.stdin.once("error", (error) => stop(error.message));
lines.once("close", () => stop("Codex App Server closed before returning the model catalog."));
lines.on("line", (line) => {
  const { id, result, error } = JSON.parse(line);
  if (error) {
    stop(error.message);
  } else if (id === 1) {
    send({ method: "initialized" });
    list();
  } else if (id === 2) {
    for (const entry of result.data) {
      models.push({
        model: entry.model,
        efforts: entry.supportedReasoningEfforts.map(({ reasoningEffort }) => reasoningEffort),
      });
    }

    if (result.nextCursor) {
      list(result.nextCursor);
    } else {
      stop();
      console.log(JSON.stringify(models, null, 2));
    }
  }
});

send({ id: 1, method: "initialize", params: { clientInfo: { name: "pstack-models", version: "1.0.0" } } });
