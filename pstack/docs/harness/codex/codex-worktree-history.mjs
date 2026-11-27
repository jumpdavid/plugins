#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { listPages, withAppServer } from "./codex-app-server.mjs";

const paths = process.argv.slice(2);
const updates = new Map(paths.map((path) => [path, null]));
const pathActions = new Set(["read", "listFiles", "search"]);
if (updates.size === 0 || paths.some((path) => !isAbsolute(path))) {
  console.error("Expected absolute Git worktree paths.");
  process.exit(2);
}

function record(path, timestamp, hold) {
  const previous = updates.get(path);
  updates.set(path, {
    timestamp: Math.max(timestamp, previous?.timestamp ?? 0),
    hold: Boolean(hold || previous?.hold),
  });
}

function isInside(root, cwd) {
  const subpath = relative(root, cwd);
  return subpath !== ".." && !subpath.startsWith(".." + sep) && !isAbsolute(subpath);
}

function physicalPath(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

try {
  const inventory = execFileSync("git", ["worktree", "list", "--porcelain", "-z"], { encoding: "utf8" });
  const projectWorktrees = new Set(inventory.split("\0")
    .filter(field => field.startsWith("worktree ")).map(field => field.slice("worktree ".length)));
  if (paths.some(path => !projectWorktrees.has(path))) {
    throw new Error("Expected worktree paths from the current Git repository.");
  }
  const physicalWorktrees = new Map(paths.map(path => [path, physicalPath(path)]));
  const recentSince = Math.floor(Date.now() / 1000) - 5 * 86400;
  await withAppServer("pstack-worktree-audit", async (request) => {
    for (const archived of [false, true]) {
      const params = {
        cwd: [...projectWorktrees],
        archived,
        currentAccountOnly: true,
        useStateDbOnly: true,
        modelProviders: [],
        sourceKinds: ["cli", "vscode", "exec", "appServer", "subAgent", "subAgentReview", "subAgentCompact", "subAgentThreadSpawn", "subAgentOther", "unknown"],
      };
      for await (const thread of listPages(request, "thread/list", params)) {
        if (!projectWorktrees.has(thread?.cwd)) throw new Error("Unscoped thread/list response.");
        if (!Number.isInteger(thread.updatedAt) || thread.updatedAt <= 0) {
          throw new Error("Invalid thread update time.");
        }
        const hold = thread.status?.type === "active" || thread.section?.name === "Pinned";
        if (updates.has(thread.cwd)) record(thread.cwd, thread.updatedAt, hold);
        if (!hold && thread.updatedAt <= recentSince) continue;

        if (typeof thread.id !== "string" || !thread.id) throw new Error("Missing scoped thread ID.");
        for await (const { item } of listPages(request, "thread/items/list", { threadId: thread.id, limit: 100 })) {
          if (item?.type !== "commandExecution") continue;
          if (typeof item.cwd !== "string" || !isAbsolute(item.cwd)) {
            throw new Error("Missing command working directory.");
          }
          const targets = [item.cwd];
          if (Array.isArray(item.commandActions)) {
            for (const action of item.commandActions) {
              if (pathActions.has(action?.type) && typeof action.path === "string" && isAbsolute(action.path)) {
                targets.push(action.path);
              }
            }
          }
          const physicalTargets = targets.map(physicalPath);
          for (const [path, resolved] of physicalWorktrees) {
            if (targets.some(target => isInside(path, target)) ||
                physicalTargets.some(target => isInside(resolved, target))) {
              record(path, thread.updatedAt, hold);
            }
          }
        }
      }
    }
  });
  console.log(JSON.stringify(Object.fromEntries(updates)));
} catch (error) {
  console.error("Could not read scoped Codex history. " + error.message);
  process.exitCode = 1;
}
