import { chmodSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type SpawnRuntime } from "../src/cli.js";
import { capsuleFiles, capsuleMd, tree } from "./fixtures.js";

interface Spawned {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/** Runs the CLI with captured output and a fake Runtime that records how it was started. */
async function cli(
  argv: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; exitCode?: number; onSpawn?: (s: Spawned) => void } = {},
) {
  let stdout = "";
  let stderr = "";
  const spawned: Spawned[] = [];
  const spawn: SpawnRuntime = async (command, args, spawnOptions) => {
    const call = { command, args, ...spawnOptions };
    spawned.push(call);
    options.onSpawn?.(call);
    return options.exitCode ?? 0;
  };
  const code = await run(argv, {
    cwd: options.cwd ?? tree({}),
    env: options.env ?? {},
    spawn,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr, spawned };
}

describe("agentcapsule list", () => {
  it("prints each capsule with its description", async () => {
    const catalog = tree({ ...capsuleFiles("researcher"), ...capsuleFiles("reviewer", []) });

    const result = await cli(["list", "--catalog", catalog]);

    expect(result).toMatchObject({
      code: 0,
      stdout: "researcher\tThe researcher capsule.\nreviewer\tThe reviewer capsule.\n",
    });
  });
});

describe("catalog resolution", () => {
  it("uses the current directory when it holds capsules", async () => {
    const result = await cli(["list"], { cwd: tree(capsuleFiles("planner", [])) });

    expect(result.stdout).toBe("planner\tThe planner capsule.\n");
  });

  it("falls back to the capsules bundled with agentcapsule, which are valid", async () => {
    const result = await cli(["inspect", "researcher"], { cwd: tree({}) });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).skills).toEqual(["source-verification", "web-research"]);
  });

  it("rejects a --catalog without capsules", async () => {
    const result = await cli(["list", "--catalog", tree({})]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/no capsules\/ folder/);
  });
});

describe("agentcapsule inspect", () => {
  it("prints the capsule's role and skills as JSON", async () => {
    const catalog = tree(capsuleFiles("researcher", ["source-verification", "web-research"]));

    const result = await cli(["inspect", "researcher", "--catalog", catalog]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      name: "researcher",
      description: "The researcher capsule.",
      role: "# researcher\nYou are the researcher.\n",
      skills: ["source-verification", "web-research"],
    });
  });

  it("reports an invalid capsule on stderr and exits 1", async () => {
    const catalog = tree({ ...capsuleFiles("researcher"), "capsules/researcher/CAPSULE.md": capsuleMd("researcher", "name: researcher") });

    const result = await cli(["inspect", "researcher", "--catalog", catalog]);

    expect(result).toMatchObject({ code: 1, stdout: "" });
    expect(result.stderr).toMatch(/^agentcapsule: .*CAPSULE\.md: expected exactly the fields name, description/);
  });
});

/** Every file path and content under a directory, to prove a launch leaves it untouched. */
function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true }) as string[]) {
    const path = join(dir, entry);
    files[entry] = statSync(path).isFile() ? readFileSync(path, "utf8") : "<dir>";
  }
  return files;
}

