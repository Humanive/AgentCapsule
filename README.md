# AgentCapsule

**Define an agent once. Run it anywhere.**

A Capsule is a portable agent package: a **Role** (who the agent is and what it is responsible for) plus the **Skills** it carries with it. AgentCapsule launches a Capsule on Claude Code or Pi, either as the session's main agent or as a subagent, without writing anything into your project.

```text
capsules/researcher/
├── CAPSULE.md          # frontmatter: name + description; body: the Role
└── skills/<name>/SKILL.md   # optional
```

## Usage

```bash
npx github:Humanive/AgentCapsule list
npx github:Humanive/AgentCapsule inspect researcher

# researcher is the main agent; your project's CLAUDE.md still applies
npx github:Humanive/AgentCapsule launch researcher --runtime claude

# your normal agent stays main and can delegate to researcher and reviewer
npx github:Humanive/AgentCapsule launch --runtime claude --with researcher --with reviewer

# everything after -- goes to the runtime unchanged
npx github:Humanive/AgentCapsule launch researcher --runtime pi -- --model sonnet
```

Capsules are found in `--catalog DIR`, else `./capsules` in the current directory, else the examples bundled with this package.

## How a Capsule is injected

Nothing is written into your project or global configuration. Session files live in a temporary directory that is removed when the runtime exits.

| Runtime | Main capsule | Subagent capsule | Skill visibility |
|---|---|---|---|
| Claude Code | Role via `--append-system-prompt-file`; skills via a session plugin (`--plugin-dir`) | `--agents` under its bare name, preloading its plugin skills | Whole session; namespaced `<capsule>:<skill>` |
| Pi | Role via `--append-system-prompt`; skills via `--skill` | pi-subagents agent via `PI_SUBAGENT_EXTRA_AGENT_DIRS` (requires the `pi-subagents` package) | Main: whole session. Subagent: only its own skills |

A subagent keeps its bare Capsule name on every runtime, so for that session it shadows any user or project agent with the same name.

Codex is not supported yet: it has no session-only way to load skills from a directory. See `docs/adr/0002`.

## For agents

[`skills/agentcapsule/SKILL.md`](skills/agentcapsule/SKILL.md) teaches an agent to build capsules, convert existing agent definitions, and launch them. Install it like any Agent Skill.

## Validation

Loading fails fast on: `CAPSULE.md` frontmatter with fields other than `name` and `description`, duplicate YAML keys, non-portable names, a skill whose `name` differs from its folder, an empty Role (the `CAPSULE.md` body) or skill body, a skill description over 1024 characters, and symlinks or special files. A Capsule may appear only once per launch.

## Development

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck
pnpm build       # dist/main.js is the agentcapsule binary
```
