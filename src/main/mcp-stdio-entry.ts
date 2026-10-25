import { createConnection, type Socket } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, writeFile, link, unlink } from "node:fs/promises";
import { generateKeyPairSync, sign } from "node:crypto";
import { mcpPipeName } from "./mcp-ipc";

// A small stdio process, never an Electron browser or a debugging endpoint.
const profile = path.resolve(
  process.env.PICCOLO_PROFILE ||
    (process.platform === "win32"
      ? path.join(process.env.APPDATA || homedir(), "Piccolo")
      : process.platform === "darwin"
        ? path.join(homedir(), "Library", "Application Support", "Piccolo")
        : path.join(
            process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
            "Piccolo",
          )),
);
const label =
  process.argv.find((a) => a.startsWith("--client="))?.slice(9) ||
  "local-agent";
if (!/^[a-zA-Z0-9_-]{1,40}$/.test(label))
  throw Error("Invalid --client label.");
const keyDir = path.join(profile, "mcp-identities");
awaitMain().catch((error) => {
  process.stderr.write(`Piccolo MCP: ${error.message}\n`);
  process.exitCode = 1;
});

async function protect() {
  if (process.platform !== "win32") return;
  const account = `${process.env.USERDOMAIN || "."}\\${process.env.USERNAME}`;
  await new Promise<void>((resolve, reject) =>
    execFile(
      "icacls.exe",
      [keyDir, "/inheritance:r", "/grant:r", `${account}:(OI)(CI)F`],
      { windowsHide: true },
      (error) =>
        error
          ? reject(Error("Cannot protect MCP identity directory."))
          : resolve(),
    ),
  );
}
async function awaitMain() {
  await mkdir(keyDir, { recursive: true, mode: 0o700 });
  await protect();
  const keyFile = path.join(keyDir, `${label}.json`);
  let identity: { publicKey: string; privateKey: string };
  try {
    identity = JSON.parse(await readFile(keyFile, "utf8"));
  } catch (error: any) {
    if (error.code !== "ENOENT")
      throw Error(
        "Unreadable MCP identity. Restore or remove it deliberately.",
      );
    const pair = generateKeyPairSync("ed25519");
    identity = {
      publicKey: pair.publicKey
        .export({ format: "pem", type: "spki" })
        .toString(),
      privateKey: pair.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
    };
    const temporary = `${keyFile}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(identity), {
      mode: 0o600,
      flag: "wx",
    });
    // The protected parent supplies the Windows ACL before any key bytes are written.
    try {
      await link(temporary, keyFile);
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      identity = JSON.parse(await readFile(keyFile, "utf8"));
    } finally {
      await unlink(temporary);
    }
  }
  let socket: Socket | undefined,
    connected = false,
    ending = false;
  let initialize: any,
    connecting: Promise<void> | undefined,
    launched = false;
  let input = "",
    incoming = "";
  let initialVersion: string | undefined;
  const pending = new Set<string | number>();
  const send = (message: any) =>
    process.stdout.write(JSON.stringify(message) + "\n");
  const failPending = () => {
    for (const id of pending)
      send({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32001,
          message:
            "Piccolo disconnected; action was not replayed. Reconnect or retry after restart.",
        },
      });
    pending.clear();
  };
  function launch() {
    if (launched) return;
    launched = true;
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const packaged = __dirname.includes("app.asar");
    const exe = process.versions.electron
      ? process.execPath
      : path.join(
          __dirname,
          "..",
          "node_modules",
          "electron",
          "dist",
          "electron.exe",
        );
    const child = spawn(exe, packaged ? [] : [path.resolve(__dirname, "..")], {
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () =>
      process.stderr.write(
        "Piccolo MCP: browser launch failed. Start Piccolo manually.\n",
      ),
    );
    child.unref();
  }
  async function connect() {
    if (connected) return;
    if (connecting) return connecting;
    connecting = (async () => {
      const deadline = Date.now() + 20000;
      while (!ending) {
        try {
          await new Promise<void>((resolve, reject) => {
            const next = createConnection(mcpPipeName(profile));
            socket = next;
            incoming = "";
            let ready = false;
            const timer = setTimeout(() => {
              next.destroy();
              reject(
                Error(
                  "Pairing timed out; approve the client in Piccolo and reconnect.",
                ),
              );
            }, 120000);
            next.on("error", (e) => {
              clearTimeout(timer);
              if (!ready) reject(e);
            });
            next.on("close", () => {
              clearTimeout(timer);
              connected = false;
              if (ready) failPending();
              else
                reject(
                  Object.assign(
                    Error(
                      "Piccolo disconnected during authentication; retry after restart.",
                    ),
                    { code: "ECONNRESET" },
                  ),
                );
            });
            next.on("data", (chunk) => {
              incoming += chunk.toString();
              if (incoming.length > 8_000_000) {
                next.destroy();
                reject(Error("Oversized MCP response."));
                return;
              }
              let index: number;
              while ((index = incoming.indexOf("\n")) >= 0) {
                const line = incoming.slice(0, index);
                incoming = incoming.slice(index + 1);
                let message: any;
                try {
                  message = JSON.parse(line);
                } catch {
                  next.destroy();
                  reject(Error("Invalid MCP response."));
                  return;
                }
                if (message.challenge) {
                  next.write(
                    JSON.stringify({
                      name: label,
                      publicKey: identity.publicKey,
                      signature: sign(
                        null,
                        Buffer.from(message.challenge),
                        identity.privateKey,
                      ).toString("base64"),
                    }) + "\n",
                  );
                } else if (message.paired === false) {
                  clearTimeout(timer);
                  next.destroy();
                  reject(
                    Error(message.error || "Client pairing denied or revoked."),
                  );
                } else if (message.paired === true) {
                  if (initialize)
                    next.write(
                      JSON.stringify({
                        ...initialize,
                        id: "_piccolo_reconnect_",
                      }) + "\n",
                    );
                  else {
                    ready = connected = true;
                    clearTimeout(timer);
                    resolve();
                  }
                } else if (message.id === "_piccolo_reconnect_") {
                  if (
                    message.error ||
                    (initialVersion &&
                      message.result?.protocolVersion !== initialVersion)
                  ) {
                    clearTimeout(timer);
                    next.destroy();
                    reject(
                      Error(
                        "Piccolo MCP initialization changed or failed; restart the AI client's MCP connection.",
                      ),
                    );
                    return;
                  }
                  next.write(
                    '{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
                  );
                  ready = connected = true;
                  clearTimeout(timer);
                  resolve();
                } else {
                  if (
                    initialize &&
                    message.id === initialize.id &&
                    message.result?.protocolVersion
                  )
                    initialVersion = message.result.protocolVersion;
                  if (message.id !== undefined && !message.method)
                    pending.delete(message.id);
                  process.stdout.write(line + "\n");
                }
              }
            });
          });
          launched = false;
          return;
        } catch (error: any) {
          if (
            ["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes(error.code) &&
            Date.now() >= deadline
          )
            throw Error(
              "Piccolo MCP is unavailable. Open Piccolo → MCP Settings and enable the server, then retry. Check the configured profile and build paths.",
            );
          if (
            !["ENOENT", "ECONNREFUSED", "ECONNRESET"].includes(error.code) ||
            Date.now() >= deadline
          )
            throw error;
          launch();
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    })().finally(() => {
      connecting = undefined;
    });
    return connecting;
  }
  let queue = Promise.resolve();
  let queued = 0;
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    input += chunk;
    let index: number;
    while ((index = input.indexOf("\n")) >= 0) {
      const line = input.slice(0, index);
      input = input.slice(index + 1);
      if (line.length > 65536) {
        shutdown();
        return;
      }
      if (queued >= 32) {
        try {
          const message = JSON.parse(line);
          if (message.id !== undefined)
            send({
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32001,
                message: "Adapter queue is full; wait and retry.",
              },
            });
        } catch {}
        continue;
      }
      queued++;
      queue = queue.then(async () => {
        let message: any;
        try {
          message = JSON.parse(line);
          if (
            !connected &&
            (!message.method || message.method.startsWith("notifications/"))
          )
            return;
          await connect();
          if (message.method === "initialize") initialize = message;
          if (message.method && message.id !== undefined)
            pending.add(message.id);
          socket!.write(line + "\n");
        } catch (error: any) {
          if (message?.id !== undefined)
            send({
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32001, message: error.message },
            });
          else process.stderr.write(`Piccolo MCP: ${error.message}\n`);
        } finally {
          queued--;
        }
      });
    }
    if (input.length > 65536) shutdown();
  });
  function shutdown() {
    ending = true;
    socket?.destroy();
    process.stdin.destroy();
  }
  process.stdin.on("end", shutdown);
  process.stdout.on("error", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