describe("agentcapsule launch", () => {
  it("starts Claude Code in the project with session-only capsule files, then removes them", async () => {
    const catalog = tree({ ...capsuleFiles("coder", []), ...capsuleFiles("researcher", ["web-research"]) });
    const project = tree({ "CLAUDE.md": "Project rules.\n", "src/index.ts": "export {};\n" });
    const before = snapshot(project);
    let roleFile = "";
    let pluginDir = "";

    const result = await cli(
      ["launch", "coder", "--runtime", "claude", "--with", "researcher", "--catalog", catalog, "--", "--model", "opus"],
      {
        cwd: project,
        exitCode: 3,
        onSpawn: ({ args }) => {
          roleFile = args[1] ?? "";
          pluginDir = args[3] ?? "";
          expect(readFileSync(roleFile, "utf8")).toBe("# coder\nYou are the coder.\n");
          expect(existsSync(join(pluginDir, "skills/web-research/SKILL.md"))).toBe(true);
        },
      },
    );

    expect(result.code).toBe(3);
    expect(result.spawned).toHaveLength(1);
    expect(result.spawned[0]).toMatchObject({
      command: "claude",
      cwd: project,
      args: [
        "--append-system-prompt-file", roleFile,
        "--plugin-dir", pluginDir,
        "--agents",
        '{"researcher":{"description":"The researcher capsule.","prompt":"# researcher\\nYou are the researcher.\\n","skills":["researcher:web-research"]}}',
        "--model", "opus",
      ],
    });
    expect(existsSync(roleFile)).toBe(false);
    expect(existsSync(pluginDir)).toBe(false);
    expect(snapshot(project)).toEqual(before);
  });

  it("adds Pi subagent definitions without discarding the user's own extra agent dirs", async () => {
    const catalog = tree(capsuleFiles("researcher", ["web-research"]));
    let agentsDir = "";

    const result = await cli(["launch", "--runtime", "pi", "--with", "researcher", "--catalog", catalog], {
      env: { PATH: "/usr/bin", PI_SUBAGENT_EXTRA_AGENT_DIRS: "/home/me/agents" },
      onSpawn: ({ env }) => {
        agentsDir = String(env.PI_SUBAGENT_EXTRA_AGENT_DIRS).split(delimiter)[0] ?? "";
        expect(readFileSync(join(agentsDir, "researcher.md"), "utf8")).toContain("skills: web-research");
      },
    });

    expect(result.code).toBe(0);
    expect(result.spawned[0]).toMatchObject({
      command: "pi",
      args: [],
      env: { PATH: "/usr/bin", PI_SUBAGENT_EXTRA_AGENT_DIRS: `${agentsDir}${delimiter}/home/me/agents` },
    });
    expect(existsSync(agentsDir)).toBe(false);
  });

  it.each([
    ["no runtime", ["launch", "researcher"], /--runtime must be one of claude, pi/],
    ["an unsupported runtime", ["launch", "researcher", "--runtime", "codex"], /--runtime must be one of claude, pi/],
    ["nothing to launch", ["launch", "--runtime", "claude"], /name a main capsule or at least one --with/],
  ])("refuses %s without starting anything", async (_, argv, message) => {
    const catalog = tree(capsuleFiles("researcher"));

    const result = await cli([...argv, "--catalog", catalog]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(message);
    expect(result.spawned).toEqual([]);
  });

  it("explains a runtime that is not installed and still cleans up", async () => {
    const catalog = tree(capsuleFiles("researcher", ["web-research"]));
    let pluginDir = "";
    const missing = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });

    const result = await cli(["launch", "--runtime", "claude", "--with", "researcher", "--catalog", catalog], {
      onSpawn: ({ args }) => {
        pluginDir = args[1] ?? "";
        throw missing;
      },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/claude is not installed or not on PATH/);
    expect(existsSync(pluginDir)).toBe(false);
  });

  it("keeps executable modes of bundled skill files", async () => {
    const catalog = tree({ ...capsuleFiles("researcher", ["web-research"]), "capsules/researcher/skills/web-research/run.sh": "#!/bin/sh\n" });
    chmodSync(join(catalog, "capsules/researcher/skills/web-research/run.sh"), 0o755);
    let mode = 0;

    await cli(["launch", "--runtime", "claude", "--with", "researcher", "--catalog", catalog], {
      onSpawn: ({ args }) => {
        mode = statSync(join(args[1] ?? "", "skills/web-research/run.sh")).mode & 0o777;
      },
    });

    expect(mode).toBe(0o755);
  });
});

describe("unknown commands", () => {
  it("print usage and exit 1", async () => {
    const result = await cli(["deploy", "researcher"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/usage: agentcapsule/);
  });
});
