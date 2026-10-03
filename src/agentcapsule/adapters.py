"""Native project layouts. Runtime authentication and settings stay external."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Adapter:
    role_file: str
    skills_dir: str
    command: str

ADAPTERS = {
    "claude": Adapter("CLAUDE.md", ".claude/skills", "claude"),
    "codex": Adapter("AGENTS.md", ".agents/skills", "codex"),
    "pi": Adapter(".pi/APPEND_SYSTEM.md", ".pi/skills", "pi"),
}
