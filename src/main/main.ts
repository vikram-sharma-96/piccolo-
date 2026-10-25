import { app, protocol, net, session, ipcMain, Menu, dialog } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { Store } from "./store";
import { clearDownloadStaging, shutdownDownloads } from "./downloads";
import { Browser, browsers } from "./browser";
import {
  commandSchema,
  settingsSchema,
  bookmarkSchema,
  permissionSchema,
  downloadSchema,
  sessionSchema,
  type Bookmark,
  type Download,
  type Permission,
  type Tab,
} from "../shared/model";
if (process.env.PICCOLO_PROFILE)
  app.setPath("userData", path.resolve(process.env.PICCOLO_PROFILE));
app.setName("Piccolo");
const primary = app.requestSingleInstanceLock();
if (!primary) app.exit();
app.on("second-instance", () => {
  const b = [...browsers][0];
  if (b) {
    b.win.restore();
    b.win.focus();
  }
});
protocol.registerSchemesAsPrivileged([
  {scheme:'piccolo-code',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}},
  {
    scheme: "piccolo-ui",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "piccolo-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
let store: Store;
let exiting = false;
app
  .whenReady()
  .then(async () => {
    await mkdir(app.getPath("userData"), { recursive: true });
    await clearDownloadStaging();
    store = new Store(path.join(app.getPath("userData"), "piccolo.sqlite"));
    const ui = session.fromPartition("piccolo-ui");
    ui.protocol.handle("piccolo-ui", (request) => {
      const u = new URL(request.url);
      const relative = decodeURIComponent(u.pathname).replace(/^\//, "");
      const root = path.join(__dirname, "ui");
      const target = path.resolve(root, relative || "index.html");
      if (u.host !== "app" || !target.startsWith(root + path.sep))
        return new Response("Forbidden", { status: 403 });
      return net.fetch(pathToFileURL(target).href);
    });
    ui.protocol.handle("piccolo-asset", (request) => {
      const u = new URL(request.url);
      const name = decodeURIComponent(u.pathname.slice(1));
      if (
        u.host !== "wallpaper" ||
        !/^[-a-f0-9]+\.(png|jpg|jpeg|webp|mp4|webm)$/.test(name)
      )
        return new Response("Forbidden", { status: 403 });
      return net.fetch(
        pathToFileURL(path.join(app.getPath("userData"), "wallpapers", name))
          .href,
      );
    });
    ui.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    ui.setPermissionCheckHandler(() => false);
    const parsed = settingsSchema.safeParse(await store.get("settings", {}));
    const settings = parsed.success ? parsed.data : settingsSchema.parse({});
    const savedBookmarks = await store.get<unknown>("bookmarks", []),
      savedPermissions = await store.get<unknown>("permissions", []);
    const bookmarks = (
      Array.isArray(savedBookmarks) ? savedBookmarks : []
    ).flatMap((b) => {
      const p = bookmarkSchema.safeParse(b);
      return p.success ? [p.data] : [];
    });
    const permissions = (
      Array.isArray(savedPermissions) ? savedPermissions : []
    ).flatMap((p) => {
      const v = permissionSchema.safeParse(p);
      return v.success ? [v.data] : [];
    });
    const savedDownloads = await store.get<unknown>("downloads", []);
    const downloads = (Array.isArray(savedDownloads) ? savedDownloads : [])
      .flatMap((d) => {
        const p = downloadSchema.safeParse(d);
        return p.success ? [p.data] : [];
      })
      .map((d) => ({
        ...d,
        speed: 0,
        eta: null,
        status: [
          "awaiting-approval",
          "approving",
          "progressing",
          "paused",
          "finalizing",
        ].includes(d.status)
          ? "interrupted"
          : d.status,
      }));
    const clean = await store.get("clean-exit", true);
    const sessionResult = sessionSchema.safeParse(
      await store.get("last-session", []),
    );
    const sessions = sessionResult.success ? sessionResult.data : [];
    // One atomic snapshot is written on changes and before closing the final window.
    const restore = sessions;
    await store.set("clean-exit", false);
    const create = () =>
      new Browser(
        store,
        settings,
        bookmarks,
        downloads,
        permissions,
        false,
        settings.startup === "restore" ? restore : [],
        !clean,
      );
    const first = create();
    if (settings.mcpEnabled)
      void require(path.join(__dirname, "mcp.cjs"))
        .startMcp(first)
        .catch((error: unknown) => console.error("MCP startup failed:", error));
    void (async () => {
      const installed = await store.get<any[]>("extensions", []);
      if (Array.isArray(installed) && installed.length)
        await require(path.join(__dirname, "optional.cjs")).restoreOptional(
          first,
        );
    })().catch(console.error);
    if (settings.dailyWallpaper)
      void require(path.join(__dirname, "optional.cjs")).checkDaily(first);
    const trusted = (event: Electron.IpcMainInvokeEvent) => {
      const b = [...browsers].find((b) => b.win.webContents === event.sender);
      if (
        !b ||
        event.senderFrame !== event.sender.mainFrame ||
        event.senderFrame.url !== "piccolo-ui://app/index.html"
      )
        throw Error("Untrusted IPC sender");
      return b;
    };
    ipcMain.handle("piccolo:state", (event) => trusted(event).state);
    ipcMain.handle("piccolo:command", async (event, raw) => {
      const b = trusted(event);
      const c = commandSchema.parse(raw);
      const result = await b.command(c);
      return result;
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Piccolo",
          submenu: [
            {
              label: "New tab",
              accelerator: "CmdOrCtrl+T",
              click: () => {
                const b = [...browsers].find((b) => b.win.isFocused());
                if (b && b.state.tabs.length < 100) b.newTab();
              },
            },
            { role: "quit" },
          ],
        },
      ]),
    );
    app.on("activate", () => {
      if (!browsers.size) create();
    });
  })
  .catch((error) => {
    dialog.showErrorBox("Piccolo could not start", String(error));
    app.quit();
  });
app.on("before-quit", (event) => {
  if (exiting || !store) return;
  event.preventDefault();
  exiting = true;
  void (async () => {
    const codingFile=path.join(__dirname,'coding.cjs');
    if(require.cache[codingFile]&&!(await require(codingFile).shutdown())){exiting=false;return;}
    await shutdownDownloads();
    const mcpFile = path.join(__dirname, "mcp.cjs");
    if (require.cache[mcpFile]) await require(mcpFile).stopMcp();
    const normal = [...browsers].filter((b) => !b.state.private);
    if (normal.length)
      await store.set(
        "last-session",
        normal.flatMap((b) =>
          b.state.tabs.map(({ url, pinned }) => ({ url, pinned })),
        ),
      );
    await store.set("clean-exit", true);
    await store.close();
    app.exit();
  })();
});
app.on("window-all-closed", () => app.quit());
