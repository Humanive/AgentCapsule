import argparse
import json
import sys
from pathlib import Path
import yaml
from .adapters import ADAPTERS
from .core import CapsuleError, install, load


def main(argv=None):
    parser = argparse.ArgumentParser(description="Portable Role + Skills packages")
    parser.add_argument("--catalog", type=Path, help="Repository containing capsules/ and profiles/")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    inspect = sub.add_parser("inspect")
    inspect.add_argument("agent")
    add = sub.add_parser("install")
    add.add_argument("agent")
    add.add_argument("--target", choices=ADAPTERS, required=True)
    add.add_argument("--dest", type=Path, help="Project directory; defaults to an isolated generated workspace")
    add.add_argument("--profile", help="Optional independent execution profile")
    add.add_argument("--skill", action="append", default=[], metavar="DIRECTORY", help="Append a skill for this installation only; repeatable")
    args = parser.parse_args(argv)
    catalog = args.catalog
    if catalog is None:
        catalog = Path.cwd() if (Path.cwd() / "capsules").is_dir() else Path(__file__).resolve().parents[2]
    try:
        if not (catalog / "capsules").is_dir():
            raise CapsuleError("Catalog not found; use --catalog /path/to/AgentCapsule")
        if args.command == "list":
            for folder in sorted((catalog / "capsules").iterdir()):
                if folder.is_dir():
                    meta, _, _ = load(catalog, folder.name)
                    print(f"{meta['name']}\t{meta['description']}")
        elif args.command == "inspect":
            meta, role, skills = load(catalog, args.agent)
            print(json.dumps({**meta, "role": role, "skills": list(skills)}, indent=2))
        else:
            dest = args.dest or Path.cwd() / ".agentcapsule" / "installed" / args.target / args.agent
            manifest = install(catalog, args.agent, args.target, dest, args.profile, args.skill)
            print(json.dumps({"destination": str(dest.absolute()), **manifest}, indent=2))
            print(f"Launch from {dest.absolute()}: {ADAPTERS[args.target].command}", file=sys.stderr)
    except (CapsuleError, OSError, yaml.YAMLError) as error:
        parser.exit(1, f"agentcapsule: {error}\n")

if __name__ == "__main__":
    main()
