/** Pure planning of a Launch: which session-only files to create and how to start the Runtime. */
import { join } from "node:path";
import { stringify } from "yaml";
import { CapsuleError, type Capsule } from "./capsule.js";

export type Runtime = "claude" | "pi";

export interface LaunchRequest {
  runtime: Runtime;
  main?: Capsule;
  subagents: Capsule[];
  passthrough: string[];
  /** Temporary directory owned by this session; every planned file lives under it. */
  sessionDir: string;
}

export type PlannedFile = { path: string; content: string } | { path: string; copyFrom: string };

export interface LaunchPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
  files: PlannedFile[];
}

/** The main Capsule's Role as a session file, since runtimes append prompts from files. */
function mainRole(main: Capsule, sessionDir: string): PlannedFile & { content: string } {
  return { path: join(sessionDir, "main-role.md"), content: main.role };
}

/** A session-only Claude Code plugin carrying a Capsule's skills, namespaced `capsule:skill`. */
function claudeSkillsPlugin(capsule: Capsule, sessionDir: string): { dir: string; files: PlannedFile[] } {
  const dir = join(sessionDir, "claude", capsule.name);
  const files: PlannedFile[] = [
    {
      path: join(dir, ".claude-plugin", "plugin.json"),
      content: JSON.stringify({ name: capsule.name, description: capsule.description }, null, 2) + "\n",
    },
  ];
  for (const skill of capsule.skills) files.push({ path: join(dir, "skills", skill.name), copyFrom: skill.dir });
  return { dir, files };
}

/** Subagents go through `--agents` rather than plugin agents so they keep their bare Capsule names. */
function claudeAgents(subagents: Capsule[]): string {
  const agents: Record<string, { description: string; prompt: string; skills?: string[] }> = {};
  for (const capsule of subagents) {
    agents[capsule.name] = { description: capsule.description, prompt: capsule.role };
    if (capsule.skills.length > 0) agents[capsule.name]!.skills = capsule.skills.map((skill) => `${capsule.name}:${skill.name}`);
  }
  return JSON.stringify(agents);
}

function planClaude({ main, subagents, sessionDir }: LaunchRequest): Omit<LaunchPlan, "command"> {
  const args: string[] = [];
  const files: PlannedFile[] = [];
  if (main) {
    const role = mainRole(main, sessionDir);
    args.push("--append-system-prompt-file", role.path);
    files.push(role);
  }
  for (const capsule of [...(main ? [main] : []), ...subagents].filter((c) => c.skills.length > 0)) {
    const plugin = claudeSkillsPlugin(capsule, sessionDir);
    args.push("--plugin-dir", plugin.dir);
    files.push(...plugin.files);
  }
  if (subagents.length > 0) args.push("--agents", claudeAgents(subagents));
  return { args, env: {}, files };
}

/**
 * A pi-subagents agent file. Its frontmatter is parsed as single-line scalars, not full YAML.
 * The Role is appended to Pi's base prompt, project instructions stay, and only bundled skills are visible.
 */
function piAgent(capsule: Capsule): string {
  const lines = [
    `name: ${capsule.name}`,
    `description: ${capsule.description.replace(/\s+/g, " ").trim()}`,
    "systemPromptMode: append",
    "inheritProjectContext: true",
    "inheritSkills: false",
  ];
  if (capsule.skills.length > 0) {
    lines.push(`skills: ${capsule.skills.map((skill) => skill.name).join(", ")}`, `skillPath: ${join(capsule.dir, "skills")}`);
  }
  return `---\n${lines.join("\n")}\n---\n${capsule.role}`;
}

function planPi({ main, subagents, sessionDir }: LaunchRequest): Omit<LaunchPlan, "command"> {
  const args: string[] = [];
  const files: PlannedFile[] = [];
  if (main) {
    const role = mainRole(main, sessionDir);
    args.push("--append-system-prompt", role.path);
    files.push(role);
    for (const skill of main.skills) args.push("--skill", skill.dir);
  }
  if (subagents.length === 0) return { args, env: {}, files };
  const agents = join(sessionDir, "pi", "agents");
  for (const capsule of subagents) files.push({ path: join(agents, `${capsule.name}.md`), content: piAgent(capsule) });
  return { args, env: { PI_SUBAGENT_EXTRA_AGENT_DIRS: agents }, files };
}

export function planLaunch(request: LaunchRequest): LaunchPlan {
  const names = [request.main, ...request.subagents].filter((capsule) => capsule !== undefined).map((c) => c.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new CapsuleError(`Capsule ${repeated} is used more than once in this launch`);
  const plan = request.runtime === "claude" ? planClaude(request) : planPi(request);
  return { command: request.runtime, ...plan, args: [...plan.args, ...request.passthrough] };
}
