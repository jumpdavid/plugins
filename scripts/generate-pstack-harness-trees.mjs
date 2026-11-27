#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PSTACK = join(ROOT, "pstack");
const SKILLS = join(PSTACK, "skills");
// Outside pstack/ so Cursor, which copies the whole plugin folder, does not install this tree too.
const OUT = join(ROOT, "harness", "pstack");
const GUIDE = "docs/guide";
const GUIDE_IMAGES = `${GUIDE}/images`;
const HARNESSES = [
  { tree: "claude-code", name: "Claude Code", manifests: ["plugin.json", ".claude-plugin/plugin.json"], assets: [GUIDE_IMAGES] },
  { tree: "codex", name: "Codex", manifests: ["plugin.json"], assets: ["docs/harness/codex"], runtimeOnly: true, adapterSections: { statechart: "run-statechart" } },
];
const COMMAND = "node scripts/generate-pstack-harness-trees.mjs";
const GITHUB = "https://github.com/cursor/plugins";
const RAW_GITHUB = "https://raw.githubusercontent.com/cursor/plugins/main";
const LINK = /\]\(([^)\s]+)\)/g;
const README = `# pstack harness tree

This folder is generated from \`pstack/skills\`, \`pstack/agents\`, \`pstack/${GUIDE}\`, \`pstack/docs/harness\`, \`pstack/README.md\`, \`pstack/LICENSE\`, and \`pstack/plugin.json\`. Do not edit it by hand.

Cursor uses \`pstack/\` directly. Claude Code installs \`claude-code/\` through its marketplace. For Codex, follow the [installation steps](codex/docs/harness/codex.md#install).

Each generated tree includes its own adapter and the files it uses. The Codex package ships runtime skill files. Its tests and compile-only fixtures remain in the source tree. A relative link to an omitted source asset points to that asset on GitHub \`main\`.

After editing those sources, run \`${COMMAND}\` from the repository root and commit the result.
`;

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/ },
];
const ROUTE_KEY = "Run another pstack skill";
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

const skills = readdirSync(SKILLS).filter((name) => existsSync(join(SKILLS, name, "SKILL.md")));

function classify(skill) {
  const dir = join(SKILLS, skill);
  const others = skills.filter((name) => name !== skill).join("|");
  const route = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
  const linksToSkill = (line, name) => line.includes(`(../${name}/`);
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(({ groups }) => !linksToSkill(line, groups.bold ?? groups.command));
  const usesCursorNames = new Set();
  for (const path of walk(dir).filter((path) => path.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const term of TERMS) if (term.re.test(text)) usesCursorNames.add(term.key);
    if (text.split("\n").some(namesBareSkill)) usesCursorNames.add(ROUTE_KEY);
  }
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  const wrap = usesCursorNames.size > 0 && /^# /m.test(text);
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return { usesCursorNames, wrap, frontmatter };
}

