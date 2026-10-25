import { spawn } from "node:child_process";
import electronPath from "electron";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  electronPath,
  process.argv.slice(2).length ? process.argv.slice(2) : ["."],
  { stdio: "inherit", env, windowsHide: true },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
