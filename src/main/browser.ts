import {
  BrowserWindow,
  WebContentsView,
  session,
  Menu,
  dialog,
  shell,
  clipboard,
  app,
  nativeTheme,
  type Session,
} from "electron";
import {
  beginDownload,
  downloadAction,
  closeDownloadWindow,
  setDownloadOpener,
} from "./downloads";
import { liveDownload } from "../shared/download-policy";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import {
  settingsSchema,
  type State,
  type Tab,
  type Settings,
  type Bookmark,
  type Download,
  type Permission,
  type Command,
} from "../shared/model";
import { destination, internal, webURL } from "../shared/url";
import { parseBookmarks, exportBookmarks } from "../shared/bookmarks";
import type { Store } from "./store";

// Optional integration bundles must share the main process's actual window registry.
const browserRegistry = Symbol.for("piccolo.browser-registry");
export const browsers: Set<Browser> = ((globalThis as any)[browserRegistry] ||=
  new Set<Browser>());
const retryRequests = new WeakMap<Session, Map<string, Browser[]>>();
const configured = new WeakSet<Session>();
const uiURL = "piccolo-ui://app/index.html";
export class Browser {
  win: BrowserWindow;
  state: State;
  ses: Session;
  views = new Map<string, WebContentsView>();
  agentTasks = 0;
  closed: Tab[] = [];
  overlay = false;
  findOpen = false;
  htmlFullscreen = false;
  timer: NodeJS.Timeout;
  private sessionTimer?: NodeJS.Timeout;
  private emitTimer?: NodeJS.Timeout;
  private closing = false;
  private sessionKey = "";
  private faviconCache = new Map<string, string>();
  private promptPending = false;
  private lastExternal = 0;
  private lastInteraction = 0;
  private mediaTabs = new Set<number>();
  constructor(
    public store: Store,
    settings: Settings,
    bookmarks: Bookmark[],
    downloads: Download[],
    permissions: Permission[],
    privateMode = false,
    restore: Partial<Tab>[] = [],
    public recovered = false,
  ) {
    this.ses = session.fromPartition(
      privateMode ? `private-${randomUUID()}` : "persist:browsing",
    );
    this.state = {
      tabs: [],
      activeId: "",
      private: privateMode,
      settings: structuredClone(settings),
      bookmarks: structuredClone(bookmarks),
      downloads: privateMode ? [] : downloads,
      permissions: privateMode ? [] : permissions,
      visible: true,
      version: app.getVersion(),
      recovered,
      sidebarOpen: false,
      appearance:
        settings.theme === "system"
          ? nativeTheme.shouldUseDarkColors
            ? "dark"
            : "light"
          : settings.theme,
    };
    this.win = new BrowserWindow({
      width: 1380,
      height: 900,
      minWidth: 820,
      minHeight: 600,
      show: false,
      backgroundColor: this.state.appearance === "dark" ? "#101419" : "#eef1f4",
      title: "Piccolo",
      icon: path.join(app.getAppPath(), "assets/icon.ico"),
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: this.state.appearance === "dark" ? "#101419" : "#eef1f4",
        symbolColor: this.state.appearance === "dark" ? "#e4e7ed" : "#252c36",
        height: 40,
      },
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: "piccolo-ui",
        additionalArguments: [`--piccolo-appearance=${this.state.appearance}`],
      },
    });
    if (browsers.size >= 12) {
      this.win.destroy();
      throw Error("Close a window before opening another (maximum 12).");
    }
    browsers.add(this);
    this.win.once("ready-to-show", () => this.win.show());
    const appearanceChanged = () => this.updateAppearance();
    nativeTheme.on("updated", appearanceChanged);
    this.configureSession();
    this.win.webContents.on("will-navigate", (e) => e.preventDefault());
    this.win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.win.webContents.on("before-input-event", (e, input) =>
      this.shortcut(e, input),
    );
    this.win.webContents.on("did-finish-load", () => this.emit());
    this.win.on("resize", () => this.bounds());
    this.win.on("enter-full-screen", () => this.bounds());
    this.win.on("leave-full-screen", () => this.bounds());
    const visibility = () => {
      this.state.visible = !this.win.isMinimized() && this.win.isVisible();
      this.emit();
      if (
        this.state.visible &&
        this.active()?.url === "piccolo://newtab" &&
        this.state.settings.dailyWallpaper &&
        !this.state.private
      )
        void require(path.join(__dirname, "optional.cjs")).checkDaily(this);
    };
    this.win.on("minimize", visibility);
    this.win.on("restore", visibility);
    this.win.on("show", visibility);
    this.win.on("hide", visibility);
    this.win.on("close", (event) => {
      if(require.cache[path.join(__dirname,'coding.cjs')]?.exports.confirmWindowClose(this,event))return;
      this.closing = true;
      clearInterval(this.timer);
      clearTimeout(this.sessionTimer);
      clearTimeout(this.emitTimer);
      if (!privateMode) void this.persistSession();
      for (const tab of this.state.tabs) this.destroyView(tab.id);
    });
    this.win.on("closed", () => {
      nativeTheme.removeListener("updated", appearanceChanged);
      closeDownloadWindow(this);
      browsers.delete(this);
      if (privateMode) {
        this.ses.setPermissionCheckHandler(() => false);
        this.ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
        this.ses.setDisplayMediaRequestHandler(null);
        void this.ses.clearStorageData();
        void this.ses.clearCache();
        this.ses.removeAllListeners("will-download");
      }
    });
    void this.win.loadURL(uiURL).catch(console.error);
    for (const tab of restore.slice(0, 100)) {
      if (tab.url && (internal(tab.url) || webURL(tab.url)))
        this.newTab(tab.url, true, !!tab.pinned);
    }
    if (!this.state.tabs.length) this.newTab();
    else this.activate(this.state.tabs[0].id);
    this.timer = setInterval(() => this.sleepInactive(), 60000);
    this.timer.unref();
  }
  configureSession() {
    if (configured.has(this.ses)) return;
    configured.add(this.ses);
    this.ses.setPermissionCheckHandler((wc, permission, origin) => {
      const b = [...browsers].find((b) =>
        [...b.views.values()].some((v) => v.webContents === wc),
      );
      const allowed =
        !!b &&
        b.state.permissions.some(
          (p) =>
            p.origin === origin &&
            p.permission === permission &&
            p.decision === "allow",
        );
      if (allowed && permission === "media" && wc) b?.mediaTabs.add(wc.id);
      return allowed;
    });
    this.ses.setPermissionRequestHandler(
      (wc, permission, callback, details) => {
        const b = [...browsers].find((b) =>
          [...b.views.values()].some((v) => v.webContents === wc),
        );
        if (!b || wc.isDestroyed() || !details.isMainFrame || b.promptPending) {
          callback(false);
          return;
        }
        let origin: string;
        try {
          origin = new URL(details.requestingUrl || wc.getURL()).origin;
        } catch {
          callback(false);
          return;
        }
        const prior = b.state.permissions.find(
          (p) => p.origin === origin && p.permission === permission,
        );
        if (prior) {
          if (permission === "media" && prior.decision === "allow")
            b.mediaTabs.add(wc.id);
          callback(prior.decision === "allow");
          return;
        }
        // Screen capture, MIDI, filesystem and unknown capabilities stay denied.
        if (
          ![
            "media",
            "geolocation",
            "notifications",
            "clipboard-sanitized-write",
            "fullscreen",
          ].includes(permission) ||
          !origin.startsWith("https://")
        ) {
          callback(false);
          return;
        }
        b.promptPending = true;
        void dialog
          .showMessageBox(b.win, {
            type: "question",
            title: "Site permission",
            message: `${origin} requests ${permission}`,
            detail:
              "Media permission can grant camera and microphone access. Only allow sites you trust.",
            buttons: ["Deny", "Allow"],
            defaultId: 0,
            cancelId: 0,
          })
          .then(({ response }) => {
            b.promptPending = false;
            if (response === 1 && permission === "media")
              b.mediaTabs.add(wc.id);
            callback(response === 1);
            b.state.permissions = b.state.permissions.filter(
              (p) => p.origin !== origin || p.permission !== permission,
            );
            b.state.permissions.push({
              origin,
              permission,
              decision: response === 1 ? "allow" : "deny",
            });
            void b.persist("permissions", b.state.permissions);
            b.emit();
          });
      },
    );
    this.ses.setDisplayMediaRequestHandler((_request, callback) =>
      callback({}),
    );
    const sesForDownloads = this.ses;
    this.ses.on("will-download", (_event, item, wc, frame) => {
      let b = [...browsers].find((b) =>
        [...b.views.values()].some((v) => v.webContents === wc),
      );
      if (!b && !wc) {
        const pending = retryRequests.get(sesForDownloads);
        for (const url of item.getURLChain()) {
          const queue = pending?.get(url);
          if (queue?.length) {
            b = queue.shift();
            if (!queue.length) pending?.delete(url);
            break;
          }
        }
      }
      if (!b || b.win.isDestroyed()) {
        item.cancel();
        return;
      }
      beginDownload(b, item, wc, frame);
    });
  }
  updateAppearance() {
    this.state.appearance =
      this.state.settings.theme === "system"
        ? nativeTheme.shouldUseDarkColors
          ? "dark"
          : "light"
        : this.state.settings.theme;
    if (this.win.isDestroyed()) return;
    const dark = this.state.appearance === "dark";
    this.win.setBackgroundColor(dark ? "#101419" : "#eef1f4");
    this.win.setTitleBarOverlay({
      color: dark ? "#101419" : "#eef1f4",
      symbolColor: dark ? "#e4e7ed" : "#252c36",
      height: 40,
    });
    this.emit();
  }
  async persist(key: string, value: unknown) {
    if (this.state.private) return;
    if (["bookmarks", "downloads", "permissions"].includes(key)) {
      for (const b of browsers)
        if (!b.state.private && b !== this) {
          (b.state as any)[key] = value;
          b.emit();
        }
    }
    try {
      await this.store.set(key, value);
    } catch (error) {
      console.error("Persistence failed", error);
    }
  }
  emit() {
    if (this.win.isDestroyed() || this.closing) return;
    require.cache[path.join(__dirname,'coding.cjs')]?.exports.syncBounds(this);
    this.win.webContents.send("piccolo:state", this.state);
    const key = JSON.stringify(
      [...browsers]
        .filter((b) => !b.state.private)
        .flatMap((b) =>
          b.state.tabs.map(({ url, pinned }) => ({ url, pinned })),
        ),
    );
    if (key === this.sessionKey) return;
    this.sessionKey = key;
    clearTimeout(this.sessionTimer);
    if (!this.state.private)
      this.sessionTimer = setTimeout(() => void this.persistSession(), 250);
  }
  queueEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined;
      this.emit();
    }, 200);
  }
  async persistSession() {
    if (this.state.private) return;
    const snapshot = [...browsers]
      .filter((b) => !b.state.private)
      .flatMap((b) => b.state.tabs.map(({ url, pinned }) => ({ url, pinned })));
    if (snapshot.length) await this.persist("last-session", snapshot);
  }
  active() {
    return this.state.tabs.find((t) => t.id === this.state.activeId)!;
  }
  activeContents() {
    return this.views.get(this.state.activeId)?.webContents;
  }
  newTab(url = "piccolo://newtab", background = false, pinned = false) {
    if (this.state.tabs.length >= 100)
      throw Error("This window is limited to 100 tabs.");
    if (!internal(url) && !webURL(url)) throw Error("Unsupported tab address.");
    const tab: Tab = {
      id: randomUUID(),
      url,
      title: internal(url) ? url.split("://")[1] : "Loading…",
      favicon: "",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      pinned,
      audible: false,
      discarded: false,
      error: "",
      zoom: 1,
      lastActive: Date.now(),
    };
    if (pinned)
      this.state.tabs.splice(
        this.state.tabs.filter((t) => t.pinned).length,
        0,
        tab,
      );
    else this.state.tabs.push(tab);
    if (!background) this.activate(tab.id);
    this.emit();
    return tab;
  }
  destroyView(id: string) {
    if (id === this.state.activeId) this.htmlFullscreen = false;
    const v = this.views.get(id);
    if (!v) return;
    this.win.contentView.removeChildView(v);
    if (!v.webContents.isDestroyed()) {
      this.mediaTabs.delete(v.webContents.id);
      v.webContents.close();
    }
    this.views.delete(id);
  }
  createView(tab: Tab) {
    if (internal(tab.url)) return;
    const view = new WebContentsView({
      webPreferences: {
        session: this.ses,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: true,
        allowRunningInsecureContent: false,
      },
    });
    this.views.set(tab.id, view);
    this.win.contentView.addChildView(view);
    const wc = view.webContents;
    const update = () => {
      if (wc.isDestroyed()) return;
      tab.url = wc.getURL() || tab.url;
      tab.title = wc.getTitle() || tab.url;
      tab.loading = wc.isLoading();
      tab.canGoBack = wc.navigationHistory.canGoBack();
      tab.canGoForward = wc.navigationHistory.canGoForward();
      tab.audible = wc.isCurrentlyAudible();
      this.queueEmit();
    };
    wc.on("did-start-loading", update);
    wc.on("did-stop-loading", update);
    wc.on("page-title-updated", update);
    wc.on("audio-state-changed", update);
    wc.on("did-navigate-in-page", update);
    wc.on("page-favicon-updated", (_e, icons) => {
      if (this.state.private) return;
      const icon = icons.find((url) => {
        try {
          return webURL(url) && new URL(url).origin === new URL(tab.url).origin;
        } catch {
          return false;
        }
      });
      if (!icon) return;
      void (async () => {
        try {
          let data = this.faviconCache.get(icon);
          if (!data) {
            const response = await this.ses.fetch(icon, {
              redirect: "error",
              credentials: "omit",
              signal: AbortSignal.timeout(3000),
            });
            const type =
              response.headers.get("content-type")?.split(";")[0] || "";
            if (
              !response.ok ||
              ![
                "image/png",
                "image/x-icon",
                "image/vnd.microsoft.icon",
                "image/webp",
                "image/jpeg",
              ].includes(type)
            ) {
              await response.body?.cancel();
              return;
            }
            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.length;
                if (size > 32768) return;
                chunks.push(chunk.value);
              }
            } finally {
              await reader.cancel();
            }
            data = `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
            this.faviconCache.set(icon, data);
            if (this.faviconCache.size > 32)
              this.faviconCache.delete(this.faviconCache.keys().next().value!);
          }
          if (this.views.get(tab.id) === view) {
            tab.favicon = data;
            this.queueEmit();
          }
        } catch {}
      })();
    });
    wc.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) {
        tab.error = "";
        this.bounds();
      }
    });
    wc.on("did-finish-load", () => {
      update();
      if (!tab.error && !this.state.private && webURL(tab.url))
        void this.store.call("visit", tab.url, tab.title).catch(console.error);
    });
    wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        tab.loading = false;
        tab.error = `${description} (${code})`;
        tab.url = url || tab.url;
        this.bounds();
        this.emit();
      }
    });
    wc.on("render-process-gone", (_e, details) => {
      tab.error = `This tab stopped (${details.reason}). Reload to recover.`;
      tab.loading = false;
      if (tab.id === this.state.activeId) this.htmlFullscreen = false;
      this.emit();
      this.bounds();
    });
    const guard = (e: Electron.Event, url: string) => {
      if (!webURL(url)) {
        e.preventDefault();
        void this.external(url);
      }
    };
    wc.on("will-navigate", guard);
    wc.on("will-redirect", guard);
    wc.on("will-frame-navigate", (e) => {
      if (!webURL(e.url) && e.url !== "about:blank") e.preventDefault();
    });
    let gestureAt = 0;
    wc.on("before-mouse-event", (_e, mouse) => {
      if (mouse.type === "mouseDown") {
        gestureAt = Date.now();
        this.lastInteraction = gestureAt;
      }
    });
    wc.on("before-input-event", (_e, input) => {
      if (input.type === "keyDown") {
        gestureAt = Date.now();
        this.lastInteraction = gestureAt;
      }
    });
    wc.setWindowOpenHandler((details) => {
      if (
        !webURL(details.url) ||
        Date.now() - gestureAt > 1500 ||
        this.state.tabs.length >= 100 ||
        browsers.size >= 12 ||
        details.postBody
      )
        return { action: "deny" };
      gestureAt = 0;
      if (details.disposition === "new-window") {
        const popup = new Browser(
          this.store,
          this.state.settings,
          this.state.bookmarks,
          this.state.downloads,
          this.state.permissions,
          this.state.private,
          [{ url: details.url }],
        );
        const popupContents = popup.activeContents();
        if (popupContents) setDownloadOpener(popupContents, wc.getURL());
      } else {
        const popup = this.newTab(
            details.url,
            details.disposition === "background-tab",
          ),
          popupContents = this.views.get(popup.id)?.webContents;
        if (popupContents) setDownloadOpener(popupContents, wc.getURL());
      }
      return { action: "deny" };
    });
    wc.on("context-menu", (_e, p) => {
      const items: Electron.MenuItemConstructorOptions[] = [];
      if (webURL(p.linkURL)) {
        items.push(
          {
            label: "Open link in new tab",
            click: () => this.newTab(p.linkURL, true),
          },
          {
            label: "Open link in new window",
            click: () =>
              new Browser(
                this.store,
                this.state.settings,
                this.state.bookmarks,
                this.state.downloads,
                this.state.permissions,
                this.state.private,
                [{ url: p.linkURL }],
              ),
          },
          { label: "Copy link", click: () => clipboard.writeText(p.linkURL) },
          { type: "separator" },
        );
      }
      items.push(
        { role: "copy", enabled: !!p.selectionText },
        { role: "paste", enabled: p.isEditable },
        { type: "separator" },
        {
          label: "Back",
          enabled: tab.canGoBack,
          click: () => wc.navigationHistory.goBack(),
        },
        { label: "Reload", click: () => wc.reload() },
        {
          label: "Copy page address",
          click: () => clipboard.writeText(tab.url),
        },
        { label: "Inspect", click: () => wc.inspectElement(p.x, p.y) },
      );
      Menu.buildFromTemplate(items).popup({ window: this.win });
    });
    wc.on("before-input-event", (e, input) => this.shortcut(e, input));
    wc.on("found-in-page", (_e, result) =>
      this.win.webContents.send("piccolo:find", result),
    );
    wc.on("enter-html-full-screen", () => {
      this.htmlFullscreen = true;
      this.bounds();
    });
    wc.on("leave-html-full-screen", () => {
      this.htmlFullscreen = false;
      this.bounds();
    });
    tab.discarded = false;
    this.load(tab, wc, tab.url);
    wc.setZoomFactor(tab.zoom);
  }
  load(tab: Tab, wc: Electron.WebContents, url: string) {
    tab.loading = true;
    void wc
      .loadURL(url)
      .catch((error: Error & { code?: string; errno?: number }) => {
        if (
          error.code === "ERR_ABORTED" ||
          error.errno === -3 ||
          this.views.get(tab.id)?.webContents !== wc ||
          tab.url !== url
        )
          return;
        tab.error = error.message;
        tab.loading = false;
        this.bounds();
        this.emit();
      });
  }
  railWidth() {
    return this.state.settings.sidebarMode === "off"
      ? 0
      : this.state.settings.sidebarMode === "auto" && !this.state.sidebarOpen
        ? 4
        : this.state.settings.sidebarWidth;
  }
  bounds() {
    if (this.win.isDestroyed()) return;
    const [width, height] = this.win.getContentSize();
    for (const [id, v] of this.views) {
      const active =
        id === this.state.activeId && !this.overlay && !this.active()?.error;
      v.setVisible(active);
      if (active) {
        const top = this.htmlFullscreen
          ? 0
          : 94 +
            (this.state.settings.bookmarksBar ? 28 : 0) +
            (this.state.agentTask ? 34 : 0) +
            (this.findOpen ? 42 : 0);
        v.setBounds({
          x: this.htmlFullscreen ? 0 : this.railWidth(),
          y: top,
          width: Math.max(
            1,
            width - (this.htmlFullscreen ? 0 : this.railWidth()),
          ),
          height: Math.max(1, height - top),
        });
      }
    }
    require.cache[path.join(__dirname,'coding.cjs')]?.exports.syncBounds(this);
  }
  activate(id: string) {
    this.htmlFullscreen = false;
    const tab = this.state.tabs.find((t) => t.id === id);
    if (!tab) return;
    this.state.activeId = id;
    tab.lastActive = Date.now();
    this.overlay = false;
    this.findOpen = false;
    if (!internal(tab.url) && !this.views.has(id)) this.createView(tab);
    const v = this.views.get(id);
    if (v) {
      this.win.contentView.addChildView(v);
      v.webContents.focus();
    }
    this.bounds();
    this.emit();
    if (
      this.active().url === "piccolo://newtab" &&
      this.state.settings.dailyWallpaper
    )
      void require(path.join(__dirname, "optional.cjs")).checkDaily(this);
  }
  navigate(input: string) {
    const tab = this.active();
    const url = destination(
      input,
      this.state.settings.searchEngine,
      this.state.settings.searchEngines,
    );
    if(tab.url==='piccolo://workspaces'&&url!=='piccolo://workspaces'&&require.cache[path.join(__dirname,'coding.cjs')]?.exports.ownsWorkspace(this)){this.newTab(url);return;}
    tab.error = "";
    if (internal(url)) {
      this.destroyView(tab.id);
      tab.url = url;
      tab.title = url.split("://")[1];
      tab.favicon = "";
      tab.loading = false;
      tab.canGoBack = false;
      tab.canGoForward = false;
    } else {
      tab.url = url;
      const wc = this.activeContents();
      if (wc) this.load(tab, wc, url);
      else this.createView(tab);
    }
    this.overlay = false;
    this.bounds();
    this.emit();
    if (tab.url === "piccolo://newtab" && this.state.settings.dailyWallpaper)
      void require(path.join(__dirname, "optional.cjs")).checkDaily(this);
  }
  async external(url: string) {
    if (
      this.promptPending ||
      Date.now() - this.lastExternal < 5000 ||
      Date.now() - this.lastInteraction > 1500
    )
      return;
    this.lastInteraction = 0;
    this.lastExternal = Date.now();
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      return;
    }
    if (!["mailto:", "tel:"].includes(protocol) || url.length > 2048) return;
    this.promptPending = true;
    const { response } = await dialog.showMessageBox(this.win, {
      message: "Open an external application?",
      detail: url,
      buttons: ["Cancel", "Open"],
      defaultId: 0,
      cancelId: 0,
    });
    this.promptPending = false;
    if (response === 1) await shell.openExternal(url);
  }
  closeTab(id: string) {
    const coding=require.cache[path.join(__dirname,'coding.cjs')]?.exports;
    if(this.state.tabs.find(t=>t.id===id)?.url==='piccolo://workspaces'&&this.state.tabs.filter(t=>t.url==='piccolo://workspaces').length===1&&coding?.ownsWorkspace(this)){void coding.closeWorkspace(this).then((closed:boolean)=>{if(closed)this.closeTab(id);});return;}
    const index = this.state.tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const [tab] = this.state.tabs.splice(index, 1);
    this.closed.unshift({ ...tab });
    this.closed = this.closed.slice(0, 20);
    this.destroyView(id);
    if (!this.state.tabs.length) this.newTab();
    else if (id === this.state.activeId)
      this.activate(
        this.state.tabs[Math.min(index, this.state.tabs.length - 1)].id,
      );
    this.emit();
  }
  discard(tab: Tab, ownTask = false) {
    const wc = this.views.get(tab.id)?.webContents;
    if (
      this.agentTasks > (ownTask ? 1 : 0) ||
      tab.id === this.state.activeId ||
      tab.pinned ||
      tab.audible ||
      internal(tab.url) ||
      !wc ||
      wc.isLoading() ||
      wc.isBeingCaptured() ||
      this.mediaTabs.has(wc.id) ||
      this.state.downloads.some(
        (d) => liveDownload(d.status) && d.url === tab.url,
      ) ||
      this.state.downloads.some((d) => liveDownload(d.status))
    )
      return;
    this.destroyView(tab.id);
    tab.discarded = true;
    tab.loading = false;
    this.emit();
  }
  sleepInactive() {
    const { sleepMinutes, sleepExcluded } = this.state.settings;
    if (!sleepMinutes) return;
    for (const tab of this.state.tabs) {
      let host = "";
      try {
        host = new URL(tab.url).hostname;
      } catch {}
      if (
        !sleepExcluded.includes(host) &&
        Date.now() - tab.lastActive > sleepMinutes * 60000
      )
        this.discard(tab);
    }
  }
  shortcut(e: Electron.Event, input: Electron.Input) {
    if (input.type !== "keyDown") return;
    const key = input.key.toLowerCase(),
      mod = input.control || input.meta;
    let action: string | undefined;
    if (mod && key === "j") {
      e.preventDefault();
      const existing = this.state.tabs.find(
        (t) => t.url === "piccolo://downloads",
      );
      if (existing) this.activate(existing.id);
      else this.newTab("piccolo://downloads");
      return;
    }
    if (mod && input.shift && ["pageup", "pagedown"].includes(key)) {
      e.preventDefault();
      const i = this.state.tabs.findIndex((t) => t.id === this.state.activeId),
        j = i + (key === "pageup" ? -1 : 1);
      if (j >= 0 && j < this.state.tabs.length) {
        [this.state.tabs[i], this.state.tabs[j]] = [
          this.state.tabs[j],
          this.state.tabs[i],
        ];
        this.emit();
      }
      return;
    }
    if (mod && key === "l") {
      e.preventDefault();
      this.win.webContents.focus();
      this.win.webContents.send("piccolo:focus");
      return;
    }
    if (mod && key === "t" && this.state.tabs.length >= 100) {
      e.preventDefault();
      return;
    }
    if (mod && key === "t") action = input.shift ? "reopen" : "new-tab";
    else if (mod && key === "w") action = "close";
    else if (mod && key === "r") action = "reload";
    else if (mod && key === "f") {
      e.preventDefault();
      this.findOpen = true;
      this.win.webContents.send("piccolo:focus-find");
      this.win.webContents.focus();
      this.bounds();
      return;
    } else if (mod && key === "n") action = input.shift ? "private" : "window";
    else if (key === "f11") action = "fullscreen";
    else if (key === "f12" || (mod && input.shift && key === "i"))
      action = "devtools";
    else if (mod && key === "p") action = "print";
    else if (mod && key === "s") action = "save-page";
    else if (mod && ["+", "=", "-", "0"].includes(key))
      action =
        key === "-" ? "zoom-out" : key === "0" ? "zoom-reset" : "zoom-in";
    else if (input.alt && key === "arrowleft") action = "back";
    else if (input.alt && key === "arrowright") action = "forward";
    else if (mod && key === "tab") {
      e.preventDefault();
      const i = this.state.tabs.findIndex((t) => t.id === this.state.activeId);
      this.activate(
        this.state.tabs[
          (i + (input.shift ? -1 : 1) + this.state.tabs.length) %
            this.state.tabs.length
        ].id,
      );
      return;
    }
    if (action) {
      e.preventDefault();
      if (action === "new-tab") {
        this.newTab();
        this.win.webContents.send("piccolo:focus");
      } else if (action === "close") this.closeTab(this.state.activeId);
      else
        void this.command({ type: "action", action: action as any }).catch(
          console.error,
        );
    }
  }
  async command(c: Command): Promise<unknown> {
    const tab = this.active(),
      wc = this.activeContents();
    switch (c.type) {
      case 'agent': return require(path.join(__dirname,'agent.cjs')).handleAgent(this,c.action,c.value);
      case 'workspace':
        return require(path.join(__dirname,'coding.cjs')).handleWorkspace(this,c.action,c.value);
      case "sidebar":
        this.state.sidebarOpen = c.open;
        break;
      case "optional": {
        if (this.state.private)
          throw Error("Configure optional services in a normal window.");
        const service = require(path.join(__dirname, "optional.cjs"));
        return service.handleOptional(this, c);
      }
      case "navigate":
        this.navigate(c.input);
        break;
      case "new-tab":
        this.newTab(
          c.url
            ? destination(
                c.url,
                this.state.settings.searchEngine,
                this.state.settings.searchEngines,
              )
            : undefined,
          c.background,
        );
        break;
      case "tab":
        if (c.action === "activate") this.activate(c.id);
        else if (c.action === "close") this.closeTab(c.id);
        else {
          const t = this.state.tabs.find((t) => t.id === c.id);
          if (!t) break;
          if (c.action === "duplicate") this.newTab(t.url);
          if (c.action === "pin") {
            t.pinned = !t.pinned;
            this.state.tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned));
          }
          if (c.action === "discard") this.discard(t);
        }
        break;
      case "reorder": {
        const a = this.state.tabs.findIndex((t) => t.id === c.id),
          b = this.state.tabs.findIndex((t) => t.id === c.before);
        if (
          a >= 0 &&
          b >= 0 &&
          this.state.tabs[a].pinned === this.state.tabs[b].pinned
        ) {
          const [t] = this.state.tabs.splice(a, 1);
          this.state.tabs.splice(b, 0, t);
        }
        break;
      }
      case "action":
        switch (c.action) {
          case "quit":
            app.quit();
            break;
          case "chrome-devtools":
            this.win.webContents.openDevTools({ mode: "detach" });
            break;
          case "print":
            if (!wc) throw Error("Open a website to print.");
            wc.print({ silent: false }, (success, reason) => {
              if (!success) console.info("Print:", reason);
            });
            break;
          case "save-page": {
            if (!wc) throw Error("Open a website to save.");
            const { filePath } = await dialog.showSaveDialog(this.win, {
              defaultPath: "page.mhtml",
              filters: [{ name: "Web archive", extensions: ["mhtml"] }],
            });
            if (filePath) await wc.savePage(filePath, "MHTML");
            break;
          }
          case "home":
            this.navigate("piccolo://newtab");
            break;
          case "reopen": {
            const t = this.closed.shift();
            if (t) this.newTab(t.url, false, t.pinned);
            break;
          }
          case "private":
          case "window":
            if (browsers.size >= 12) throw Error("The window limit is 12.");
            new Browser(
              this.store,
              this.state.settings,
              this.state.bookmarks,
              this.state.downloads,
              this.state.permissions,
              c.action === "private",
            );
            break;
          case "back":
            if (wc?.navigationHistory.canGoBack())
              wc.navigationHistory.goBack();
            break;
          case "forward":
            if (wc?.navigationHistory.canGoForward())
              wc.navigationHistory.goForward();
            break;
          case "reload":
            if (wc && !wc.isDestroyed()) {
              tab.error = "";
              wc.reload();
            } else if (!internal(tab.url)) {
              this.destroyView(tab.id);
              this.createView(tab);
            }
            break;
          case "stop":
            wc?.stop();
            break;
          case "fullscreen":
            this.win.setFullScreen(!this.win.isFullScreen());
            break;
          case "devtools":
            if (!wc)
              throw Error(
                "Open a website to inspect. Browser chrome debugging is separate.",
              );
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else wc.openDevTools({ mode: "detach" });
            break;
          case "copy-url":
            clipboard.writeText(tab.url);
            break;
          default:
            tab.zoom =
              c.action === "zoom-reset"
                ? 1
                : Math.max(
                    0.25,
                    Math.min(
                      3,
                      tab.zoom + (c.action === "zoom-in" ? 0.1 : -0.1),
                    ),
                  );
            wc?.setZoomFactor(tab.zoom);
        }
        break;
      case "overlay":
        this.overlay = c.open;
        this.bounds();
        break;
      case "find":
        this.findOpen = !c.close;
        if (c.text)
          wc?.findInPage(c.text, { forward: c.forward, findNext: c.next });
        else wc?.stopFindInPage("clearSelection");
        this.bounds();
        break;
      case "history":
        return this.state.private ? [] : this.store.call("history", c.query);
      case "history-delete":
        if (!this.state.private) await this.store.call("delete", c.id);
        break;
      case "clear":
        if (c.target === "history") {
          if (!this.state.private) await this.store.call("clear", c.since);
        } else if (c.target === "cache") await this.ses.clearCache();
        else {
          await this.ses.clearStorageData();
          await this.ses.clearAuthCache();
        }
        break;
      case "settings":
        await this.setSettings({
          ...c.value,
          dailyWallpaper: this.state.settings.dailyWallpaper,
          downloadDirectory: this.state.settings.downloadDirectory,
          mcpEnabled: this.state.settings.mcpEnabled,
          mcpTrusted: false,
        });
        break;
      case "settings-file":
        if (c.action === "reset")
          await this.setSettings(settingsSchema.parse({}));
        else if (c.action === "export") {
          const { filePath } = await dialog.showSaveDialog(this.win, {
            defaultPath: "piccolo-settings.json",
          });
          if (filePath)
            await writeFile(
              filePath,
              JSON.stringify(
                { version: 1, settings: this.state.settings },
                null,
                2,
              ),
            );
        } else {
          const { filePaths } = await dialog.showOpenDialog(this.win, {
            filters: [{ name: "Settings", extensions: ["json"] }],
          });
          if (filePaths[0]) {
            const raw = await readFile(filePaths[0], "utf8");
            if (raw.length > 200000) throw Error("Settings file is too large.");
            const data = JSON.parse(raw);
            if (data.version !== 1)
              throw Error("Unsupported settings version.");
            const imported = settingsSchema.parse(data.settings);
            await this.setSettings({
              ...imported,
              dailyWallpaper: this.state.settings.dailyWallpaper,
              downloadDirectory: this.state.settings.downloadDirectory,
              mcpEnabled: this.state.settings.mcpEnabled,
              mcpTrusted: false,
              wallpaper: {
                ...imported.wallpaper,
                asset: this.state.settings.wallpaper.asset,
              },
            });
          }
        }
        break;
      case "wallpaper": {
        const { filePaths } = await dialog.showOpenDialog(this.win, {
          filters: [
            {
              name: c.kind,
              extensions:
                c.kind === "image"
                  ? ["png", "jpg", "jpeg", "webp"]
                  : ["mp4", "webm"],
            },
          ],
        });
        if (filePaths[0]) {
          const name = `${randomUUID()}${path.extname(filePaths[0]).toLowerCase()}`;
          await mkdir(path.join(app.getPath("userData"), "wallpapers"), {
            recursive: true,
          });
          await copyFile(
            filePaths[0],
            path.join(app.getPath("userData"), "wallpapers", name),
          );
          await this.setSettings({
            ...this.state.settings,
            wallpaper: {
              ...this.state.settings.wallpaper,
              kind: c.kind,
              asset: name,
            },
          });
        }
        break;
      }
      case "bookmark": {
        const value = c.value;
        if (c.action === "delete")
          this.state.bookmarks = this.state.bookmarks.filter(
            (b) => b.id !== value.id,
          );
        else {
          if (!webURL(value.url))
            throw Error("Bookmarks require an HTTP or HTTPS address.");
          const existing = this.state.bookmarks.find(
            (b) => b.id === value.id || b.url === value.url,
          );
          const bookmark = {
            ...value,
            id: existing?.id || randomUUID(),
            position: value.position ?? this.state.bookmarks.length,
          };
          if (existing) Object.assign(existing, bookmark);
          else this.state.bookmarks.push(bookmark);
        }
        await this.persist("bookmarks", this.state.bookmarks);
        break;
      }
      case "bookmarks-file":
        await this.bookmarksFile(c.action);
        break;
      case "download": {
        const d = this.state.downloads.find((d) => d.id === c.id);
        if (!d) throw Error("Download not found");

        if (c.action === "retry") {
          if (!webURL(d.url)) throw Error("Invalid download URL");
          const pending =
            retryRequests.get(this.ses) || new Map<string, Browser[]>();
          retryRequests.set(this.ses, pending);
          pending.set(d.url, [...(pending.get(d.url) || []), this]);
          const timeout = setTimeout(() => {
            const queue = pending.get(d.url)?.filter((b) => b !== this);
            if (queue?.length) pending.set(d.url, queue);
            else pending.delete(d.url);
          }, 15000);
          timeout.unref();
          this.ses.downloadURL(d.url);
          break;
        }
        if (
          ["approve", "cancel", "pause", "resume", "remove"].includes(c.action)
        ) {
          await downloadAction(this, c.id, c.action);
          break;
        }
        if (c.action === "reveal") {
          if (d.status !== "completed" || !existsSync(d.path))
            throw Error("The download is incomplete or missing.");
          shell.showItemInFolder(d.path);
        }
        if (c.action === "open") {
          if (d.status !== "completed" || !existsSync(d.path))
            throw Error("The download is incomplete or missing.");
          const { response } = await dialog.showMessageBox(this.win, {
            message: `Open ${d.name}?`,
            detail: "Only open files you trust.",
            buttons: ["Cancel", "Open"],
            defaultId: 0,
          });
          if (response === 1) {
            const error = await shell.openPath(d.path);
            if (error) throw Error(error);
          }
        }
        break;
      }
      case "downloads-clear": {
        this.state.downloads = this.state.downloads.filter((d) =>
          liveDownload(d.status),
        );
        await this.persist("downloads", this.state.downloads);
        break;
      }
      case "download-multiple": {
        const origin = new URL(c.origin).origin;
        if (!["http:", "https:"].includes(new URL(origin).protocol))
          throw Error("An HTTP(S) initiating origin is required.");
        const { response } = await dialog.showMessageBox(this.win, {
          type: "warning",
          message: "Allow multiple download requests from this site?",
          detail:
            origin +
            "\nEach file still requires approval. This only permits up to four pending requests; flood limits still apply. Revoke this in Site permissions.",
          buttons: ["Cancel", "Allow multiple requests"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response === 1) {
          this.state.permissions = this.state.permissions.filter(
            (p) =>
              !(p.origin === origin && p.permission === "automatic-downloads"),
          );
          this.state.permissions.push({
            origin,
            permission: "automatic-downloads",
            decision: "allow",
          });
          await this.persist("permissions", this.state.permissions);
        }
        break;
      }
      case "download-directory": {
        const { filePaths } = await dialog.showOpenDialog(this.win, {
          properties: ["openDirectory"],
        });
        if (filePaths[0])
          await this.setSettings({
            ...this.state.settings,
            downloadDirectory: filePaths[0],
          });
        break;
      }
      case "permission-delete":
        this.state.permissions = this.state.permissions.filter(
          (p) => p.origin !== c.origin || p.permission !== c.permission,
        );
        await this.persist("permissions", this.state.permissions);
        break;
      case "metrics":
        return {
          approvedTasks: this.agentTasks,
          processes: app.getAppMetrics(),
          tabs: this.state.tabs.map((t) => ({
            id: t.id,
            title: t.title,
            discarded: t.discarded,
            pid: this.views.get(t.id)?.webContents.getOSProcessId(),
          })),
          optionalLoaded: {
            mcp: !!require.cache[path.join(__dirname, "mcp.cjs")],
            services: !!require.cache[path.join(__dirname, "optional.cjs")],
          },
          webContents: require("electron")
            .webContents.getAllWebContents()
            .map((w: Electron.WebContents) => ({
              id: w.id,
              type: w.getType(),
              pid: w.getOSProcessId(),
            })),
          versions: process.versions,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        };
    }
    this.bounds();
    this.emit();
    return null;
  }
  async setSettings(settings: Settings) {
    const priorMcp = this.state.settings.mcpEnabled;
    const previous = this.state.settings;
    this.state.settings = settingsSchema.parse(settings);
    if (!this.state.private && priorMcp !== this.state.settings.mcpEnabled) {
      const mcp = require(path.join(__dirname, "mcp.cjs"));
      try {
        if (this.state.settings.mcpEnabled) await mcp.startMcp(this);
        else await mcp.stopMcp();
      } catch (error) {
        this.state.settings = previous;
        this.emit();
        throw error;
      }
    }
    await this.persist("settings", this.state.settings);
    if (!this.state.private)
      for (const b of browsers)
        if (b !== this && !b.state.private) {
          b.state.settings = structuredClone(this.state.settings);
          b.updateAppearance();
          b.bounds();
          b.emit();
        }
    this.bounds();
    this.updateAppearance();
    this.emit();
  }
  async bookmarksFile(action: "import" | "export") {
    if (action === "export") {
      const { filePath } = await dialog.showSaveDialog(this.win, {
        defaultPath: "piccolo-bookmarks.html",
      });
      if (filePath)
        await writeFile(
          filePath,
          exportBookmarks(
            [...this.state.bookmarks].sort((a, b) => a.position - b.position),
          ),
        );
    } else {
      const { filePaths } = await dialog.showOpenDialog(this.win, {
        filters: [{ name: "Bookmarks HTML", extensions: ["html", "htm"] }],
      });
      if (!filePaths[0]) return;
      const html = await readFile(filePaths[0], "utf8");
      const parsed = parseBookmarks(html);
      for (const b of parsed) {
        if (this.state.bookmarks.length >= 10000) break;
        if (!this.state.bookmarks.some((x) => x.url === b.url))
          this.state.bookmarks.push({
            ...b,
            id: randomUUID(),
            position: this.state.bookmarks.length,
          });
      }
      await this.persist("bookmarks", this.state.bookmarks);
    }
  }
}
