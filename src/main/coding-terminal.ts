// This utility process is created only after an explicit terminal-start approval.
import * as pty from "@lydell/node-pty";
let terminal: pty.IPty | undefined;
process.parentPort?.on("message", ({ data }: any) => {
  try {
    if (data.type === "start") {
      terminal = pty.spawn(
        process.platform === "win32" ? "powershell.exe" : "/bin/sh",
        process.platform === "win32" ? ["-NoLogo", "-NoProfile"] : [],
        {
          name: "xterm-256color",
          cols: 100,
          rows: 20,
          cwd: data.cwd,
          env: data.env,
        },
      );
      process.parentPort?.postMessage({ type: "started", pid: terminal.pid });
      terminal.onData((text) =>
        process.parentPort?.postMessage({ type: "data", text }),
      );
      terminal.onExit((exit) => {
        process.parentPort?.postMessage({ type: "exit", ...exit });
        setTimeout(() => process.exit(), 20);
      });
    } else if (data.type === "input") terminal?.write(data.text);
    else if (data.type === "resize") terminal?.resize(data.cols, data.rows);
    else if (data.type === "stop") {
      terminal?.kill();
      setTimeout(() => process.exit(), 100);
    }
  } catch {
    process.parentPort?.postMessage({
      type: "error",
      message:
        "The terminal could not start. Check the installed shell and terminal runtime.",
    });
    setTimeout(() => process.exit(1), 20);
  }
});
