import {
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { AgentArtifact, AgentTask } from "../shared/agent";
import { TaskSheets } from "./agent-sheet";
type Cipher = {
  encrypt(value: string): Promise<Buffer>;
  decrypt(value: Buffer): Promise<string>;
};
export class AgentArchive {
  private retained = new Set<string>();
  private hashes = new Map<string, string>();
  constructor(
    private root: string,
    private cipher: Cipher,
  ) {
    this.root = path.resolve(root);
  }
  private blob(id: string) {
    z.string().uuid().parse(id);
    return path.join(this.root, "artifacts", id + ".bin");
  }
  private hash(artifact: AgentArtifact) {
    return createHash("sha256")
      .update(
        artifact.mime.startsWith("image/")
          ? Buffer.from(artifact.data, "base64")
          : artifact.data,
      )
      .digest("hex");
  }
  private async atomic(file: string, data: Buffer) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = path.join(
      path.dirname(file),
      "write-" + randomUUID() + ".tmp",
    );
    try {
      await writeFile(temporary, data, { flag: "wx" });
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temporary, file);
          break;
        } catch (error: any) {
          if (
            !["EPERM", "EBUSY", "EACCES"].includes(error.code) ||
            attempt >= 5
          )
            throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * 2 ** attempt),
          );
        }
      }
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async read(): Promise<AgentTask[]> {
    try {
      const file = path.join(this.root, "tasks.bin");
      if ((await stat(file)).size > 32_000_000)
        throw Error("Agent history exceeds 32 MB.");
      const tasks = JSON.parse(await this.cipher.decrypt(await readFile(file)));
      if (!Array.isArray(tasks)) throw Error("Invalid task history.");
      for (const task of tasks) {
        z.string().uuid().parse(task.id);
        if (
          !Array.isArray(task.steps) ||
          !Array.isArray(task.artifacts) ||
          !Array.isArray(task.events) ||
          !Array.isArray(task.sources)
        )
          throw Error("Invalid task record.");
        for (const artifact of task.artifacts) {
          this.blob(artifact.id);
          this.retained.add(artifact.id);
        }
      }
      return tasks.slice(-5);
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  async write(tasks: AgentTask[]) {
    const live = new Set<string>();
    for (const task of tasks) {
      z.string().uuid().parse(task.id);
      for (const artifact of task.artifacts) {
        const file = this.blob(artifact.id);
        live.add(artifact.id);
        if (!artifact.data) continue;
        if (
          artifact.data.length > 4_000_000 ||
          this.hash(artifact) !== artifact.sha256
        )
          throw Error("Invalid artifact data/hash.");
        if (this.hashes.get(artifact.id) === artifact.sha256) continue;
        if (this.hashes.has(artifact.id))
          throw Error("Artifact data changed after creation.");
        await this.atomic(file, await this.cipher.encrypt(artifact.data));
        this.hashes.set(artifact.id, artifact.sha256);
      }
    }
    const metadata = tasks.map((task) => ({
      ...task,
      artifacts: task.artifacts.map((artifact) => ({ ...artifact, data: "" })),
    }));
    const json = JSON.stringify(metadata);
    if (Buffer.byteLength(json) > 32_000_000)
      throw Error("Agent checkpoint exceeds 32 MB.");
    await this.atomic(
      path.join(this.root, "tasks.bin"),
      await this.cipher.encrypt(json),
    );
    const obsolete = [...this.retained].filter((id) => !live.has(id));
    this.retained = live;
    for (const id of obsolete) {
      await unlink(this.blob(id)).catch((error: any) => {
        if (error.code !== "ENOENT") throw error;
      });
      this.hashes.delete(id);
    }
    await new TaskSheets(path.join(this.root, "tasks")).prune(
      tasks.map((task) => task.id),
    );
  }
  async artifact(metadata: AgentArtifact): Promise<AgentArtifact> {
    const file = this.blob(metadata.id);
    // Read old inline records without discarding pre-release development history.
    const data =
      metadata.data || (await this.cipher.decrypt(await readFile(file)));
    const artifact = { ...metadata, data };
    if (this.hash(artifact) !== metadata.sha256)
      throw Error("Stored artifact hash differs.");
    return artifact;
  }
  async clear() {
    await new TaskSheets(path.join(this.root, "tasks")).prune([]);
    for (const directory of [this.root, path.join(this.root, "artifacts")]) {
      const names = await readdir(directory).catch((error: any) => {
        if (error.code === "ENOENT") return [] as string[];
        throw error;
      });
      for (const name of names) {
        if (
          (directory === this.root && name === "tasks.bin") ||
          /^write-[a-f0-9-]{36}\.tmp$/.test(name) ||
          (directory !== this.root && /^[a-f0-9-]{36}\.bin$/.test(name))
        )
          await unlink(path.join(directory, name));
      }
    }
    this.retained.clear();
    this.hashes.clear();
  }
}
