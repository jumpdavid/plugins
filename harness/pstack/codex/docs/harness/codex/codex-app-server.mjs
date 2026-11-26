import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export async function withAppServer(clientName, run) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 15_000);
  const server = spawn("codex", ["app-server", "--stdio"], {
    stdio: ["pipe", "pipe", "ignore"],
    signal: controller.signal,
  });
  const lines = createInterface({ input: server.stdout });
  const replies = lines[Symbol.asyncIterator]();
  let nextId = 0;
  let failure;

  function closeOnError(error) {
    failure ??= error;
    lines.close();
  }

  server.on("error", closeOnError);
  server.stdin.on("error", closeOnError);

  function send(message) {
    server.stdin.write(JSON.stringify(message) + "\n");
  }

  async function request(method, params) {
    const id = ++nextId;
    send({ id, method, params });
    for (;;) {
      const { value, done } = await replies.next();
      if (done) break;
      const response = JSON.parse(value);
      if (response.method || response.id !== id) continue;
      if (response.error || !Object.hasOwn(response, "result")) {
        throw new Error("Codex App Server rejected " + method + ".");
      }
      return response.result;
    }
    if (controller.signal.aborted) throw new Error("Codex App Server timed out.");
    throw failure ?? new Error("Codex App Server closed before responding to " + method + ".");
  }

  try {
    await request("initialize", { clientInfo: { name: clientName, version: "1.0.0" } });
    send({ method: "initialized" });
    return await run(request);
  } finally {
    clearTimeout(deadline);
    lines.close();
    server.kill();
  }
}

export async function* listPages(request, method, params) {
  const seen = new Set();
  let cursor = null;
  do {
    const page = await request(method, { ...params, cursor });
    if (!Array.isArray(page?.data)) throw new Error("Invalid " + method + " page.");
    cursor = page.nextCursor;
    if (cursor !== null && (typeof cursor !== "string" || !cursor || seen.has(cursor))) {
      throw new Error("Invalid " + method + " cursor.");
    }
    seen.add(cursor);
    yield* page.data;
  } while (cursor !== null);
}
