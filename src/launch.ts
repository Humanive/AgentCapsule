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

/** A session-only Claude Code plugin named after the capsule, so its skills are namespaced `capsule:skill`. */
function claudePlugin(capsule: Capsule, sessionDir: string, asSubagent: boolean): { dir: string; files: PlannedFile[] } {
  const dir = join(sessionDir, "claude", capsule.name);
  const files: PlannedFile[] = [
    {
      path: join(dir, ".claude-plugin", "plugin.json"),
      content: JSON.stringify({ name: capsule.name, description: capsule.description }, null, 2) + "\n",
    },
  ];
  for (const skill of capsule.skills) files.push({ path: join(dir, "skills", skill.name), copyFrom: skill.dir });
  if (asSubagent) {
    const meta: Record<string, unknown> = { name: capsule.name, description: capsule.description };
    if (capsule.skills.length > 0) meta.skills = capsule.skills.map((skill) => `${capsule.name}:${skill.name}`);
    files.push({ path: join(dir, "agents", `${capsule.name}.md`), content: `---\n${stringify(meta)}---\n${capsule.role}` });
  }
  return { dir, files };
}

function planClaude({ main, subagents, sessionDir }: LaunchRequest): Omit<LaunchPlan, "command"> {
  const args: string[] = [];
  const files: PlannedFile[] = [];
  if (main) args.push("--append-system-prompt-file", join(main.dir, "ROLE.md"));
  const plugins = [
    ...(main && main.skills.length > 0 ? [claudePlugin(main, sessionDir, false)] : []),
    ...subagents.map((capsule) => claudePlugin(capsule, sessionDir, true)),
  ];
  for (const plugin of plugins) {
    args.push("--plugin-dir", plugin.dir);
    files.push(...plugin.files);
  }
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
  if (main) {
    args.push("--append-system-prompt", join(main.dir, "ROLE.md"));
    for (const skill of main.skills) args.push("--skill", skill.dir);
  }
  if (subagents.length === 0) return { args, env: {}, files: [] };
  const agents = join(sessionDir, "pi", "agents");
  return {
    args,
    env: { PI_SUBAGENT_EXTRA_AGENT_DIRS: agents },
    files: subagents.map((capsule) => ({ path: join(agents, `${capsule.name}.md`), content: piAgent(capsule) })),
  };
}

export function planLaunch(request: LaunchRequest): LaunchPlan {
  const names = [request.main, ...request.subagents].filter((capsule) => capsule !== undefined).map((c) => c.name);
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new CapsuleError(`Capsule ${repeated} is used more than once in this launch`);
  const plan = request.runtime === "claude" ? planClaude(request) : planPi(request);
  return { command: request.runtime, ...plan, args: [...plan.args, ...request.passthrough] };
}
