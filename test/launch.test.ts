import { describe, expect, it } from "vitest";
import { CapsuleError, type Capsule } from "../src/capsule.js";
import { planLaunch } from "../src/launch.js";

function capsule(name: string, skills: string[] = []): Capsule {
  return {
    name,
    description: `The ${name} capsule.`,
    dir: `/catalog/capsules/${name}`,
    role: `You are the ${name}.\n`,
    skills: skills.map((skill) => ({ name: skill, dir: `/catalog/capsules/${name}/skills/${skill}` })),
  };
}

describe("planLaunch for Claude Code", () => {
  it("appends the main capsule's role and loads its skills as a session-only plugin", () => {
    const plan = planLaunch({
      runtime: "claude",
      main: capsule("researcher", ["web-research"]),
      subagents: [],
      passthrough: [],
      sessionDir: "/session",
    });

    expect(plan).toEqual({
      command: "claude",
      args: [
        "--append-system-prompt-file", "/session/main-role.md",
        "--plugin-dir", "/session/claude/researcher",
      ],
      env: {},
      files: [
        { path: "/session/main-role.md", content: "You are the researcher.\n" },
        {
          path: "/session/claude/researcher/.claude-plugin/plugin.json",
          content: '{\n  "name": "researcher",\n  "description": "The researcher capsule."\n}\n',
        },
        {
          path: "/session/claude/researcher/skills/web-research",
          copyFrom: "/catalog/capsules/researcher/skills/web-research",
        },
      ],
    });
  });

  it("needs no plugin for a role-only main capsule", () => {
    const plan = planLaunch({ runtime: "claude", main: capsule("reviewer"), subagents: [], passthrough: [], sessionDir: "/session" });

    expect(plan.args).toEqual(["--append-system-prompt-file", "/session/main-role.md"]);
    expect(plan.files).toEqual([{ path: "/session/main-role.md", content: "You are the reviewer.\n" }]);
  });

  it("defines subagent capsules under their own names, preloading their namespaced plugin skills", () => {
    const plan = planLaunch({
      runtime: "claude",
      subagents: [capsule("researcher", ["web-research"]), capsule("reviewer")],
      passthrough: [],
      sessionDir: "/session",
    });

    expect(plan.args).toEqual([
      "--plugin-dir", "/session/claude/researcher",
      "--agents",
      '{"researcher":{"description":"The researcher capsule.","prompt":"You are the researcher.\\n","skills":["researcher:web-research"]},'
        + '"reviewer":{"description":"The reviewer capsule.","prompt":"You are the reviewer.\\n"}}',
    ]);
    expect(plan.files).toEqual([
      {
        path: "/session/claude/researcher/.claude-plugin/plugin.json",
        content: '{\n  "name": "researcher",\n  "description": "The researcher capsule."\n}\n',
      },
      {
        path: "/session/claude/researcher/skills/web-research",
        copyFrom: "/catalog/capsules/researcher/skills/web-research",
      },
    ]);
  });

  it("passes runtime arguments through after its own, unchanged", () => {
    const plan = planLaunch({
      runtime: "claude",
      main: capsule("reviewer"),
      subagents: [capsule("researcher")],
      passthrough: ["--model", "opus", "fix the build"],
      sessionDir: "/session",
    });

    expect(plan.args).toEqual([
      "--append-system-prompt-file", "/session/main-role.md",
      "--agents", '{"researcher":{"description":"The researcher capsule.","prompt":"You are the researcher.\\n"}}',
      "--model", "opus", "fix the build",
    ]);
  });
});

describe("planLaunch rejects", () => {
  it.each(["claude", "pi"] as const)("a capsule used twice in one %s session", (runtime) => {
    expect(() =>
      planLaunch({ runtime, main: capsule("researcher"), subagents: [capsule("researcher")], passthrough: [], sessionDir: "/s" }),
    ).toThrow(CapsuleError);
    expect(() =>
      planLaunch({ runtime, subagents: [capsule("researcher"), capsule("researcher")], passthrough: [], sessionDir: "/s" }),
    ).toThrow(CapsuleError);
  });
});

describe("planLaunch for Pi", () => {
  it("appends the main capsule's role and loads its skills straight from the catalog", () => {
    const plan = planLaunch({
      runtime: "pi",
      main: capsule("researcher", ["source-verification", "web-research"]),
      subagents: [],
      passthrough: ["--model", "sonnet"],
      sessionDir: "/session",
    });

    expect(plan).toEqual({
      command: "pi",
      args: [
        "--append-system-prompt", "/session/main-role.md",
        "--skill", "/catalog/capsules/researcher/skills/source-verification",
        "--skill", "/catalog/capsules/researcher/skills/web-research",
        "--model", "sonnet",
      ],
      env: {},
      files: [{ path: "/session/main-role.md", content: "You are the researcher.\n" }],
    });
  });

  it("defines subagent capsules as private pi-subagents agents that see only their own skills", () => {
    const plan = planLaunch({
      runtime: "pi",
      subagents: [capsule("researcher", ["source-verification", "web-research"]), capsule("reviewer")],
      passthrough: [],
      sessionDir: "/session",
    });

    expect(plan).toEqual({
      command: "pi",
      args: [],
      env: { PI_SUBAGENT_EXTRA_AGENT_DIRS: "/session/pi/agents" },
      files: [
        {
          path: "/session/pi/agents/researcher.md",
          content: [
            "---",
            "name: researcher",
            "description: The researcher capsule.",
            "systemPromptMode: append",
            "inheritProjectContext: true",
            "inheritSkills: false",
            "skills: source-verification, web-research",
            "skillPath: /catalog/capsules/researcher/skills",
            "---",
            "You are the researcher.",
            "",
          ].join("\n"),
        },
        {
          path: "/session/pi/agents/reviewer.md",
          content: [
            "---",
            "name: reviewer",
            "description: The reviewer capsule.",
            "systemPromptMode: append",
            "inheritProjectContext: true",
            "inheritSkills: false",
            "---",
            "You are the reviewer.",
            "",
          ].join("\n"),
        },
      ],
    });
  });
});
