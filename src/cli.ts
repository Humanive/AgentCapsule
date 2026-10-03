/** Command-line interface. Process-level effects (spawning, output, environment) are injected. */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CapsuleError, loadCapsule } from "./capsule.js";
import { planLaunch, type LaunchPlan, type Runtime } from "./launch.js";

export type SpawnRuntime = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<number>;

export interface Io {
  cwd: string;
  env: NodeJS.ProcessEnv;
  spawn: SpawnRuntime;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = `usage: agentcapsule [--catalog DIR] <command>
  list                                  list capsules
  inspect <capsule>                     show a capsule's role and skills
  launch [<main>] --runtime claude|pi [--with <capsule>]... [-- <runtime args>]
                                        start a runtime session with capsules injected for this session only
`;

const RUNTIMES: Runtime[] = ["claude", "pi"];

class UsageError extends Error {}

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    return await command(argv, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`agentcapsule: ${error.message}\n${USAGE}`);
    } else if (error instanceof CapsuleError) {
      io.stderr(`agentcapsule: ${error.message}\n`);
    } else if ((error as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(`agentcapsule: ${(error as Error).message}\n${USAGE}`);
    } else {
      throw error;
    }
    return 1;
  }
}

async function command(argv: string[], io: Io): Promise<number> {
  const separator = argv.indexOf("--");
  const passthrough = separator === -1 ? [] : argv.slice(separator + 1);
  const { values, positionals } = parseArgs({
    args: separator === -1 ? argv : argv.slice(0, separator),
    allowPositionals: true,
    options: {
      catalog: { type: "string" },
      runtime: { type: "string" },
      with: { type: "string", multiple: true, default: [] },
    },
  });
  const catalog = resolveCatalog(values.catalog, io.cwd);
  const [name, ...rest] = positionals;
  if (name === "list") {
    for (const entry of readdirSync(join(catalog, "capsules")).sort()) {
      const capsule = loadCapsule(catalog, entry);
      io.stdout(`${capsule.name}\t${capsule.description}\n`);
    }
  } else if (name === "inspect") {
    const { dir, skills, ...capsule } = loadCapsule(catalog, rest[0] ?? "");
    io.stdout(JSON.stringify({ ...capsule, skills: skills.map((skill) => skill.name) }, null, 2) + "\n");
  } else if (name === "launch") {
    const runtime = values.runtime as Runtime;
    if (!RUNTIMES.includes(runtime)) throw new UsageError(`--runtime must be one of ${RUNTIMES.join(", ")}`);
    if (rest[0] === undefined && values.with.length === 0) {
      throw new UsageError("name a main capsule or at least one --with capsule");
    }
    const main = rest[0] === undefined ? undefined : loadCapsule(catalog, rest[0]);
    const subagents = values.with.map((subagent) => loadCapsule(catalog, subagent));
    const sessionDir = mkdtempSync(join(tmpdir(), "agentcapsule-"));
    try {
      const plan = planLaunch({ runtime, main, subagents, passthrough, sessionDir });
      materialize(plan);
      return await io.spawn(plan.command, plan.args, { cwd: io.cwd, env: withSessionEnv(io.env, plan.env) }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        throw new CapsuleError(`${runtime} is not installed or not on PATH`);
      });
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
  } else {
    throw new UsageError(name === undefined ? "missing command" : `unknown command ${name}`);
  }
  return 0;
}

/** An explicit --catalog, else the current directory if it holds capsules, else the bundled capsules. */
function resolveCatalog(explicit: string | undefined, cwd: string): string {
  if (explicit !== undefined) {
    if (!existsSync(join(explicit, "capsules"))) throw new CapsuleError(`${explicit} has no capsules/ folder`);
    return explicit;
  }
  return existsSync(join(cwd, "capsules")) ? cwd : fileURLToPath(new URL("..", import.meta.url));
}

/** Session variables are path lists; the session's entries go first and the user's are kept. */
function withSessionEnv(base: NodeJS.ProcessEnv, session: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const [key, value] of Object.entries(session)) env[key] = base[key] ? `${value}${delimiter}${base[key]}` : value;
  return env;
}

function materialize(plan: LaunchPlan): void {
  for (const file of plan.files) {
    mkdirSync(dirname(file.path), { recursive: true });
    if ("content" in file) writeFileSync(file.path, file.content, { flag: "wx" });
    else cpSync(file.copyFrom, file.path, { recursive: true, errorOnExist: true, force: false });
  }
}
