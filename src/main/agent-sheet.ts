import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  lstat,
  readdir,
  rmdir,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseCsv, compareSheet } from "../shared/agent-sheet";
export class TaskSheets {
  constructor(private root: string) {
    this.root = path.resolve(root);
  }
  private async directory(taskId: string, create = false) {
    z.string().uuid().parse(taskId);
    if (create) await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink())
      throw Error("Sheet root cannot be a link.");
    const folder = path.join(this.root, taskId);
    if (create)
      await mkdir(folder, { recursive: false }).catch((error: any) => {
        if (error.code !== "EEXIST") throw error;
      });
    if ((await lstat(folder)).isSymbolicLink())
      throw Error("Task folder cannot be a link.");
    return folder;
  }
  private async file(taskId: string, fileName: string, create = false) {
    if (!/^[a-f0-9-]{36}\.(?:csv|md|png)$/.test(fileName))
      throw Error("Invalid sheet filename.");
    z.string().uuid().parse(path.parse(fileName).name);
    const file = path.join(await this.directory(taskId, create), fileName);
    try {
      const info = await lstat(file);
      if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1)
        throw Error("Sheet must be an ordinary owned file.");
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    return file;
  }
  async write(
    taskId: string,
    fileName: string,
    csv: string | Buffer,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const file = await this.file(taskId, fileName, true),
      temporary = path.join(
        path.dirname(file),
        ".write-" + randomUUID() + ".tmp",
      );
    try {
      await writeFile(temporary, csv, { flag: "wx", encoding: "utf8", signal });
      signal?.throwIfAborted();
      await this.file(taskId, fileName);
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return file;
  }
  async read(taskId: string, fileName: string) {
    const file = await this.file(taskId, fileName);
    if ((await lstat(file)).size > 1_000_000)
      throw Error("Sheet exceeds read limit.");
    return readFile(file, "utf8");
  }
  async readBytes(taskId:string,fileName:string){const file=await this.file(taskId,fileName);if((await lstat(file)).size>4_000_000)throw Error('Artifact file exceeds read limit.');return readFile(file);}
  async verify(taskId: string, fileName: string, expectedCsv: string) {
    const expected = parseCsv(expectedCsv);
    let actual;
    try {
      actual = parseCsv(await this.read(taskId, fileName));
    } catch (error: any) {
      if (error.code === "ENOENT")
        return {
          ...compareSheet(expected, undefined),
          error: "Sheet file is missing.",
        };
      if (/CSV|quote/.test(String(error)))
        return {
          ...compareSheet(expected, undefined),
          error: "Malformed CSV on disk.",
        };
      throw error;
    }
    return compareSheet(expected, actual);
  }
  async prune(retain: string[]) {
    const names = await readdir(this.root).catch((error: any) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    });
    for (const name of names) {
      if (!z.string().uuid().safeParse(name).success || retain.includes(name))
        continue;
      const folder = await this.directory(name);
      for (const fileName of await readdir(folder)) {
        if (
          !/^(?:[a-f0-9-]{36}\.(?:csv|md|png)|\.write-[a-f0-9-]{36}\.tmp)$/.test(fileName)
        )
          continue;
        const file = path.join(folder, fileName);
        const info = await lstat(file);
        if (!info.isSymbolicLink() && info.isFile()) await unlink(file);
      }
      await rmdir(folder).catch((error: any) => {
        if (error.code !== "ENOTEMPTY") throw error;
      });
    }
  }
}
