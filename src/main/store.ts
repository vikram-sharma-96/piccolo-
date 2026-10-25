import { Worker } from "node:worker_threads";
import path from "node:path";
export class Store {
  private worker: Worker;
  private serial = 0;
  private closed = false;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void }
  >();
  constructor(file: string) {
    this.worker = new Worker(path.join(__dirname, "database-worker.cjs"), {
      workerData: { path: file },
    });
    this.worker.on("message", ({ id, result, error }) => {
      const p = this.pending.get(id);
      this.pending.delete(id);
      if (error) p?.reject(Error(error));
      else p?.resolve(result);
    });
    this.worker.on("exit", () => {
      this.closed = true;
      for (const p of this.pending.values())
        p.reject(Error("Database worker exited"));
      this.pending.clear();
    });
    this.worker.on("error", (e) => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    });
  }
  call(op: string, ...args: unknown[]): Promise<any> {
    if (this.closed) return Promise.reject(Error("Database is closed"));
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, op, args });
    });
  }
  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await this.call("get", key);
    try {
      return row ? JSON.parse(row.value) : fallback;
    } catch {
      return fallback;
    }
  }
  async set(key: string, value: unknown) {
    await this.call("set", key, value);
  }
  async close() {
    if (this.closed) return;
    await this.call("close");
    this.closed = true;
    await this.worker.terminate();
    for (const p of this.pending.values()) p.reject(Error("Database closed"));
    this.pending.clear();
  }
}
