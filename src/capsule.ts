/** Strict loading of Capsules: a Role plus bundled Skills. Invalid input fails fast. */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";

export interface Skill {
  name: string;
  dir: string;
}

export interface Capsule {
  name: string;
  description: string;
  dir: string;
  role: string;
  skills: Skill[];
}

export class CapsuleError extends Error {
  override name = "CapsuleError";
}

function parseMapping(source: string, label: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = parse(source, { uniqueKeys: true });
  } catch (error) {
    throw new CapsuleError(`${label}: ${(error as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new CapsuleError(`${label}: expected a mapping`);
  }
  return data as Record<string, unknown>;
}

/** Parses YAML that must be a mapping with exactly the given keys; duplicate keys are rejected. */
function strictMapping(source: string, label: string, keys: string[]): Record<string, unknown> {
  const data = parseMapping(source, label);
  const actual = Object.keys(data).sort();
  if (actual.join() !== [...keys].sort().join()) {
    throw new CapsuleError(`${label}: expected exactly the fields ${keys.join(", ")}, got ${actual.join(", ")}`);
  }
  return data;
}

const PORTABLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function portableName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 64 || !PORTABLE_NAME.test(value)) {
    throw new CapsuleError(`${label}: invalid portable name ${JSON.stringify(value)}`);
  }
  return value;
}

function readText(path: string): string {
  if (!existsSync(path)) throw new CapsuleError(`Missing required file: ${path}`);
  return readFileSync(path, "utf8");
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new CapsuleError(`${label}: expected nonempty text`);
  return value;
}

/** Rejects symlinks and special files anywhere under a directory, so copies are faithful. */
function assertPlainTree(dir: string): void {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: false }) as string[]) {
    const path = join(dir, entry);
    const stat = lstatSync(path);
    if (!stat.isFile() && !stat.isDirectory()) throw new CapsuleError(`Unsupported symlink or special file: ${path}`);
  }
}

function loadSkill(dir: string): Skill {
  const path = join(dir, "SKILL.md");
  const lines = readText(path).split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end === -1) throw new CapsuleError(`${path}: missing frontmatter`);
  const meta = parseMapping(lines.slice(1, end).join("\n"), path);
  const name = portableName(meta.name, `${path} name`);
  if (name !== basename(dir)) throw new CapsuleError(`${path}: name ${name} must match its folder`);
  if (text(meta.description, `${path} description`).length > 1024) {
    throw new CapsuleError(`${path}: description exceeds 1024 characters`);
  }
  text(lines.slice(end + 1).join("\n"), `${path} body`);
  return { name, dir };
}

export function loadCapsule(catalog: string, name: string): Capsule {
  const dir = join(catalog, "capsules", portableName(name, "capsule"));
  if (!existsSync(dir)) throw new CapsuleError(`Unknown capsule ${name} in ${catalog}`);
  const label = join(dir, "agent.yaml");
  assertPlainTree(dir);
  const meta = strictMapping(readText(label), label, ["name", "description"]);
  if (meta.name !== name) throw new CapsuleError(`${label}: name ${String(meta.name)} must match its folder ${name}`);
  const skillsDir = join(dir, "skills");
  const skills = (existsSync(skillsDir) ? readdirSync(skillsDir) : [])
    .sort()
    .map((entry) => loadSkill(join(skillsDir, entry)));
  return {
    name,
    description: text(meta.description, `${label} description`),
    dir,
    role: text(readText(join(dir, "ROLE.md")), join(dir, "ROLE.md")),
    skills,
  };
}