const classes = new Map(skills.map((skill) => [skill, classify(skill)]));
const problems = [];
const users = new Map();
for (const [skill, { usesCursorNames, wrap, frontmatter }] of classes) {
  if (usesCursorNames.size > 0 && !wrap) problems.push(`skills/${skill}/SKILL.md uses Cursor names but has no H1`);
  for (const key of usesCursorNames) users.set(key, [...(users.get(key) ?? []), skill]);
  // Cursor runs a skill by its folder name and Claude Code lists it by its frontmatter `name`, so the two must match. The Agent Skills spec limits both to SKILL_NAME.
  const name = frontmatter.match(/^name:(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (name !== skill) problems.push(`skills/${skill}/SKILL.md has name ${JSON.stringify(name ?? "")}, not its folder name ${skill}`);
  if (!SKILL_NAME.test(skill) || skill.length > 64) problems.push(`skills/${skill} is not lowercase words joined by hyphens, at most 64 characters`);
}
for (const { tree, name } of HARNESSES) {
  const adapter = readFileSync(join(PSTACK, "docs/harness", `${tree}.md`), "utf8");
  for (const [key, using] of users) {
    if (!adapter.includes(key)) problems.push(`${name} adapter has no row for ${key}, used by ${using.join(", ")}`);
  }
}
for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length > 0) process.exit(1);

// The pstack-relative path that a relative link in `from` points at, if that path exists.
function resolve(from, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const path = posix.join(posix.dirname(from), target).replace(/\/$/, "");
  return existsSync(join(PSTACK, path)) ? path : undefined;
}

function has(files, path) {
  return files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
}

function isSkillTest(path) {
  const directories = relative(SKILLS, dirname(path)).split(sep);
  return directories.some((dir) => dir === "test" || dir === "tests")
    || /\.(?:test(?:-helper)?|compile)\.[cm]?[jt]sx?$/.test(basename(path));
}

function render({ tree, name, assets, manifests, runtimeOnly = false, adapterSections = {} }) {
  const adapter = `docs/harness/${tree}.md`;
  const copies = [
    ...walk(SKILLS).filter((path) => !runtimeOnly || !isSkillTest(path)),
    ...walk(join(PSTACK, "agents")),
    ...walk(join(PSTACK, GUIDE)).filter((path) => path.endsWith(".md")),
    join(PSTACK, adapter),
    ...assets.flatMap((dir) => walk(join(PSTACK, dir))),
    join(PSTACK, "README.md"),
  ];
  const files = new Map(copies.map((path) => [relative(PSTACK, path), file(path)]));
  const adapterLocation = tree === "codex"
    ? " Resolve the installed SKILL.md with `realpath`, then open `../../docs/harness/codex.md` from its physical directory. The generated package root ends in `harness/pstack/codex`. If the adapter read fails, correct the path before using workflow tools or reading task files."
    : "";
  const line =
    `In ${name}, read [the ${name} adapter](../../${adapter}) once per session before you follow this skill. ` +
    `It maps the Cursor names in pstack skills to ${name}.` + adapterLocation;
  for (const [skill, { wrap, frontmatter }] of classes) {
    const path = `skills/${skill}/SKILL.md`;
    const text = files.get(path).bytes.toString("utf8");
    const section = adapterSections[skill];
    const entry = section
      ? `In ${name}, read [the ${name} runtime instructions](../../${adapter}#${section}) before you follow this skill.` + adapterLocation
      : line;
    const playbookEntry = tree === "codex" && skill === "poteto-mode"
      ? "\n\nFor a new playbook, read the project instructions, the Codex adapter, and the selected playbook before opening task evidence. After these reads, use the native `update_plan` tool before any task-specific inspection. Make one entry for each of the playbook's steps, in order. Keep short checkpoints and final review as separate steps. Mark the first step in progress, then update the full plan before starting each later step. Follow the adapter's [plan tracking](../../docs/harness/codex.md#plan-tracking) for nested workflows and unavailable tools."
      : "";
    if (wrap || section) files.get(path).bytes = Buffer.from(text.replace(/^(# .*)\n+/m, `$1\n\n${entry}${playbookEntry}\n\n`));
    const policy = `skills/${skill}/agents/openai.yaml`;
    if (tree === "codex" && !files.has(policy) && /^disable-model-invocation:[ \t]*true[ \t]*$/m.test(frontmatter)) {
      files.set(policy, {
        bytes: Buffer.from("policy:\n  allow_implicit_invocation: false\n"),
        executable: false,
      });
    }
  }
  files.set("LICENSE", file(join(PSTACK, "LICENSE")));
  for (const manifest of manifests) files.set(manifest, file(join(PSTACK, "plugin.json")));
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const text = entry.bytes.toString("utf8").replace(LINK, (link, href) => {
      const target = resolve(path, href);
      if (!target || target.split("/")[0] === ".." || has(files, target)) return link;
      const kind = statSync(join(PSTACK, target)).isDirectory() ? "tree" : "blob";
      const upstream = kind === "blob" && target.startsWith(`${GUIDE_IMAGES}/`)
        ? RAW_GITHUB
        : `${GITHUB}/${kind}/main`;
      return `](${upstream}/pstack/${target}${href.slice(href.search(/[#?]|$/))})`;
    });
    entry.bytes = Buffer.from(text);
  }
  return files;
}

// Each install reads its own tree, so links to packaged assets must resolve locally.
const rendered = new Map([["README.md", { bytes: Buffer.from(README), executable: false }]]);
const dangling = [];
for (const harness of HARNESSES) {
  const files = render(harness);
  for (const [path, entry] of files) {
    rendered.set(`${harness.tree}/${path}`, entry);
    if (!path.endsWith(".md")) continue;
    for (const [, href] of entry.bytes.toString("utf8").matchAll(LINK)) {
      const target = resolve(path, href);
      if (target && !has(files, target)) dangling.push(`harness/pstack/${harness.tree}/${path} links to ${href}, which is not in the tree`);
    }
  }
}
for (const link of dangling) console.log(`FAIL ${link}`);
if (dangling.length > 0) process.exit(1);

if (process.argv.includes("--check")) {
  const onDisk = new Map(existsSync(OUT) ? walk(OUT).map((path) => [relative(OUT, path), file(path)]) : []);
  const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])].sort().filter((path) => {
    const [want, have] = [rendered.get(path), onDisk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(`harness/pstack/${path}`);
  if (drifted.length > 0) {
    console.log(`harness/pstack is out of date. Run \`${COMMAND}\` and commit the result.`);
    process.exit(1);
  }
  console.log("harness/pstack is up to date.");
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [path, { bytes, executable }] of rendered) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), bytes);
    chmodSync(join(OUT, path), executable ? 0o755 : 0o644);
  }
  for (const { name, adapterSections = {} } of HARNESSES) {
    const wrapped = [...classes].filter(([skill, { wrap }]) => wrap || adapterSections[skill]).length;
    console.log(`${name}: ${skills.length} skills, ${wrapped} SKILL.md files with an adapter line`);
  }
}
