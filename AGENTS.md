# AgentCapsule development

Canonical package = capsules/<name>/CAPSULE.md (name + description, body = Role) + optional skills/*/SKILL.md.
Vocabulary lives in CONTEXT.md; decisions in docs/adr/. Read both before changing behavior.
A Capsule reaches a Runtime only by session-scoped injection (`launch`): the Role is appended
to the Runtime's default prompt, Skills and subagent definitions are temporary session inputs.
Never write into the user's project (no CLAUDE.md/AGENTS.md edits) or global runtime config,
and never touch credentials. Runtime settings (model, permissions) pass through after `--`.
TypeScript on Node 22+, pnpm, vitest. Domain logic: src/capsule.ts (load + validate) and
src/launch.ts (pure planning per Runtime); src/cli.ts injects process effects; src/main.ts wires them.
Fail fast on malformed packages, duplicate YAML keys, symlinks, and a Capsule used twice.
Never silently skip invalid inputs. Keep original skill assets and executable modes.
Work test-first at the three seams: loadCapsule, planLaunch, and the CLI `run` with a fake spawn.
Update this file, CONTEXT.md, README, and skills/agentcapsule/SKILL.md when the format or commands change. Branch before large changes.
Run `pnpm test`, `pnpm typecheck`, `pnpm build` and a CLI smoke check before committing.
