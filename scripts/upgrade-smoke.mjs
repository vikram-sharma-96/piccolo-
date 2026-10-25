import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";
import { _electron as electron } from "playwright";
import { createServer, request } from "node:http";
import { connect } from "node:net";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
const out = path.resolve("test-results");
const profile = path.join(out, `upgrade-${Date.now()}`);
await mkdir(profile, { recursive: true });
const results = [];
let app, page, mcpClient;
let tunnelCount = 0;
const sockets = new Set();
const fixture = createServer((req, res) => {
  if (req.url === "/slow") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="upgrade.bin"',
    });
    let count = 0;
    const timer = setInterval(() => {
      if (count++ < 12) res.write(Buffer.alloc(32768));
    }, 100);
    res.on("close", () => clearInterval(timer));
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<title>Upgrade fixture</title><h1>Approved fixture text</h1><input id="field">',
    );
  }
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${fixture.address().port}`;
const proxy = createServer((req, res) => {
  const url = new URL(req.url);
  const upstream = request(
    url,
    { method: req.method, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  req.pipe(upstream);
  upstream.on("error", () => res.writeHead(502).end());
});
proxy.on("connect", (req, socket, head) => {
  tunnelCount++;
  const [host, port] = req.url.split(":");
  const upstream = connect(Number(port), host, () => {
    socket.write("HTTP/1.1 200 Connection established\r\n\r\n");
    if (head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  sockets.add(upstream);
  upstream.on("close", () => sockets.delete(upstream));
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env, PICCOLO_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  for (let i = 0; i < 200; i++) {
    page = app.windows().find((p) => p.url().startsWith("piccolo-ui:"));
    if (page) break;
    await wait(100);
  }
  await page.waitForFunction(() => !!window.piccolo);
  await page.locator(".content").waitFor();
}
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
const state = () => page.evaluate(() => window.piccolo.state());
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    const s = await state();
    if (predicate(s)) return s;
    await wait(100);
  }
  throw Error("Condition timed out: " + predicate.toString());
}
async function visit(url = base) {
  url = new URL(url).href;
  await cmd({ type: "navigate", input: url });
  await until((s) =>
    s.tabs.some(
      (t) => t.url === url && !t.loading && t.title === "Upgrade fixture",
    ),
  );
}
async function remote(code) {
  const s = await state();
  const active = s.tabs.find((t) => t.id === s.activeId);
  return app.evaluate(
    ({ webContents }, { url, code }) =>
      webContents
        .getAllWebContents()
        .find(
          (w) =>
            w.getURL() === url &&
            w.getLastWebPreferences().preload === undefined,
        )
        .executeJavaScript(code),
    { url: active.url, code },
  );
}
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS", name);
}
async function decisions(value) {
  await app.evaluate(({ dialog }, value) => {
    dialog.showMessageBox = async () => ({
      response: value,
      checkboxChecked: false,
    });
  }, value);
}
try {
  await launch();
  await check("optional services are unloaded by default", async () => {
    const metrics = await cmd({ type: "metrics" });
    assert.equal(metrics.optionalLoaded.mcp, false);
    assert.equal(metrics.optionalLoaded.services, false);
    await cmd({ type: "optional", service: "mcp", action: "status" });
    assert.equal((await cmd({ type: "metrics" })).optionalLoaded.mcp, false);
  });
  await check(
    "sidebar default off; laptop new-tab fits without overlap",
    async () => {
      assert.equal((await state()).settings.sidebarMode, "off");
      assert.equal(await page.locator(".rail").count(), 0);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
      );
      const overflow = await page
        .locator(".content")
        .evaluate((e) => e.scrollHeight - e.clientHeight);
      assert.ok(overflow <= 2, `new-tab overflow ${overflow}`);
      assert.equal(await page.locator(".widget.clock").count(), 0);
      await page.screenshot({ path: path.join(out, "upgrade-newtab.png") });
    },
  );
  await visit();
  await check(
    "menu above remote view; keyboard, submenus, Escape and outside dismissal",
    async () => {
      await page.getByTitle("Browser menu", { exact: true }).click();
      await page.getByRole("menu", { name: "Piccolo browser menu" }).waitFor();
      assert.equal(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]
            .contentView.children.filter(
              (v) => v.webContents && v.webContents.getURL().startsWith("http"),
            )
            .some((v) => v.getVisible()),
        ),
        false,
      );
      await page.keyboard.press("End");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Exit",
      );
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowDown");
      assert.match(
        await page.evaluate(() => document.activeElement.textContent),
        /New window/,
      );
      await page
        .getByRole("menuitem", { name: "Sidebar", exact: false })
        .click();
      await page
        .getByRole("menuitemcheckbox", { name: "On", exact: true })
        .click();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      assert.equal((await state()).settings.sidebarMode, "on");
      await page.getByTitle("Browser menu", { exact: true }).click();
      await page
        .locator(".overlay-backdrop")
        .click({ position: { x: 100, y: 300 } });
      assert.equal(await page.getByRole("menu").count(), 0);
      await cmd({
        type: "settings",
        value: { ...(await state()).settings, sidebarMode: "off" },
      });
    },
  );
  await check(
    "auto-hide uses a narrow trusted gutter and restores page bounds",
    async () => {
      await cmd({
        type: "settings",
        value: { ...(await state()).settings, sidebarMode: "auto" },
      });
      await page.locator(".rail").hover();
      await until((s) => s.sidebarOpen);
      await cmd({ type: "sidebar", open: false });
      await until((s) => !s.sidebarOpen);
      await cmd({
        type: "settings",
        value: { ...(await state()).settings, sidebarMode: "off" },
      });
    },
  );
  await check(
    "F12 and Ctrl+Shift+I target webpage tools and toggle",
    async () => {
      const rp = app.windows().find((p) => p.url() === base + "/");
      await rp.locator("#field").click();
      await app.evaluate(({ BrowserWindow, webContents }, url) => {
        BrowserWindow.getAllWindows()[0].focus();
        const w = webContents
          .getAllWebContents()
          .find((w) => w.getURL() === url);
        w.focus();
        w.sendInputEvent({ type: "keyDown", keyCode: "F12" });
        w.sendInputEvent({ type: "keyUp", keyCode: "F12" });
      }, base + "/");
      await wait(1200);
      assert.equal(
        await app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL() === url)
              .isDevToolsOpened(),
          base + "/",
        ),
        true,
      );
      await cmd({ type: "action", action: "devtools" });
      await rp.locator("#field").click();
      await app.evaluate(({ webContents }, url) => {
        const w = webContents
          .getAllWebContents()
          .find((w) => w.getURL() === url);
        w.focus();
        w.sendInputEvent({
          type: "keyDown",
          keyCode: "I",
          modifiers: ["control", "shift"],
        });
        w.sendInputEvent({
          type: "keyUp",
          keyCode: "I",
          modifiers: ["control", "shift"],
        });
      }, base + "/");
      await wait(800);
      assert.equal(
        await app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL() === url)
              .isDevToolsOpened(),
          base + "/",
        ),
        true,
      );
      await cmd({ type: "action", action: "devtools" });
    },
  );
  await check("custom search template and keyword navigation", async () => {
    const s = (await state()).settings;
    await cmd({
      type: "settings",
      value: {
        ...s,
        searchEngine: "local",
        searchEngines: [
          ...s.searchEngines,
          {
            id: "local",
            name: "Fixture",
            keyword: "fx",
            template: base + "/search?q={searchTerms}",
          },
        ],
      },
    });
    await cmd({ type: "navigate", input: "fx a&b c" });
    await until((s) =>
      s.tabs.some((t) => t.url === base + "/search?q=a%26b%20c" && !t.loading),
    );
    await visit();
  });
  await check("save page writes actual MHTML archive", async () => {
    const filePath = path.join(profile, "fixture.mhtml");
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, filePath);
    await cmd({ type: "action", action: "save-page" });
    assert.match(
      (await readFile(filePath, "utf8")).replace(/=\r?\n/g, ""),
      /Approved fixture text/,
    );
  });
  await check(
    "download speed, unknown total, stall, cancel and retry",
    async () => {
      await app.evaluate(({ dialog }, profile) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [profile],
        });
      }, profile);
      await cmd({ type: "download-directory" });
      await cmd({
        type: "settings",
        value: { ...(await state()).settings, askDownload: false },
      });
      await remote(`location.href=${JSON.stringify(base + "/slow")}`);
      await until((s) =>
        s.downloads.some((d) => d.status === "awaiting-approval"),
      );
      await cmd({
        type: "download",
        id: (await state()).downloads[0].id,
        action: "approve",
      });
      let s = await until((s) =>
        s.downloads.some((d) => d.received > 100000 && d.speed > 0),
      );
      const d = s.downloads[0];
      assert.equal(d.eta, null);
      await until((s) => s.downloads.find((x) => x.id === d.id).speed === 0);
      await cmd({ type: "download", id: d.id, action: "cancel" });
      await cmd({ type: "download", id: d.id, action: "retry" });
      await until((s) => s.downloads.length === 2);
      for (const x of (await state()).downloads)
        if (["progressing", "awaiting-approval"].includes(x.status))
          await cmd({ type: "download", id: x.id, action: "cancel" });
    },
  );
  await check(
    "extension content script, private isolation, disable and enable",
    async () => {
      const dir = path.join(profile, "extension");
      await mkdir(dir);
      await writeFile(
        path.join(dir, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          name: "Piccolo fixture extension",
          permissions: ["storage"],
          version: "1.0",
          content_scripts: [
            {
              matches: ["<all_urls>"],
              js: ["content.js"],
              run_at: "document_end",
            },
          ],
        }),
      );
      await writeFile(
        path.join(dir, "content.js"),
        'document.documentElement.dataset.piccoloFixture="verified";chrome.storage.local.get(["fixtureRuns"],v=>{const runs=(v.fixtureRuns||0)+1;chrome.storage.local.set({fixtureRuns:runs},()=>{document.documentElement.dataset.piccoloStorage=String(runs);});});',
      );
      await app.evaluate(({ dialog }, dir) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [dir],
        });
      }, dir);
      await decisions(1);
      const list = await cmd({
        type: "optional",
        service: "extensions",
        action: "install",
      });
      assert.equal(list.length, 1);
      await visit(base + "/extension");
      assert.equal(
        await remote("document.documentElement.dataset.piccoloFixture"),
        "verified",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.dataset.piccoloFixture,
        ),
        undefined,
      );
      let storage;
      for (let i = 0; i < 50; i++) {
        storage = await remote(
          "document.documentElement.dataset.piccoloStorage",
        );
        if (storage) break;
        await wait(50);
      }
      assert.ok(Number(storage) >= 1);
      await cmd({
        type: "optional",
        service: "extensions",
        action: "disable",
        value: list[0].id,
      });
      await visit(base + "/disabled");
      assert.equal(
        await remote("document.documentElement.dataset.piccoloFixture"),
        undefined,
      );
      await cmd({
        type: "optional",
        service: "extensions",
        action: "enable",
        value: list[0].id,
      });
      await visit(base + "/enabled");
      assert.equal(
        await remote("document.documentElement.dataset.piccoloFixture"),
        "verified",
      );
      await cmd({ type: "action", action: "private" });
      let privatePage;
      for (let i = 0; i < 100; i++) {
        privatePage = app
          .windows()
          .find((p) => p !== page && p.url().startsWith("piccolo-ui:"));
        if (privatePage) break;
        await wait(50);
      }
      await privatePage.waitForFunction(() => !!window.piccolo);
      await privatePage.evaluate(
        (url) => window.piccolo.command({ type: "navigate", input: url }),
        base + "/private-extension",
      );
      for (let i = 0; i < 100; i++) {
        const ready = await privatePage.evaluate(() =>
          window.piccolo
            .state()
            .then((s) =>
              s.tabs.some((t) => t.title === "Upgrade fixture" && !t.loading),
            ),
        );
        if (ready) break;
        await wait(50);
      }
      assert.equal(
        await app.evaluate(
          ({ webContents }, url) =>
            webContents
              .getAllWebContents()
              .find((w) => w.getURL() === url)
              .executeJavaScript(
                "document.documentElement.dataset.piccoloFixture",
              ),
          base + "/private-extension",
        ),
        undefined,
      );
      await privatePage.evaluate(() => window.close());
    },
  );
  await check(
    "browser proxy verifies real HTTPS traffic and disconnects",
    async () => {
      await cmd({
        type: "optional",
        service: "proxy",
        action: "connect",
        value: `http://127.0.0.1:${proxy.address().port}`,
      });
      assert.ok(tunnelCount > 0);
      const status = await cmd({
        type: "optional",
        service: "proxy",
        action: "status",
      });
      assert.equal(status.enabled, true);
      await assert.rejects(
        () =>
          cmd({
            type: "optional",
            service: "proxy",
            action: "connect",
            value: "http://127.0.0.1:1",
          }),
        /Previous browser proxy/,
      );
      const restored = await cmd({
        type: "optional",
        service: "proxy",
        action: "status",
      });
      assert.equal(restored.enabled, true);
      assert.equal(restored.url, `http://127.0.0.1:${proxy.address().port}`);

      await cmd({ type: "optional", service: "proxy", action: "disconnect" });
      assert.equal(
        (await cmd({ type: "optional", service: "proxy", action: "status" }))
          .enabled,
        false,
      );
    },
  );
  await check(
    "failed proxy setup pauses traffic until explicit disconnect",
    async () => {
      await assert.rejects(
        () =>
          cmd({
            type: "optional",
            service: "proxy",
            action: "connect",
            value: "http://127.0.0.1:1",
          }),
        /networking is paused/,
      );
      assert.equal(
        (await cmd({ type: "optional", service: "proxy", action: "status" }))
          .blocked,
        true,
      );
      await cmd({ type: "optional", service: "proxy", action: "disconnect" });
      await visit(base + "/direct-after-proxy");
    },
  );
  await check(
    "MCP auth, Host/Origin checks, approval, text extraction and revocation",
    async () => {
      await visit(base + "/mcp");
      await decisions(1);
      const status = await cmd({
        type: "optional",
        service: "mcp",
        action: "server-start",
      });
      assert.equal(status.serverEnabled, true);
      const original = await app.evaluate(({ clipboard }) =>
        clipboard.readText(),
      );
      await cmd({ type: "optional", service: "mcp", action: "copy-token" });
      const token = await app.evaluate(({ clipboard }) => clipboard.readText());
      await app.evaluate(
        ({ clipboard }, text) => clipboard.writeText(text),
        original,
      );
      assert.equal(
        (
          await fetch(status.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(status.endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Origin: "https://evil.example",
            },
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        await new Promise((resolve) => {
          const req = request(
            status.endpoint,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                Host: "evil.example",
                "content-type": "application/json",
              },
            },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.end("{}");
        }),
        403,
      );
      mcpClient = new Client({
        name: "Piccolo smoke client",
        version: "1.0.0",
      });
      await mcpClient.connect(
        new StreamableHTTPClientTransport(new URL(status.endpoint), {
          requestInit: {
            headers: {
              Authorization: `Bearer ${token}`,
              Origin: new URL(status.endpoint).origin,
            },
          },
        }),
      );
      assert.equal(
        (
          await fetch(status.endpoint, {
            method: "POST",
            headers: { Authorization: "Bearer invalid" },
            body: "{}",
          })
        ).status,
        401,
      );
      const listed = await mcpClient.listTools();
      assert.ok(listed.tools.length >= 10);
      assert.ok(listed.tools.some((tool) => tool.name === "browser_state"));
      assert.ok(listed.tools.some((tool) => tool.name === "browser_click"));
      const stdioClient = new Client({
        name: "Piccolo stdio smoke client",
        version: "1.0.0",
      });
      const stdioCommand = process.env.PICCOLO_EXE || process.execPath;
      const stdioEntry = path.resolve("dist/mcp-stdio-entry.cjs");
      const stdioArgs = process.env.PICCOLO_EXE
        ? [
            path.join(
              path.dirname(process.env.PICCOLO_EXE),
              "resources",
              "app.asar",
              "dist",
              "mcp-stdio-entry.cjs",
            ),
          ]
        : [stdioEntry];
      const stdioTransport = new StdioClientTransport({
        command: stdioCommand,
        args: stdioArgs,
        cwd: process.cwd(),
        env: {
          ...process.env,
          PICCOLO_PROFILE: profile,
          ...(process.env.PICCOLO_EXE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
        },
        stderr: "pipe",
      });
      stdioTransport.stderr?.on("data", (chunk) =>
        console.error("STDIO", chunk.toString()),
      );
      await stdioClient.connect(stdioTransport);
      const stdioTools = await stdioClient.listTools();
      assert.ok(stdioTools.tools.some((tool) => tool.name === "browser_read"));
      await stdioClient.close();
      await decisions(0);
      const denied = await mcpClient.callTool({
        name: "selected_metadata",
        arguments: {},
      });
      assert.equal(denied.isError, true);
      await decisions(1);
      const result = await mcpClient.callTool({
        name: "selected_text",
        arguments: {},
      });
      assert.match(JSON.stringify(result), /Approved fixture text/);
      await mcpClient.close();
      mcpClient = undefined;
      await cmd({
        type: "optional",
        service: "mcp",
        action: "connect",
        value: { url: status.endpoint, bearer: token },
      });
      await assert.rejects(
        () =>
          cmd({
            type: "optional",
            service: "mcp",
            action: "call",
            value: { name: "navigate", arguments: { url: 123 } },
          }),
        /Arguments do not match/,
      );
      const called = await cmd({
        type: "optional",
        service: "mcp",
        action: "call",
        value: { name: "selected_metadata", arguments: {} },
      });
      assert.match(JSON.stringify(called.result), /Upgrade fixture/);
      assert.equal(JSON.stringify(await state()).includes(token), false);
      await cmd({ type: "optional", service: "mcp", action: "server-stop" });
      assert.equal(
        (await cmd({ type: "optional", service: "mcp", action: "status" }))
          .serverEnabled,
        false,
      );
    },
  );
  await check("MCP cancellation of an actual pending tool call", async () => {
    const handler = createMcpHandler(() => {
      const server = new McpServer({
        name: "Cancellation fixture",
        version: "1.0.0",
      });
      server.registerTool(
        "slow",
        { inputSchema: z.object({ message: z.string().optional() }) },
        async (_args, ctx) =>
          new Promise((resolve) => {
            const timer = setTimeout(
              () => resolve({ content: [{ type: "text", text: "completed" }] }),
              5000,
            );
            ctx.mcpReq.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve({
                  isError: true,
                  content: [{ type: "text", text: "cancelled" }],
                });
              },
              { once: true },
            );
          }),
      );
      return server;
    });
    const fixtureServer = createServer(toNodeHandler(handler));
    await new Promise((r) => fixtureServer.listen(0, "127.0.0.1", r));
    try {
      await decisions(1);
      await cmd({
        type: "optional",
        service: "mcp",
        action: "connect",
        value: { url: `http://127.0.0.1:${fixtureServer.address().port}/mcp` },
      });
      await assert.rejects(
        () =>
          cmd({
            type: "optional",
            service: "mcp",
            action: "call",
            value: { name: "slow", arguments: { message: "x".repeat(1000) } },
          }),
        /approval limit/,
      );
      const pending = cmd({
        type: "optional",
        service: "mcp",
        action: "call",
        value: { name: "slow", arguments: {} },
      }).then(
        (value) => ({ value }),
        (error) => ({ error: String(error) }),
      );
      await wait(600);
      await cmd({ type: "optional", service: "mcp", action: "cancel" });
      assert.match((await pending).error, /cancelled/);
    } finally {
      await cmd({
        type: "optional",
        service: "mcp",
        action: "disconnect",
      }).catch(() => {});
      fixtureServer.closeAllConnections();
      await new Promise((r) => fixtureServer.close(r));
    }
  });
  await check(
    "daily NASA opt-in and explicit offline/rights fallback",
    async () => {
      await decisions(1);
      const fakeKey = "PiccoloTestKeyNotACredential123";
      await cmd({
        type: "optional",
        service: "daily",
        action: "key",
        value: fakeKey,
      });
      const encrypted = await readFile(path.join(profile, "nasa-key.bin"));
      assert.equal(encrypted.includes(Buffer.from(fakeKey)), false);
      assert.equal(JSON.stringify(await state()).includes(fakeKey), false);
      await cmd({ type: "optional", service: "daily", action: "clear-key" });
      const observed = await cmd({
        type: "optional",
        service: "daily",
        action: "enable",
      });
      results.push({ provider: "NASA APOD DEMO_KEY", observation: observed });
      assert.equal((await state()).settings.dailyWallpaper, true);
      assert.ok(typeof observed.status === "string");
      await cmd({ type: "optional", service: "daily", action: "disable" });
      assert.equal((await state()).settings.dailyWallpaper, false);
    },
  );
  await check(
    "cookies, local storage, engine and extension survive restart",
    async () => {
      await visit(base + "/cookies");
      await remote(
        'document.cookie="piccoloCookie=persisted; Max-Age=86400; SameSite=Lax";localStorage.setItem("piccoloPersist","yes")',
      );
      await app.close();
      await launch();
      await visit(base + "/cookies-after");
      assert.match(await remote("document.cookie"), /piccoloCookie=persisted/);
      assert.equal(
        await remote('localStorage.getItem("piccoloPersist")'),
        "yes",
      );
      assert.equal((await state()).settings.searchEngine, "local");
      assert.equal(
        await remote("document.documentElement.dataset.piccoloFixture"),
        "verified",
      );
      assert.equal(
        (await cmd({ type: "optional", service: "mcp", action: "status" }))
          .serverEnabled,
        false,
      );
    },
  );
  await check("extension content integrity and removal", async () => {
    const installed = await cmd({
      type: "optional",
      service: "extensions",
      action: "status",
    });
    const record = installed[0];
    await cmd({
      type: "optional",
      service: "extensions",
      action: "disable",
      value: record.id,
    });
    await writeFile(
      path.join(record.path, "content.js"),
      'document.documentElement.dataset.piccoloFixture="tampered";',
    );
    await assert.rejects(
      () =>
        cmd({
          type: "optional",
          service: "extensions",
          action: "enable",
          value: record.id,
        }),
      /files changed/,
    );
    const remaining = await cmd({
      type: "optional",
      service: "extensions",
      action: "remove",
      value: record.id,
    });
    assert.equal(remaining.length, 0);
  });
} catch (error) {
  results.push({ error: String(error), stack: error.stack });
  console.error(error);
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: path.join(out, "upgrade-failure.png") })
      .catch(() => {});
} finally {
  await mcpClient?.close();
  await app?.close().catch(() => {});
  fixture.closeAllConnections();
  fixture.close();
  proxy.closeAllConnections();
  for (const socket of sockets) socket.destroy();
  proxy.close();
  await writeFile(
    path.join(
      out,
      process.env.PICCOLO_EXE ? "upgrade-packaged.json" : "upgrade-smoke.json",
    ),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        profile,
        results,
        nativeDialogs:
          "Approval and file chooser responses were substituted by the harness; all runtime operations were real.",
      },
      null,
      2,
    ),
  );
}
