"""Strict catalog validation and transactional, non-overwriting installation."""
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path
import yaml
from .adapters import ADAPTERS

class CapsuleError(ValueError):
    pass

class StrictLoader(yaml.SafeLoader):
    pass

def mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str) or key in result:
            raise CapsuleError(f"Invalid or duplicate YAML key: {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result

StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)

def name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value) or len(value) > 64:
        raise CapsuleError(f"Invalid portable name: {value!r}")
    return value

def document(path, fields):
    if not path.is_file():
        raise CapsuleError(f"Missing required file: {path}")
    data = yaml.load(path.read_text(), Loader=StrictLoader)
    if not isinstance(data, dict) or set(data) != set(fields):
        raise CapsuleError(f"{path}: expected fields {fields}")
    return data

def text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise CapsuleError(f"{label}: expected nonempty text")
    return value

def skill(path):
    if not path.is_dir():
        raise CapsuleError(f"Missing skill directory: {path}")
    for item in [path, *path.rglob("*")]:
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise CapsuleError(f"Unsupported symlink or special file: {item}")
    content = (path / "SKILL.md").read_text()
    lines = content.splitlines()
    if not lines or lines[0] != "---" or "---" not in lines[1:]:
        raise CapsuleError(f"{path}: missing skill frontmatter")
    end = lines.index("---", 1)
    meta = yaml.load("\n".join(lines[1:end]), Loader=StrictLoader)
    if not isinstance(meta, dict):
        raise CapsuleError(f"{path}: frontmatter must be a mapping")
    n = name(meta.get("name"))
    if n != path.name:
        raise CapsuleError(f"{path}: name must match skill directory")
    description = text(meta.get("description"), str(path))
    if len(description) > 1024:
        raise CapsuleError(f"{path}: skill description exceeds 1024 characters")
    text("\n".join(lines[end+1:]), f"{path}: skill body")
    return n

def load(catalog, agent, extra=()):
    folder = catalog / "capsules" / name(agent)
    meta = document(folder / "agent.yaml", ("name", "description"))
    if name(meta["name"]) != agent:
        raise CapsuleError(f"{folder}: agent name mismatch")
    text(meta["description"], str(folder))
    role = text((folder / "ROLE.md").read_text(), str(folder / "ROLE.md"))
    skills = {}
    bundled = folder / "skills"
    if not bundled.is_dir():
        raise CapsuleError(f"Missing bundled skills directory: {bundled}")
    for path in [*sorted(bundled.iterdir()), *(Path(p).resolve() for p in extra)]:
        n = skill(path)
        if n in skills:
            raise CapsuleError(f"Duplicate skill: {n}")
        skills[n] = path
    return meta, role, skills

def install(catalog, agent, target, destination, profile=None, extra=()):
    meta, role, skills = load(catalog, agent, extra)
    adapter = ADAPTERS[target]
    profile_data = None
    if profile:
        profile_data = document(catalog / "profiles" / (name(profile) + ".yaml"), ("name", "instructions"))
        if profile_data["name"] != profile:
            raise CapsuleError("Profile name mismatch")
        text(profile_data["instructions"], "profile instructions")
    destination = Path(destination).absolute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Refuse symlink ancestors, including dangling links, before writing anything.
    if destination.is_symlink():
        raise CapsuleError(f"Symlink destination is unsupported: {destination}")
    with tempfile.TemporaryDirectory(prefix=".agentcapsule-stage-", dir=destination.parent) as stage:
        root = Path(stage)
        role_path = root / adapter.role_file
        role_path.parent.mkdir(parents=True, exist_ok=True)
        generated = role
        if profile_data:
            generated += "\n\n# Execution profile: " + profile + "\n" + profile_data["instructions"] + "\n"
        role_path.write_text(generated)
        for n, path in skills.items():
            shutil.copytree(path, root / adapter.skills_dir / n)
        files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in sorted(root.rglob("*")) if p.is_file()}
        manifest = {"schema_version": 1, "agent": meta, "target": target,
                    "profile": profile_data, "skills": list(skills), "sha256": files}
        (root / "agentcapsule-install.json").write_text(json.dumps(manifest, indent=2) + "\n")
        planned = sorted(p for p in root.rglob("*") if p.is_file())
        for source in planned:
            out = destination / source.relative_to(root)
            if out.exists() or out.is_symlink():
                raise CapsuleError(f"Refusing to overwrite: {out}")
            if any(p.exists() and not p.is_dir() for p in out.parents):
                raise CapsuleError(f"Blocked destination path: {out}")
        written = []
        try:
            for source in planned:
                out = destination / source.relative_to(root)
                out.parent.mkdir(parents=True, exist_ok=True)
                # Exclusive creation also catches a collision after preflight.
                with out.open("xb") as stream:
                    written.append(out)
                    stream.write(source.read_bytes())
                shutil.copymode(source, out)
        except BaseException:
            for out in reversed(written):
                out.unlink()
            raise
    return manifest
