# AgentCapsule

Portable agent packages for Claude Code, Codex, and Pi.

**V0 contract:** `Agent = Role + bundled Skills`. Profiles are optional execution preferences; runtime, model, authentication, permissions, MCP, memory, workflows, and evaluations remain owned by the host.

## Package format

```text
capsules/researcher/
├── agent.yaml
├── ROLE.md
└── skills/<name>/SKILL.md
```

Skills use portable `SKILL.md` frontmatter with `name` and `description`. Validation fails fast on malformed metadata, duplicate names, symlinks, and destination collisions.

## Quick start

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e .
agentcapsule list
agentcapsule inspect researcher
agentcapsule install researcher --target claude --dest /tmp/researcher-claude --profile deep
agentcapsule install researcher --target codex --dest /tmp/researcher-codex
agentcapsule install researcher --target pi --dest /tmp/researcher-pi --skill /path/to/another-skill
```

`--skill` appends a validated skill for that installation. Each installation writes `agentcapsule-install.json` with SHA-256 hashes and never overwrites existing files.

## Adapter output

- Claude Code: `CLAUDE.md` and `.claude/skills/*`
- Codex: `AGENTS.md` and `.agents/skills/*`
- Pi: `.pi/APPEND_SYSTEM.md` and `.pi/skills/*`

Outputs are project-local. Start the host manually from the destination (`claude`, `codex`, or `pi`). V0 does not change global configuration or credentials.

## Development

```bash
python3 -m unittest discover -s tests -v
```

The repository is on feature branch `feat/v0` pending review.
