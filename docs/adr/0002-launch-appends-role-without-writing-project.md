# Launch appends the Role; nothing is written into the project

A Capsule reaches a Runtime only through session-scoped injection: the Role is appended to the Runtime's default system prompt (Claude `--append-system-prompt-file`, Pi `--append-system-prompt`), and Skills and subagent definitions are passed as temporary, session-only inputs (Claude `--plugin-dir` for Skills and `--agents` for subagents, Pi `--skill` and `PI_SUBAGENT_EXTRA_AGENT_DIRS`). We rejected writing `CLAUDE.md`/`AGENTS.md` (it clobbers or merges into Project Instructions and makes the whole project session become the Role) and rejected Claude `--agent` for the main Capsule (it replaces Claude Code's default prompt and did not preload skill bodies).

## Consequences

- Skills are visible to every agent in the session on Claude; only Pi scopes them per subagent. Claude plugin namespacing (`capsule:skill`) prevents skill name collisions.
- Subagents keep their bare Capsule name on every Runtime (Claude `--agents`, not a plugin agent, which would be forced to `capsule:capsule`), so skills that delegate by name stay portable. For that session they shadow a user or project agent with the same name.
- Codex is out of V0: it can take the Role via `-c developer_instructions`, but has no session-only way to load Skills from an arbitrary directory short of a temporary `CODEX_HOME`.
