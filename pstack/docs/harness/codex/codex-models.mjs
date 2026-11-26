import { listPages, withAppServer } from "./codex-app-server.mjs";

try {
  const models = await withAppServer("pstack-models", async (request) => {
    const choices = [];
    for await (const entry of listPages(request, "model/list", {})) {
      if (typeof entry?.model !== "string" || !Array.isArray(entry.supportedReasoningEfforts)) {
        throw new Error("Invalid Codex model entry.");
      }
      const efforts = entry.supportedReasoningEfforts.map((option) => option?.reasoningEffort);
      if (efforts.some((effort) => typeof effort !== "string")) {
        throw new Error("Invalid Codex reasoning effort.");
      }
      choices.push({ model: entry.model, efforts });
    }
    return choices;
  });
  console.log(JSON.stringify(models, null, 2));
} catch (error) {
  console.error("Could not read the Codex model catalog. " + error.message);
  process.exitCode = 1;
}
