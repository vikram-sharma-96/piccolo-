import {
  app,
  dialog,
  type DownloadItem,
  type WebContents,
  type WebFrameMain,
} from "electron";
import { constants } from "node:fs";
import { copyFile, unlink, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Browser } from "./browser";
import type { Download } from "../shared/model";
import {
  downloadName,
  downloadRisk,
  liveDownload,
} from "../shared/download-policy";
import { TransferMeter, remainingSeconds } from "../shared/download";

type Transfer = {
  b: Browser;
  d: Download;
  item: DownloadItem;
  stage: string;
  source?: WebContents;
  pageURL: string;
  approved: boolean;
  finished: boolean;
  terminal: boolean;
  timer?: NodeJS.Timeout;
  expiry?: NodeJS.Timeout;
  abort: AbortController;
  cleanup: () => void;
  publishing: boolean;
  sample?: () => void;
};
const transfers = new Map<string, Transfer>();
const popupOpeners = new WeakMap<WebContents, string>();
export function setDownloadOpener(contents: WebContents, opener: string) {
  popupOpeners.set(contents, opener);
  contents.once("did-navigate", () => popupOpeners.delete(contents));
}
const attempts = new Map<string, number[]>();
const approving = new Set<number>();
const pendingWork = new Set<Promise<unknown>>();
const blockedSaves = new Map<Browser, NodeJS.Timeout>();
function track<T>(work: Promise<T>) {
  pendingWork.add(work);
  void work.finally(() => pendingWork.delete(work));
  return work;
}
async function removeStage(file: string) {
  for (let i = 0; i < 4; i++) {
    try {
      await unlink(file);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      if (i < 3) await new Promise((r) => setTimeout(r, 50));
    }
  }
}
const staging = () => path.join(app.getPath("userData"), "download-staging");
export async function clearDownloadStaging() {
  await mkdir(staging(), { recursive: true });
  for (const name of await readdir(staging()))
    if (/^[a-f0-9-]{36}\.part$/.test(name))
      await unlink(path.join(staging(), name)).catch(() => {});
}
function save(t: Transfer, immediate = true) {
  void track(
    t.b.persist(
      "downloads",
      t.b.state.downloads.filter((d) => !d.private),
    ),
  );
  if (immediate) t.b.emit();
  else t.b.queueEmit();
}
function stop(t: Transfer, status: string) {
  if (t.terminal || t.publishing) return;
  t.terminal = true;
  t.d.status = status;
  t.d.speed = 0;
  t.d.eta = null;
  clearInterval(t.timer);
  clearTimeout(t.expiry);
  t.abort.abort();
  t.cleanup();
  transfers.delete(t.d.id);
  if (!t.finished) t.item.cancel();
  void track(removeStage(t.stage));
  save(t);
}
async function publish(t: Transfer) {
  if (!t.approved || !t.finished || t.terminal || t.publishing) return;
  // The completion/cancel race has one commit point. Once copying starts, Cancel is a no-op.
  t.publishing = true;
  t.d.status = "finalizing";
  t.d.speed = 0;
  t.d.eta = null;
  t.b.emit();
  try {
    await copyFile(t.stage, t.d.path, constants.COPYFILE_EXCL);
    t.d.status = "completed";
  } catch {
    t.d.status = "interrupted";
    t.d.error =
      "Could not save without overwriting an existing file. Choose a new destination and retry.";
  } finally {
    t.terminal = true;
    t.publishing = false;
    clearInterval(t.timer);
    clearTimeout(t.expiry);
    t.cleanup();
    transfers.delete(t.d.id);
    await removeStage(t.stage);
    save(t);
  }
}
export function beginDownload(
  b: Browser,
  item: DownloadItem,
  source?: WebContents,
  frame?: WebFrameMain | null,
) {
  const raw = item.getFilename(),
    name = downloadName(raw),
    id = randomUUID();
  let initiator = "Unknown initiator";
  const pageURL = source && !source.isDestroyed() ? source.getURL() : "";
  const initiatingPageURL = (source && popupOpeners.get(source)) || pageURL;
  // Opaque/null origins and a frame URL are not interchangeable with an origin.
  // Normalize fallback URLs so path changes cannot evade the per-site queue limit.
  let reportedOrigin = "";
  try {
    reportedOrigin = item.getInitiatorOrigin();
  } catch {}
  for (const candidate of [reportedOrigin, initiatingPageURL, frame?.url]) {
    try {
      const origin = new URL(candidate || "").origin;
      if (/^https?:\/\//.test(origin)) {
        initiator = origin;
        break;
      }
    } catch {}
  }
  const scope = `${b.state.private ? b.win.id : "normal"}:${initiator}`;
  const recent = (attempts.get(scope) || []).filter(
    (time) => Date.now() - time < 60000,
  );
  recent.push(Date.now());
  attempts.set(scope, recent.slice(-11));
  if (attempts.size > 256) attempts.delete(attempts.keys().next().value!);
  const multiple = b.state.permissions.some(
    (p) =>
      p.permission === "automatic-downloads" &&
      p.origin === initiator &&
      p.decision === "allow",
  );
  const pending = [...transfers.values()].filter(
    (t) => t.d.initiator === initiator && t.b.ses === b.ses && !t.approved,
  );
  const windowPending = [...transfers.values()].filter(
    (t) => t.b === b && !t.approved,
  ).length;
  const blocked =
    recent.length > 10 ||
    transfers.size >= 8 ||
    windowPending >= 4 ||
    pending.length >= (multiple ? 4 : 1);
  if (blocked) {
    item.cancel();
    const existing = b.state.downloads.find(
      (d) => d.status === "blocked" && d.initiator === initiator,
    );
    if (existing) {
      existing.blockedCount = (existing.blockedCount || 1) + 1;
      existing.created = Date.now();
    } else
      b.state.downloads.unshift({
        id,
        name,
        url: item.getURL(),
        path: "",
        received: 0,
        total: Math.max(0, item.getTotalBytes()),
        status: "blocked",
        private: b.state.private,
        speed: 0,
        eta: null,
        initiator,
        pageURL: initiatingPageURL,
        mime: item.getMimeType(),
        risk: downloadRisk(raw),
        created: Date.now(),
        blockedCount: 1,
        error:
          "Additional automatic download blocked. A site cannot fill the approval queue. Review its multiple-download permission in Settings.",
      });
    let blockedRecords = 0;
    b.state.downloads = b.state.downloads.filter(
      (d) => d.status !== "blocked" || ++blockedRecords <= 20,
    );
    if (!blockedSaves.has(b)) {
      const timer = setTimeout(() => {
        blockedSaves.delete(b);
        void track(
          b.persist(
            "downloads",
            b.state.downloads.filter((d) => !d.private),
          ),
        );
      }, 1000);
      timer.unref();
      blockedSaves.set(b, timer);
    }
    b.queueEmit();
    return;
  }
  const stage = path.join(staging(), `${id}.part`);
  item.setSavePath(stage);
  item.pause();
  const d: Download = {
    id,
    name,
    url: item.getURL(),
    path: path.join(
      b.state.settings.downloadDirectory || app.getPath("downloads"),
      `${Date.now()}-${id.slice(0, 8)}-${name}`,
    ),
    received: Math.max(0, item.getReceivedBytes()),
    total: Math.max(0, item.getTotalBytes()),
    status: "awaiting-approval",
    private: b.state.private,
    speed: 0,
    eta: null,
    initiator,
    pageURL: initiatingPageURL,
    mime: item.getMimeType(),
    risk: downloadRisk(raw),
    userGesture: item.hasUserGesture(),
    created: Date.now(),
  };
  const t: Transfer = {
    b,
    d,
    item,
    stage,
    source,
    pageURL,
    approved: false,
    finished: false,
    terminal: false,
    abort: new AbortController(),
    cleanup: () => {},
    publishing: false,
  };
  transfers.set(id, t);
  b.state.downloads.unshift(d);
  b.state.downloads = b.state.downloads.filter(
    (value, index) => index < 300 || liveDownload(value.status),
  );
  const cancelPending = () => {
    if (!t.approved) stop(t, "cancelled");
  };
  const navigation = (
    _event: unknown,
    url: string,
    _inPlace: boolean,
    mainFrame: boolean,
  ) => {
    if (mainFrame && url !== pageURL) cancelPending();
  };
  source?.once("destroyed", cancelPending);
  source?.on("did-start-navigation", navigation);
  const windowClosed = () => {
    if (!t.approved || b.state.private) stop(t, "cancelled");
  };
  b.win.once("closed", windowClosed);
  t.cleanup = () => {
    source?.removeListener("destroyed", cancelPending);
    source?.removeListener("did-start-navigation", navigation);
    b.win.removeListener("closed", windowClosed);
  };
  t.expiry = setTimeout(() => {
    if (!t.approved) stop(t, "cancelled");
  }, 120000);
  t.expiry.unref();
  const meter = new TransferMeter();
  let lastSaved = Date.now();
  const sample = () => {
    if (t.terminal || !t.approved || t.publishing) return;
    d.received = Math.max(0, item.getReceivedBytes());
    d.total = Math.max(0, item.getTotalBytes());
    d.speed = meter.sample(d.received, Date.now(), !item.isPaused());
    d.eta = remainingSeconds(d.total, d.received, d.speed);
    b.queueEmit();
    if (Date.now() - lastSaved > 2000) {
      lastSaved = Date.now();
      save(t, false);
    }
  };
  t.sample = sample;
  item.on("updated", (_event, status) => {
    if (t.terminal || !t.approved || t.publishing) return;
    d.status = item.isPaused() ? "paused" : status;
    if (d.status !== "progressing") {
      clearInterval(t.timer);
      t.timer = undefined;
      d.speed = 0;
      d.eta = null;
    } else if (!t.timer) {
      t.timer = setInterval(sample, 1000);
      t.timer.unref();
    }
    sample();
  });
  item.once("done", (_event, status) => {
    if (t.terminal) {
      void track(removeStage(t.stage));
      return;
    }
    t.finished = true;
    clearInterval(t.timer);
    t.timer = undefined;
    d.received = Math.max(0, item.getReceivedBytes());
    d.speed = 0;
    d.eta = null;
    if (status === "completed") {
      void track(publish(t));
      b.emit();
    } else stop(t, status);
  });
  save(t);
}
export async function downloadAction(b: Browser, id: string, action: string) {
  const d = b.state.downloads.find((d) => d.id === id),
    t = transfers.get(id);
  if (!d) throw Error("Download record not found.");
  if (action === "remove") {
    if (liveDownload(d.status))
      throw Error("Cancel the transfer before removing its record.");
    b.state.downloads = b.state.downloads.filter((d) => d.id !== id);
    await b.persist("downloads", b.state.downloads);
    b.emit();
    return;
  }
  if (action === "cancel") {
    if (t?.publishing)
      throw Error(
        "The transfer has finished and is being saved. Remove its record after saving completes.",
      );
    if (t)
      stop(t, "cancelled"); // terminal downloads, including completed files, are immutable
    else if (liveDownload(d.status)) {
      d.status = "cancelled";
      d.speed = 0;
      d.eta = null;
      await b.persist("downloads", b.state.downloads);
      b.emit();
    }
    return;
  }
  if (!t || (t.b !== b && t.b.ses !== b.ses))
    throw Error("This transfer is no longer active in the selected session.");
  if (action === "approve") {
    if (t.approved || t.terminal) return;
    if (approving.has(b.win.id))
      throw Error(
        "Finish the existing download approval in this window first.",
      );
    if (
      t.source &&
      (t.source.isDestroyed() || t.source.getURL() !== t.pageURL)
    ) {
      stop(t, "cancelled");
      throw Error(
        "The initiating page changed or closed. Request the download again.",
      );
    }
    const windowId = b.win.id;
    approving.add(windowId);
    d.status = "approving";
    b.emit();
    try {
      if (d.risk) {
        const r = await dialog.showMessageBox(b.win, {
          type: "warning",
          message: "Save a potentially dangerous file?",
          detail: `${d.name}\n${d.risk}\nInitiator: ${d.initiator}\nDownload: ${d.url}\nThis is not antivirus or reputation scanning.`,
          buttons: ["Cancel", "Allow saving"],
          defaultId: 0,
          cancelId: 0,
          signal: t.abort.signal,
        });
        if (r.response !== 1) {
          stop(t, "cancelled");
          return;
        }
      }
      let destination = d.path;
      if (b.state.settings.askDownload) {
        const choice = await dialog.showSaveDialog(b.win, {
          defaultPath: destination,
          title: "Save to a new file (existing files are preserved)",
          buttonLabel: "Allow and save",
          properties: ["dontAddToRecent"],
        });
        if (choice.canceled || !choice.filePath) {
          stop(t, "cancelled");
          return;
        }
        destination = choice.filePath;
      }
      if (t.terminal || b.win.isDestroyed()) return;
      if (
        t.source &&
        (t.source.isDestroyed() || t.source.getURL() !== t.pageURL)
      ) {
        stop(t, "cancelled");
        return;
      }
      d.path = destination;
      t.approved = true;
      clearTimeout(t.expiry);
      d.status = "progressing";
      t.cleanup();
      if (t.finished) await track(publish(t));
      else {
        t.item.resume();
        t.sample?.();
        if (!t.timer) {
          t.timer = setInterval(() => t.sample?.(), 1000);
          t.timer.unref();
        }
      }
      save(t);
    } catch (error) {
      stop(t, "cancelled");
      throw error;
    } finally {
      approving.delete(windowId);
    }
    return;
  }
  if (!t.approved)
    throw Error("Approve the download before changing its transfer state.");
  if (t.finished || t.publishing)
    throw Error("The transfer has finished. Wait for saving to complete.");
  if (action === "pause") {
    t.item.pause();
    clearInterval(t.timer);
    t.timer = undefined;
    d.status = "paused";
    d.speed = 0;
    d.eta = null;
    save(t);
  } else if (action === "resume") {
    if (!t.item.canResume())
      throw Error(
        "This server cannot resume the transfer. Retry from the start.",
      );
    d.status = "progressing";
    t.item.resume();
    t.sample?.();
    if (!t.timer) {
      t.timer = setInterval(() => t.sample?.(), 1000);
      t.timer.unref();
    }
    save(t);
  }
}
export function closeDownloadWindow(b: Browser) {
  for (const t of transfers.values())
    if (t.b === b && (!t.approved || b.state.private)) stop(t, "cancelled");
}
export async function shutdownDownloads() {
  for (const [b, timer] of blockedSaves) {
    clearTimeout(timer);
    void track(
      b.persist(
        "downloads",
        b.state.downloads.filter((d) => !d.private),
      ),
    );
  }
  blockedSaves.clear();
  for (const t of transfers.values()) stop(t, "interrupted");
  while (pendingWork.size) await Promise.allSettled([...pendingWork]);
}
