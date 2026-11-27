import { execFileSync } from "node:child_process";

try {
  const output = execFileSync("codex", ["debug", "models"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const { models } = JSON.parse(output);
  if (!Array.isArray(models)) throw new Error("Invalid Codex model catalog.");

  const choices = [];
  for (const entry of models) {
    if (typeof entry?.visibility !== "string") throw new Error("Invalid Codex model visibility.");
    if (entry.visibility !== "list") continue;
    if (typeof entry.slug !== "string" || !Array.isArray(entry.supported_reasoning_levels)) {
      throw new Error("Invalid Codex model entry.");
    }
    const efforts = entry.supported_reasoning_levels.map((option) => option?.effort);
    if (efforts.some((effort) => typeof effort !== "string")) {
      throw new Error("Invalid Codex reasoning effort.");
    }
    choices.push({ model: entry.slug, efforts });
  }
  process.stdout.write(JSON.stringify(choices, null, 2) + "\n");
} catch (error) {
  console.error("Could not read the Codex model catalog. " + error.message);
  process.exitCode = 1;
}
