# AgentCapsule

A portable, self-contained definition of an agent's identity that can be brought into any project on any agent runtime without altering that project.

## Language

**Capsule**:
A self-contained agent package consisting of exactly one Role and its bundled Skills; the source of truth for an agent's identity.
_Avoid_: Agent template, agent spec, agent config

**Role**:
The prompt text stating who the agent is, what it is responsible for, and where its responsibilities end. Layered on top of Project Instructions, never merged into them.
_Avoid_: System prompt, persona, AGENTS.md

**Skill**:
A portable `SKILL.md` folder describing how to perform one kind of task. A Capsule carries its Skills with it rather than referring to them by name.

**Project Instructions**:
The host project's own guidance files (such as `CLAUDE.md` or `AGENTS.md`). They belong to the project; a Capsule never writes into them.
_Avoid_: Project context (ambiguous)

**Runtime**:
An agent host that executes a Capsule, such as Claude Code, Codex, or Pi.
_Avoid_: Platform, target (when meaning the host itself)

**Topology**:
The position a Capsule occupies in a session: **main** (the session's primary agent) or **subagent** (delegated to by another agent). Topology is chosen per session and is not part of a Capsule's identity.
_Avoid_: Agent type, lifecycle

**Launch**:
Starting a Runtime session with at most one main Capsule (otherwise the Runtime's own default agent is main) and any number of subagent Capsules injected for that session only, leaving no files in the project.
_Avoid_: Deploy, install (installing means writing a Capsule into a project, which is an explicit opt-in)
