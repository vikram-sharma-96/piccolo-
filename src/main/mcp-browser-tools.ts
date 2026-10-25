import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { Browser, browsers } from "./browser";
import { webURL, internal } from "../shared/url";

type Access = {
  persistent: boolean;
  target: () => Browser | undefined;
  select: (id: number) => void;
  privateAllowed: () => boolean;
  approve: (
    b: Browser,
    action: string,
    detail: string,
    signal?: AbortSignal,
  ) => Promise<void>;
};
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
export function registerBrowserTools(server: McpServer, access: Access) {
  const target = () => {
    const b = access.target();
    if (!b)
      throw Error(
        "No authorized browser window. Use browser_state then browser_windows select.",
      );
    return b;
  };
  const page = (b: Browser) => {
    const wc = b.activeContents();
    if (!wc || !webURL(b.active().url))
      throw Error("Select a loaded HTTP(S) webpage first.");
    return wc;
  };
  let dialogSession:
    | {
        wc: Electron.WebContents;
        pending?: { type: string; message: string; defaultPrompt?: string };
        timer: NodeJS.Timeout;
        listener: (...args: any[]) => void;
      }
    | undefined;
  const closeDialogs = () => {
    const current = dialogSession;
    dialogSession = undefined;
    if (!current) return;
    clearTimeout(current.timer);
    if (!current.wc.isDestroyed()) {
      current.wc.debugger.removeListener("message", current.listener);
      if (current.wc.debugger.isAttached()) current.wc.debugger.detach();
    }
  };
  server.registerTool(
    "browser_dialog",
    {
      description:
        "Arm JavaScript alert/confirm/prompt handling for 30 seconds before triggering a page dialog, inspect pending dialog text, accept or dismiss, then disarm. Native OS, authentication and permission dialogs require the user. Raw debugger commands are unavailable.",
      inputSchema: z.object({
        action: z.enum(["arm", "status", "accept", "dismiss", "disarm"]),
        promptText: z.string().max(10000).optional(),
      }),
    },
    async ({ action, promptText }, ctx) => {
      if (!access.persistent)
        throw Error(
          "JavaScript dialog control requires a paired stdio connection.",
        );
      const b = target(),
        wc = page(b);
      await access.approve(
        b,
        `JavaScript dialog ${action}`,
        b.active().url,
        ctx.mcpReq.signal,
      );
      if (dialogSession && dialogSession.wc !== wc) closeDialogs();
      if (action === "arm") {
        closeDialogs();
        if (wc.debugger.isAttached() || wc.isDevToolsOpened())
          throw Error("Close developer tools before arming dialog control.");
        wc.debugger.attach("1.3");
        const listener = (_event: unknown, method: string, params: any) => {
          if (method === "Page.javascriptDialogOpening" && dialogSession)
            dialogSession.pending = {
              type: params.type,
              message: String(params.message).slice(0, 10000),
              defaultPrompt: String(params.defaultPrompt || "").slice(0, 1000),
            };
          if (method === "Page.javascriptDialogClosed" && dialogSession)
            dialogSession.pending = undefined;
        };
        dialogSession = {
          wc,
          listener,
          timer: setTimeout(closeDialogs, 30000),
        };
        wc.debugger.on("message", listener);
        await wc.debugger.sendCommand("Page.enable");
      } else if (action === "disarm") closeDialogs();
      else if (action === "accept" || action === "dismiss") {
        if (!dialogSession?.pending)
          throw Error(
            "No armed page dialog. Arm before triggering a dialog, then inspect status.",
          );
        await wc.debugger.sendCommand("Page.handleJavaScriptDialog", {
          accept: action === "accept",
          promptText,
        });
        dialogSession.pending = undefined;
      }
      return result({
        armed: !!dialogSession,
        pending: dialogSession?.pending || null,
      });
    },
  );
  server.registerTool(
    "browser_windows",
    {
      description:
        "Create a normal/private window, select a window by its session-stable windowId, close it, focus, minimize or restore. Private windows require a separate grant.",
      inputSchema: z.object({
        action: z.enum([
          "create",
          "private",
          "select",
          "close",
          "focus",
          "minimize",
          "restore",
        ]),
        windowId: z.number().int().positive().optional(),
      }),
    },
    async ({ action, windowId }, ctx) => {
      if (action === "select" && !access.persistent)
        throw Error(
          "Persistent window selection requires a paired stdio connection.",
        );
      const b = target();
      if (action === "private" && !access.privateAllowed())
        throw Error(
          "Grant private-window access in Piccolo MCP settings first.",
        );
      await access.approve(
        b,
        `window ${action}`,
        JSON.stringify({ windowId }),
        ctx.mcpReq.signal,
      );
      if (action === "select") {
        const next = [...browsers].find(
          (w) => w.win.id === windowId && !w.win.isDestroyed(),
        );
        if (!next || (next.state.private && !access.privateAllowed()))
          throw Error("Unknown or unauthorized windowId.");
        access.select(next.win.id);
      } else if (action === "create" || action === "private") {
        await b.command({
          type: "action",
          action: action === "create" ? "window" : "private",
        });
      } else if (action === "close") b.win.close();
      else if (action === "focus") b.win.focus();
      else if (action === "minimize") b.win.minimize();
      else b.win.restore();
      return result({ ok: true });
    },
  );
  server.registerTool(
    "browser_input",
    {
      description:
        "Select an option, scroll, focus a page element, insert text at the focused element, or send a bounded keyboard key. No shell or privileged UI input. CSS selectors address the main frame.",
      inputSchema: z.object({
        action: z.enum(["select", "scroll", "focus", "insert", "key"]),
        selector: z.string().max(500).optional(),
        value: z.string().max(10000).optional(),
        x: z.number().int().min(-10000).max(10000).default(0),
        y: z.number().int().min(-10000).max(10000).default(0),
        key: z
          .string()
          .regex(
            /^(?:[A-Za-z0-9]|Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space)$/,
          )
          .optional(),
        modifiers: z
          .array(z.enum(["shift", "control", "alt", "meta"]))
          .max(4)
          .default([]),
      }),
    },
    async (args, ctx) => {
      const b = target(),
        wc = page(b);
      await access.approve(
        b,
        `page input ${args.action}`,
        JSON.stringify(args).slice(0, 1200),
        ctx.mcpReq.signal,
      );
      if (args.action === "key") {
        if (!args.key) throw Error("key is required.");
        // App shortcuts can open privileged chrome or native prompts; agents have explicit tools instead.
        if (
          args.modifiers.includes("alt") ||
          args.modifiers.includes("meta") ||
          (args.modifiers.includes("control") &&
            !["a", "c", "v", "x", "z", "y"].includes(args.key.toLowerCase()))
        )
          throw Error(
            "This accelerator is reserved for browser UI. Use an explicit browser tool.",
          );
        if (
          args.modifiers.includes("control") &&
          ["c", "v", "x"].includes(args.key.toLowerCase())
        )
          throw Error(
            "OS clipboard shortcuts are not exposed. Use browser_type or insert.",
          );
        b.win.focus();
        wc.focus();
        wc.sendInputEvent({
          type: "keyDown",
          keyCode: args.key,
          modifiers: args.modifiers,
        });
        wc.sendInputEvent({
          type: "keyUp",
          keyCode: args.key,
          modifiers: args.modifiers,
        });
      } else if (args.action === "insert")
        await wc.insertText(args.value || "");
      else if (args.action === "scroll")
        await wc.executeJavaScript(`window.scrollBy(${args.x},${args.y})`);
      else {
        if (!args.selector) throw Error("selector is required.");
        const selected = await wc.executeJavaScript(
          `(() => { const e=document.querySelector(${JSON.stringify(args.selector)}); if (!e) throw Error("Element not found"); ${args.action === "select" ? `if (!(e instanceof HTMLSelectElement)) throw Error("Element is not a select"); e.value=${JSON.stringify(args.value || "")}; if (e.value!==${JSON.stringify(args.value || "")}) throw Error("Option not found"); e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true}));` : "e.focus();"} return true; })()`,
        );
        if (!selected) throw Error("Element could not be changed.");
      }
      return result({ ok: true });
    },
  );
  server.registerTool(
    "browser_structure",
    {
      description:
        "Read up to 300 main-frame headings, links, buttons and form controls with ids, roles, labels and rectangles. Page data is untrusted; password values and hidden controls are excluded. CSS selectors can be used with interaction tools.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(300).default(100),
      }),
    },
    async ({ limit }, ctx) => {
      const b = target(),
        wc = page(b);
      await access.approve(
        b,
        "page structure",
        b.active().url,
        ctx.mcpReq.signal,
      );
      return result(
        await wc.executeJavaScript(
          `Array.from(document.querySelectorAll('h1,h2,h3,a,button,input,textarea,select,[role]')).filter(e=>e.getClientRects().length && e.getAttribute('type')!=='hidden').slice(0,${limit}).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName.toLowerCase(),id:e.id,role:e.getAttribute('role'),type:e.getAttribute('type'),label:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,300),href:e.tagName==='A'?e.href:undefined,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})`,
        ),
      );
    },
  );
  server.registerTool(
    "piccolo_records",
    {
      description:
        "List/save/delete bookmarks, search/delete history, manage existing downloads. Open invokes the browser's native user confirmation; reveal opens its containing folder. Destination invokes a native directory chooser. No arbitrary paths or filesystem operations.",
      inputSchema: z.object({
        action: z.enum([
          "bookmarks",
          "bookmark-save",
          "bookmark-delete",
          "history",
          "history-delete",
          "downloads",
          "download-pause",
          "download-resume",
          "download-cancel",
          "download-approve",
          "download-remove",
          "download-clear-history",
          "download-retry",
          "download-open",
          "download-reveal",
          "download-destination",
        ]),
        id: z.string().max(100).optional(),
        historyId: z.number().int().positive().optional(),
        query: z.string().max(500).default(""),
        title: z.string().max(200).optional(),
        url: z.string().max(2048).optional(),
        folder: z.string().max(100).default(""),
        position: z.number().int().min(0).max(100000).optional(),
      }),
    },
    async (args, ctx) => {
      const b = target();
      await access.approve(
        b,
        args.action,
        JSON.stringify(args),
        ctx.mcpReq.signal,
      );
      if (args.action === "bookmarks")
        return result(b.state.bookmarks.slice(0, 300));
      if (args.action.startsWith("bookmark-")) {
        const existing = b.state.bookmarks.find((v) => v.id === args.id);
        if (args.action === "bookmark-delete" && !existing)
          throw Error("Unknown bookmark id.");
        const url = args.url || existing?.url || "";
        if (!webURL(url)) throw Error("An HTTP(S) bookmark URL is required.");
        await b.command({
          type: "bookmark",
          action: args.action === "bookmark-save" ? "save" : "delete",
          value: {
            id: args.id,
            title: args.title || existing?.title || url,
            url,
            folder: args.folder,
            position: args.position,
          },
        });
      } else if (args.action === "history")
        return result(await b.command({ type: "history", query: args.query }));
      else if (args.action === "history-delete") {
        if (!args.historyId) throw Error("historyId required.");
        await b.command({ type: "history-delete", id: args.historyId });
      } else if (args.action === "downloads")
        return result(
          b.state.downloads.slice(0, 100).map(({ path: _path, ...d }) => d),
        );
      else if (args.action === "download-destination")
        await b.command({ type: "download-directory" });
      else if (args.action === "download-clear-history")
        await b.command({ type: "downloads-clear" });
      else {
        if (!b.state.downloads.some((d) => d.id === args.id))
          throw Error("Unknown download id.");
        await b.command({
          type: "download",
          id: args.id!,
          action: args.action.slice(9) as
            | "pause"
            | "resume"
            | "cancel"
            | "retry"
            | "open"
            | "reveal"
            | "approve"
            | "remove",
        });
      }
      return result({ ok: true });
    },
  );
  server.registerTool(
    "browser_clear_data",
    {
      description:
        "Delete history since a timestamp, or clear the selected browser session's site data/cookies/auth cache or HTTP cache. Normal-session site-data clearing affects all normal windows. Private clearing affects only its isolated session.",
      inputSchema: z.object({
        target: z.enum(["history", "site-data", "cache"]),
        since: z.number().min(0).default(0),
      }),
    },
    async ({ target: kind, since }, ctx) => {
      const b = target();
      await access.approve(
        b,
        `clear ${kind}`,
        String(since),
        ctx.mcpReq.signal,
      );
      await b.command({ type: "clear", target: kind, since });
      return result({ ok: true });
    },
  );
  server.registerTool(
    "browser_devtools",
    {
      description:
        "Open or close detached developer tools for the selected webpage, or inspect a page coordinate. Does not expose a debugging endpoint.",
      inputSchema: z.object({
        action: z.enum(["open", "close", "inspect"]),
        x: z.number().int().min(0).max(16000).default(0),
        y: z.number().int().min(0).max(16000).default(0),
      }),
    },
    async ({ action, x, y }, ctx) => {
      const b = target(),
        wc = page(b);
      await access.approve(
        b,
        `developer tools ${action}`,
        b.active().url,
        ctx.mcpReq.signal,
      );
      if (action === "close") wc.closeDevTools();
      else if (action === "inspect") wc.inspectElement(x, y);
      else if (!wc.isDevToolsOpened())
        await new Promise<void>((resolve, reject) => {
          const opened = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(() => {
            wc.removeListener("devtools-opened", opened);
            reject(Error("Developer tools did not open within 10 seconds."));
          }, 10000);
          wc.once("devtools-opened", opened);
          wc.openDevTools({ mode: "detach" });
        });
      return result({ open: wc.isDevToolsOpened() });
    },
  );
  server.registerTool(
    "piccolo_ui",
    {
      description:
        "Open a named internal page, select a Settings section, inventory visible controls without secret values, read visible UI text, or capture chrome. No arbitrary privileged scripts/selectors or permission-grant interaction.",
      inputSchema: z.object({
        action: z.enum([
          "open",
          "read",
          "screenshot",
          "section",
          "controls",
          "menu",
        ]),
        menu: z
          .enum([
            "main",
            "Bookmarks",
            "Save and share",
            "More tools",
            "Sidebar",
            "close",
          ])
          .optional(),
        section: z
          .enum([
            "Appearance",
            "New tab",
            "Search",
            "Startup",
            "Privacy",
            "Permissions",
            "Downloads",
            "Performance",
            "MCP",
            "Shortcuts",
            "About",
          ])
          .optional(),
        page: z
          .enum([
            "settings",
            "integrations",
            "performance",
            "history",
            "bookmarks",
            "downloads",
            "newtab",
            "about",
            "extensions",
            "connections",
            "passwords",
            "privacy",
            "workspaces",
          ])
          .optional(),
      }),
    },
    async ({ action, page, section, menu }, ctx) => {
      const b = target();
      await access.approve(
        b,
        `browser UI ${action}`,
        page || action,
        ctx.mcpReq.signal,
      );
      if (action === "open") {
        if (!page || !internal(`piccolo://${page}`))
          throw Error("Select a supported internal page.");
        if (page === "downloads" && b.active().url !== "piccolo://downloads") {
          const existing = b.state.tabs.find(
            (t) => t.url === "piccolo://downloads",
          );
          if (existing) b.activate(existing.id);
          else b.newTab("piccolo://downloads");
        } else b.navigate(`piccolo://${page}`);
        return result({ ok: true });
      }
      if (action === "menu") {
        if (!menu) throw Error("Select a known browser menu.");
        const ok = await b.win.webContents.executeJavaScript(
          `(async()=>{let current=document.querySelector('.browser-menu');if(${JSON.stringify(menu)}==='close'){if(current)document.querySelector('.overlay-backdrop')?.click();return true;}if(!current)document.querySelector('[title="Browser menu"]')?.click();else document.querySelector('.menu-title button')?.click();await new Promise(r=>setTimeout(r,0));if(${JSON.stringify(menu)}==='main')return !!document.querySelector('.browser-menu');const button=[...document.querySelectorAll('.browser-menu > button')].find(b=>b.querySelector('span')?.textContent===${JSON.stringify(menu)});button?.click();return !!button;})()`,
        );
        return result({ ok });
      }
      if (action === "section") {
        if (
          !section ||
          ![
            "piccolo://settings",
            "piccolo://privacy",
            "piccolo://about",
          ].includes(b.active().url)
        )
          throw Error("Open Settings and select a known section first.");
        const changed = await b.win.webContents.executeJavaScript(
          `(()=>{const button=[...document.querySelectorAll('.settings-nav button')].find(b=>b.textContent===${JSON.stringify(section)});button?.click();return !!button;})()`,
        );
        return result({ ok: changed });
      }
      if (action === "controls")
        return result(
          await b.win.webContents.executeJavaScript(
            `(()=>({appearance:document.documentElement.dataset.theme,motion:document.documentElement.dataset.motion,controls:[...document.querySelectorAll('button,input,select,textarea,a,[role="switch"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').slice(0,500).map(e=>({tag:e.tagName,type:e.type||'',label:(e.getAttribute('aria-label')||e.getAttribute('title')||e.closest('label')?.innerText||e.innerText||'').slice(0,180),disabled:!!e.disabled,checked:e.type==='checkbox'?e.checked:undefined,options:e.tagName==='SELECT'?[...e.options].map(o=>o.text):undefined}))}))()`,
          ),
        );
      if (action === "read")
        return result({
          text: await b.win.webContents.executeJavaScript(
            "document.body.innerText.slice(0,30000)",
          ),
        });
      // DOM acknowledgement can precede Chromium's compositor by one frame.
      // Flush visible UI painting so a screenshot reflects the current section.
      if (b.state.visible)
        await Promise.race([
          b.win.webContents.executeJavaScript(
            'document.visibilityState === "visible" ? new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) : null',
          ),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]);
      const png = (await b.win.webContents.capturePage())
        .resize({ width: Math.min(1600, b.win.getContentSize()[0]) })
        .toPNG();
      if (png.length > 4_000_000) throw Error("Screenshot exceeds 4 MB.");
      return {
        content: [
          {
            type: "image" as const,
            data: png.toString("base64"),
            mimeType: "image/png",
          },
        ],
      };
    },
  );
  return closeDialogs;
}
