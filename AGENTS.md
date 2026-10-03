# AgentCapsule development

Canonical package = capsules/<name>/agent.yaml + ROLE.md + skills/*/SKILL.md.
Role and bundled Skills define identity. Profiles are optional prompt-only execution
preferences in V0. Adapters map to project files; runtime/model/auth remain external.
Python 3.10+ with PyYAML; CLI in src/agentcapsule/cli.py; adapters in adapters.py.
Fail fast on malformed packages, duplicate skills, duplicate YAML keys, and collisions.
Never silently skip invalid inputs. Keep original skill assets and executable modes.
Install prints a file-hash manifest and launch instructions. Never edit global runtime
configuration or credentials. Update this file and README when these boundaries change.
Create a feature branch before large changes. Run unittest and CLI smoke checks.
