#!/usr/bin/env node
/** Process entry point: wires the CLI to the real terminal, environment and child processes. */
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { run, type SpawnRuntime } from "./cli.js";

/** Runs the Runtime attached to this terminal. Interrupts belong to it, so cleanup waits until it exits. */
const spawnRuntime: SpawnRuntime = (command, args, options) =>
  new Promise((resolve, reject) => {
    const ignore = () => {};
    process.on("SIGINT", ignore);
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", (error) => {
      process.off("SIGINT", ignore);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", ignore);
      resolve(code ?? 128 + (signal ? constants.signals[signal] : 0));
    });
  });

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  spawn: spawnRuntime,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
