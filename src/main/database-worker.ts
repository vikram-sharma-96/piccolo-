import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(workerData.path);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations VALUES(1);
 CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,url TEXT NOT NULL,title TEXT NOT NULL,time INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS history_time ON history(time DESC);`);
parentPort!.on("message", ({ id, op, args }) => {
  try {
    let result: unknown;
    if (op === "get")
      result = db.prepare("SELECT value FROM kv WHERE key=?").get(args[0]);
    else if (op === "set")
      result = db
        .prepare(
          "INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(args[0], JSON.stringify(args[1]));
    else if (op === "visit") {
      const last = db
        .prepare("SELECT * FROM history ORDER BY time DESC LIMIT 1")
        .get() as { id: number; url: string; time: number } | undefined;
      if (last && last.url === args[0] && Date.now() - last.time < 60000)
        db.prepare("UPDATE history SET title=?,time=? WHERE id=?").run(
          args[1],
          Date.now(),
          last.id,
        );
      else
        db.prepare("INSERT INTO history(url,title,time) VALUES(?,?,?)").run(
          args[0],
          args[1],
          Date.now(),
        );
    } else if (op === "history")
      result = db
        .prepare(
          "SELECT * FROM history WHERE url LIKE ? OR title LIKE ? ORDER BY time DESC LIMIT 300",
        )
        .all(`%${args[0]}%`, `%${args[0]}%`);
    else if (op === "delete")
      result = db.prepare("DELETE FROM history WHERE id=?").run(args[0]);
    else if (op === "clear")
      result = db.prepare("DELETE FROM history WHERE time>=?").run(args[0]);
    else if (op === "close") {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
      result = true;
    } else throw Error("Unknown database operation");
    parentPort!.postMessage({ id, result });
  } catch (error) {
    parentPort!.postMessage({ id, error: String(error) });
  }
});
