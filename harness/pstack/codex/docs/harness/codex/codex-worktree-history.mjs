#!/usr/bin/env node

import { isAbsolute } from "node:path";
import { listPages, withAppServer } from "./codex-app-server.mjs";

const paths = process.argv.slice(2);
const updates = new Map(paths.map((path) => [path, null]));
if (updates.size === 0 || paths.some((path) => !isAbsolute(path))) {
  console.error("Expected absolute Git worktree paths.");
  process.exit(2);
}

try {
  await withAppServer("pstack-worktree-audit", async (request) => {
    for (const archived of [false, true]) {
      const params = {
        cwd: paths,
        archived,
        currentAccountOnly: true,
        useStateDbOnly: true,
        modelProviders: [],
        sourceKinds: ["cli", "vscode", "exec", "appServer", "subAgent", "subAgentReview", "subAgentCompact", "subAgentThreadSpawn", "subAgentOther", "unknown"],
      };
      for await (const thread of listPages(request, "thread/list", params)) {
        if (!updates.has(thread?.cwd)) throw new Error("Unscoped thread/list response.");
        if (!Number.isInteger(thread.updatedAt) || thread.updatedAt <= 0) {
          throw new Error("Invalid thread update time.");
        }
        const previous = updates.get(thread.cwd);
        updates.set(thread.cwd, {
          timestamp: Math.max(thread.updatedAt, previous?.timestamp ?? 0),
          hold: Boolean(previous?.hold || thread.status?.type === "active" || thread.section?.name === "Pinned"),
        });
      }
    }
  });
  console.log(JSON.stringify(Object.fromEntries(updates)));
} catch (error) {
  console.error("Could not read scoped Codex history. " + error.message);
  process.exitCode = 1;
}
