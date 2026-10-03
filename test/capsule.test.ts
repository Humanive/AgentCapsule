import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CapsuleError, loadCapsule } from "../src/capsule.js";
import { capsuleFiles, skillMd, tree } from "./fixtures.js";

describe("loadCapsule", () => {
  it("loads the role, description and bundled skills of a capsule", () => {
    const catalog = tree(capsuleFiles("researcher", ["web-research", "source-verification"]));

    const capsule = loadCapsule(catalog, "researcher");

    expect(capsule).toEqual({
      name: "researcher",
      description: "The researcher capsule.",
      dir: join(catalog, "capsules/researcher"),
      role: "# researcher\nYou are the researcher.\n",
      skills: [
        { name: "source-verification", dir: join(catalog, "capsules/researcher/skills/source-verification") },
        { name: "web-research", dir: join(catalog, "capsules/researcher/skills/web-research") },
      ],
    });
  });
});

it("loads a role-only capsule that has no skills folder", () => {
  const catalog = tree(capsuleFiles("reviewer", []));

  expect(loadCapsule(catalog, "reviewer").skills).toEqual([]);
});

describe("loadCapsule rejects malformed agent.yaml", () => {
  it.each([
    ["a missing description", "name: researcher\n"],
    ["an unknown field", "name: researcher\ndescription: Researches.\nmodel: opus\n"],
    ["a duplicate key", "name: researcher\nname: researcher\ndescription: Researches.\n"],
    ["a non-text description", "name: researcher\ndescription: [a, b]\n"],
    ["a blank description", "name: researcher\ndescription: '  '\n"],
    ["a name that differs from its folder", "name: other\ndescription: Researches.\n"],
    ["a non-mapping document", "- name\n- description\n"],
  ])("with %s", (_, yaml) => {
    const catalog = tree({ ...capsuleFiles("researcher"), "capsules/researcher/agent.yaml": yaml });

    expect(() => loadCapsule(catalog, "researcher")).toThrow(CapsuleError);
  });
});

describe("loadCapsule rejects a malformed capsule layout", () => {
  it.each([
    ["an unknown capsule", "planner", {}],
    ["a name that is not portable", "Research_Bot", {}],
    ["a path-like name", "../researcher", {}],
  ])("for %s", (_, name, files) => {
    const catalog = tree({ ...capsuleFiles("researcher"), ...files });

    expect(() => loadCapsule(catalog, name)).toThrow(CapsuleError);
  });

  it("when ROLE.md is missing", () => {
    const files = capsuleFiles("researcher");
    delete files["capsules/researcher/ROLE.md"];

    expect(() => loadCapsule(tree(files), "researcher")).toThrow(CapsuleError);
  });

  it("when ROLE.md is blank", () => {
    const catalog = tree({ ...capsuleFiles("researcher"), "capsules/researcher/ROLE.md": " \n" });

    expect(() => loadCapsule(catalog, "researcher")).toThrow(CapsuleError);
  });

});

describe("loadCapsule rejects an invalid bundled skill", () => {
  const skill = "capsules/researcher/skills/web-research";

  it.each([
    ["a missing SKILL.md", { [`${skill}/notes.md`]: "notes" }],
    ["no frontmatter", { [`${skill}/SKILL.md`]: "# Web research\n" }],
    ["unterminated frontmatter", { [`${skill}/SKILL.md`]: "---\nname: web-research\n" }],
    ["a name that differs from its folder", { [`${skill}/SKILL.md`]: skillMd("browse") }],
    ["a blank description", { [`${skill}/SKILL.md`]: skillMd("web-research", "''") }],
    ["a description over 1024 characters", { [`${skill}/SKILL.md`]: skillMd("web-research", "x".repeat(1025)) }],
    ["an empty body", { [`${skill}/SKILL.md`]: skillMd("web-research", "Use it.", "") }],
    ["a duplicate frontmatter key", { [`${skill}/SKILL.md`]: "---\nname: web-research\nname: web-research\ndescription: d\n---\nbody\n" }],
  ])("with %s", (_, files) => {
    const base = capsuleFiles("researcher", []);
    const catalog = tree({ ...base, ...files });

    expect(() => loadCapsule(catalog, "researcher")).toThrow(CapsuleError);
  });

  it("accepts extra Agent Skills frontmatter fields", () => {
    const catalog = tree({
      ...capsuleFiles("researcher", []),
      [`${skill}/SKILL.md`]: "---\nname: web-research\ndescription: Search.\nlicense: MIT\nallowed-tools: Bash\n---\nSearch.\n",
    });

    expect(loadCapsule(catalog, "researcher").skills.map((s) => s.name)).toEqual(["web-research"]);
  });

  it("with a symlink inside the skill", () => {
    const catalog = tree(capsuleFiles("researcher"));
    symlinkSync("/etc/hosts", join(catalog, skill, "hosts"));

    expect(() => loadCapsule(catalog, "researcher")).toThrow(CapsuleError);
  });
});
