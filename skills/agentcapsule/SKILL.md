---
name: agentcapsule
description: Build portable agents as AgentCapsule packages (a Role plus bundled Skills) and run them on Claude Code or Pi. Use when creating an agent or subagent, converting an existing agent definition (Claude, Cursor, Pi, or Codex) into a capsule, or moving an agent to another runtime.
---

# AgentCapsule

A capsule is one agent's identity: its **Role** (who it is, what it is responsible for, where its job ends) and the **Skills** it carries. It is runtime-neutral. Launching injects it into a session for that session only, so the project's own `CLAUDE.md` / `AGENTS.md` keep applying alongside it.

## Format

```text
capsules/<name>/
├── CAPSULE.md
└── skills/<skill>/SKILL.md      # optional, any number
```

```md
---
name: researcher
description: Research unfamiliar topics using traceable evidence and explicit uncertainty.
---
# Researcher

You investigate questions using evidence rather than plausible guesses. ...
```

- `name` is lowercase-hyphenated and matches the folder.
- `description` is one line; runtimes read it to decide when to delegate to this agent.
- The body is the Role. Frontmatter holds just `name` and `description`; model, tools, and permissions are chosen at launch.
- Each skill is a standard Agent Skills folder: `SKILL.md` with `name` (matching its folder) and `description`, plus any scripts or references it uses.

## Build a capsule

1. Write `CAPSULE.md`. Keep the Role about who and why; put reusable procedures in skills.
2. Add each procedure as `skills/<skill>/SKILL.md`. Copy existing skill folders whole, scripts and executable bits included.
3. Run `agentcapsule inspect <name>`. It prints the Role and skill list, or names the file and field to fix.

The capsule is done when `inspect` succeeds and lists every skill you intended.

## Convert an existing agent

| Source | Role comes from | Skills come from |
|---|---|---|
| Claude / Cursor / Pi agent `.md` | the Markdown body | the folders named in its `skills:` |
| Codex `.toml` | `developer_instructions` | the folders its `skills.config` points at |

`name` and `description` carry over as they are. Runtime fields such as `model`, `tools`, `readonly`, `sandbox_mode`, or `thinking` become launch arguments after `--`.

## Run

`agentcapsule` runs as `npx github:Humanive/AgentCapsule <command>`. It finds capsules in `--catalog <dir>`, else `./capsules`, else its bundled examples.

```bash
agentcapsule list
agentcapsule launch researcher --runtime claude                          # researcher is the main agent
agentcapsule launch --runtime claude --with researcher --with reviewer   # the default agent delegates to them
agentcapsule launch researcher --runtime pi -- --model sonnet            # arguments after -- go to the runtime
```

Subagents keep their capsule name (`researcher`) on both runtimes. Pi subagents need the `pi-subagents` package.

## Other runtimes

`launch` covers Claude Code and Pi. For Cursor or Codex, write the runtime's own files from the capsule. These live in the project, so check with the user before adding them.

- **Cursor or Claude Code**: `.claude/agents/<name>.md` with the `CAPSULE.md` content plus a `skills:` list; skills in `.claude/skills/`. Cursor reads `.claude/agents/` too.
- **Codex**: `.codex/agents/<name>.toml` with `name`, `description`, and `developer_instructions` set to the Role; skills in `.agents/skills/`.
