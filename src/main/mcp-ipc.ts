import { createHash } from "node:crypto";
import path from "node:path";

/**
 * The stdio adapter never exposes a TCP port. It connects to this per-profile
 * local IPC endpoint owned by the already-running Piccolo process.
 */
export function mcpPipeName(userData: string) {
  const id = createHash("sha256")
    .update(path.resolve(userData))
    .digest("hex")
    .slice(0, 32);
  return process.platform === "win32"
    ? `\\\\.\\pipe\\piccolo-mcp-${id}`
    : path.join(userData, `piccolo-mcp-${id}.sock`);
}
