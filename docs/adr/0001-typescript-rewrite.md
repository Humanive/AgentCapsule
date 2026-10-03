# Rewrite in TypeScript, test-first

The Python V0 is replaced by a TypeScript implementation (Node, pnpm, vitest, published to npm as `npx agentcapsule`), built test-first. Claude Code, Codex, and Pi all live in the Node ecosystem, so their users already have npm/npx; a Python CLI would add a second toolchain for no gain. The Python V0 never shipped, so its validation rules carry over as the first test cases rather than as code.
