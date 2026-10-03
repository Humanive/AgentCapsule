import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Writes a tree of files under a fresh temporary directory and returns its path. */
export function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "agentcapsule-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

export function skillMd(name: string, description = `Use ${name}.`, body = `Do ${name}.`): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;
}

export function capsuleMd(name: string, frontmatter = `name: ${name}\ndescription: The ${name} capsule.`, role = `# ${name}\nYou are the ${name}.\n`): string {
  return `---\n${frontmatter}\n---\n${role}`;
}

/** A catalog containing one valid capsule with the given skills. */
export function capsuleFiles(name: string, skills: string[] = ["web-research"]): Record<string, string> {
  const files: Record<string, string> = {
    [`capsules/${name}/CAPSULE.md`]: capsuleMd(name),
  };
  for (const skill of skills) files[`capsules/${name}/skills/${skill}/SKILL.md`] = skillMd(skill);
  return files;
}
