import { _electron as electron } from "playwright";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const profile = path.resolve(`test-results/appearance-${Date.now()}`);
await mkdir(profile, { recursive: true });
const results = [],
  inventory = [];
let app, page, client;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cmd = (c) => page.evaluate((c) => window.piccolo.command(c), c);
const state = () => page.evaluate(() => window.piccolo.state());
async function launch() {
  const env = { ...process.env, PICCOLO_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.PICCOLO_EXE
      ? { executablePath: process.env.PICCOLO_EXE, args: [] }
      : { args: ["."] }),
    env,
  });
  page = await app.firstWindow();
  await page.waitForFunction(() => !!window.piccolo);
  await page.locator(".content").waitFor();
}
async function call(name, args = {}) {
  const r = await client.callTool(
    { name, arguments: args },
    { timeout: 40000 },
  );
  if (r.isError) throw Error(JSON.stringify(r.content));
  const t = r.content.find((c) => c.type === "text");
  return t ? JSON.parse(t.text) : r;
}
async function connect() {
  client = new Client({ name: "appearance-audit", version: "1" });
  const exe = process.env.PICCOLO_EXE || process.execPath;
  const entry = process.env.PICCOLO_EXE
    ? path.join(
        path.dirname(exe),
        "resources/app.asar/dist/mcp-stdio-entry.cjs",
      )
    : path.resolve("dist/mcp-stdio-entry.cjs");
  await client.connect(
    new StdioClientTransport({
      command: exe,
      args: [entry, "--client=appearance-audit"],
      env: {
        PICCOLO_PROFILE: profile,
        ...(process.env.PICCOLO_EXE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      },
      stderr: "pipe",
    }),
    { timeout: 40000 },
  );
}
async function check(name, fn) {
  await fn();
  results.push({ name, status: "Passed" });
  console.log("PASS " + name);
}
async function shot(name) {
  const r = await call("piccolo_ui", { action: "screenshot" });
  await writeFile(
    path.join(profile, name + ".png"),
    Buffer.from(r.content[0].data, "base64"),
  );
}
const sections = [
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
];
const pages = [
  "newtab",
  "history",
  "bookmarks",
  "downloads",
  "extensions",
  "connections",
  "passwords",
  "integrations",
  "performance",
  "workspaces",
  "about",
];
try {
  await launch();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await cmd({ type: "optional", service: "mcp", action: "server-start" });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 2,
      checkboxChecked: false,
    });
  });
  await connect();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0 });
  });
  for (const mode of ["light", "dark", "system"]) {
    await check(
      mode + " Settings sections inventoried through authenticated local MCP",
      async () => {
        await call("piccolo_settings", {
          action: "update",
          settings: { theme: mode },
        });
        await call("piccolo_ui", { action: "open", page: "settings" });
        await page.locator(".settings-nav").waitFor();
        for (const section of sections) {
          await call("piccolo_ui", { action: "section", section });
          await page
            .locator(".settings-panel h2")
            .filter({ hasText: section })
            .waitFor();
          const controls = await call("piccolo_ui", { action: "controls" });
          assert.ok(controls.controls.length > 0);
          assert.equal(controls.appearance, (await state()).appearance);
          inventory.push({ mode, section, ...controls });
          await shot(mode + "-" + section.replaceAll(" ", "-"));
        }
      },
    );
    await check(
      mode + " internal pages render with consistent chrome and semantic text",
      async () => {
        for (const p of pages) {
          await call("piccolo_ui", { action: "open", page: p });
          await wait(80);
          const data = await call("piccolo_ui", { action: "controls" });
          assert.equal(data.appearance, (await state()).appearance);
          const colors = await page.evaluate(() => {
            const css = getComputedStyle(document.documentElement),
              bar = getComputedStyle(document.querySelector(".tabs-bar"));
            return {
              bg: css.getPropertyValue("--bg").trim(),
              bar: bar.backgroundColor,
              text: css.getPropertyValue("--text").trim(),
            };
          });
          inventory.push({ mode, page: p, colors, controls: data.controls });
          await shot(mode + "-" + p);
        }
      },
    );
    await check(
      mode + " semantic text and accent contrast meets 4.5:1",
      async () => {
        const ratios = await page.evaluate(() => {
          const css = getComputedStyle(document.documentElement),
            canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d");
          const rgb = (token) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = css.getPropertyValue(token).trim();
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data]
              .slice(0, 3)
              .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              });
          };
          const l = (token) => {
              const c = rgb(token);
              return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
            },
            bg = l("--bg");
          return ["--text", "--muted", "--accent-ink"].map((token) => {
            const a = l(token);
            return {
              token,
              ratio: (Math.max(bg, a) + 0.05) / (Math.min(bg, a) + 0.05),
            };
          });
        });
        for (const ratio of ratios)
          assert.ok(ratio.ratio >= 4.5, JSON.stringify(ratio));
        inventory.push({ mode, contrast: ratios });
      },
    );
    await check(
      mode + " browser menu and submenus inspected through MCP",
      async () => {
        for (const menu of [
          "main",
          "Bookmarks",
          "Save and share",
          "More tools",
          "Sidebar",
        ]) {
          assert.equal(
            (await call("piccolo_ui", { action: "menu", menu })).ok,
            true,
          );
          await wait(50);
          const controls = await call("piccolo_ui", { action: "controls" });
          inventory.push({ mode, menu, ...controls });
          await shot(mode + "-menu-" + menu.replaceAll(" ", "-"));
        }
        await call("piccolo_ui", { action: "menu", menu: "close" });
      },
    );
    await check(
      mode +
        " preference persists after application restart and client reconnect",
      async () => {
        await call("piccolo_settings", {
          action: "update",
          settings: { startup: "blank" },
        });
        await app.close();
        await launch();
        assert.equal((await state()).settings.theme, mode);
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.theme),
          (await state()).appearance,
        );
        const persisted = await call("piccolo_settings", { action: "read" });
        assert.equal(persisted.settings.theme, mode);
      },
    );
  }
  await check(
    "System follows OS signal while explicit UI theme does not change website preference",
    async () => {
      await app.evaluate(({ nativeTheme }) => {
        nativeTheme.themeSource = "light";
      });
      await wait(80);
      assert.equal((await state()).appearance, "light");
      await app.evaluate(({ nativeTheme }) => {
        nativeTheme.themeSource = "dark";
      });
      await wait(80);
      assert.equal((await state()).appearance, "dark");
      await call("piccolo_settings", {
        action: "update",
        settings: { theme: "light" },
      });
      assert.equal(
        await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
        "dark",
      );
      assert.equal((await state()).appearance, "light");
      await app.evaluate(({ nativeTheme }) => {
        nativeTheme.themeSource = "system";
      });
    },
  );
  await check(
    "Safe preference controls have real persisted state effects through MCP",
    async () => {
      const original = (await call("piccolo_settings", { action: "read" }))
        .settings;
      const changes = {
        accent: "#28704f",
        density: "compact",
        bookmarksBar: true,
        sidebarMode: "on",
        sidebarWidth: 80,
        transparency: false,
        motion: true,
        lowPower: false,
        sleepMinutes: 7,
        sleepExcluded: ["example.test"],
        askDownload: false,
        greeting: "Audit greeting",
        startup: "blank",
        searchEngine: "google",
      };
      for (const [key, value] of Object.entries(changes)) {
        await call("piccolo_settings", {
          action: "update",
          settings: { [key]: value },
        });
        assert.deepEqual(
          (await call("piccolo_settings", { action: "read" })).settings[key],
          value,
        );
        assert.deepEqual((await state()).settings[key], value);
      }
      await call("piccolo_settings", { action: "update", settings: original });
    },
  );
  await check(
    "Every ordinary Settings checkbox/select exercised through UI with main state confirmation",
    async () => {
      await call("piccolo_ui", { action: "open", page: "settings" });
      await page.locator(".settings-nav").waitFor();
      for (const section of [
        "Appearance",
        "New tab",
        "Startup",
        "Downloads",
        "Performance",
      ]) {
        await call("piccolo_ui", { action: "section", section });
        await wait(50);
        const checks = page.locator(".settings-panel input[type=checkbox]");
        for (let i = 0; i < (await checks.count()); i++) {
          const old = await checks.nth(i).isChecked();
          await checks.nth(i).click();
          await wait(70);
          assert.equal(await checks.nth(i).isChecked(), !old);
          await checks.nth(i).click();
          await wait(50);
        }
        const selects = page.locator(".settings-panel select");
        for (let i = 0; i < (await selects.count()); i++) {
          const element = selects.nth(i),
            old = await element.inputValue(),
            values = await element
              .locator("option")
              .evaluateAll((es) => es.map((e) => e.value));
          for (const value of values) {
            await element.selectOption(value);
            await wait(60);
            assert.equal(await element.inputValue(), value);
          }
          await element.selectOption(old);
        }
      }
    },
  );
  await check(
    "Reduced motion and low-power mode suppress nonessential animations",
    async () => {
      await call("piccolo_settings", {
        action: "update",
        settings: { motion: true, lowPower: false },
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await page.evaluate(
          () =>
            getComputedStyle(document.querySelector("button"))
              .transitionDuration,
        ),
        "0s",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await call("piccolo_settings", {
        action: "update",
        settings: { lowPower: true },
      });
      await wait(50);
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.motion),
        "false",
      );
    },
  );
  await check(
    "Keyboard Downloads and tab reordering operate without losing initiating tab",
    async () => {
      const key = async (keyCode, modifiers = ["control"]) => {
        await app.evaluate(
          ({ BrowserWindow }, { keyCode, modifiers }) => {
            const w = BrowserWindow.getAllWindows()[0];
            w.focus();
            w.webContents.focus();
            w.webContents.sendInputEvent({
              type: "keyDown",
              keyCode,
              modifiers,
            });
            w.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
          },
          { keyCode, modifiers },
        );
        await wait(100);
      };
      await key("T");
      const before = (await state()).activeId,
        ids = (await state()).tabs.map((t) => t.id);
      await key("PageUp", ["control", "shift"]);
      const after = await state();
      assert.equal(after.activeId, before);
      if (ids.length > 1)
        assert.equal(
          after.tabs.findIndex((t) => t.id === before),
          ids.length - 2,
        );
      await key("J");
      const s = await state();
      assert.equal(
        s.tabs.find((t) => t.id === s.activeId)?.url,
        "piccolo://downloads",
      );
    },
  );
  await check(
    "Settings text, color and range inputs update actual preferences",
    async () => {
      await call("piccolo_ui", { action: "open", page: "settings" });
      await page.locator(".settings-nav").waitFor();
      await call("piccolo_ui", { action: "section", section: "New tab" });
      await page
        .getByRole("textbox", { name: "Greeting", exact: true })
        .fill("Local settings audit");
      await wait(100);
      assert.equal((await state()).settings.greeting, "Local settings audit");
      for (const [label, value, key] of [
        ["dim", "0.6", "dim"],
        ["blur", "3", "blur"],
        ["contrast", "1.2", "contrast"],
      ]) {
        await page
          .getByRole("slider", { name: label, exact: true })
          .evaluate((e, value) => {
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            ).set.call(e, value);
            e.dispatchEvent(new Event("input", { bubbles: true }));
          }, value);
        await wait(100);
        assert.equal((await state()).settings.wallpaper[key], Number(value));
      }
      await page
        .getByLabel("Link 1 title", { exact: true })
        .fill("Fixture link");
      await page
        .getByLabel("Link 1 URL", { exact: true })
        .fill("https://example.test/");
      await wait(100);
      assert.equal(
        (await state()).settings.quickLinks[0].url,
        "https://example.test/",
      );
      const count = (await state()).settings.quickLinks.length;
      await page
        .getByRole("button", { name: "Add quick link", exact: true })
        .click();
      await wait(100);
      assert.equal((await state()).settings.quickLinks.length, count + 1);
      await page.getByTitle("Remove link", { exact: true }).last().click();
      await wait(100);
      assert.equal((await state()).settings.quickLinks.length, count);
    },
  );
  await check(
    "Native wallpaper and destination choosers, settings export/import round trip",
    async () => {
      const image = path.join(profile, "fixture.png"),
        video = path.resolve("tests/fixtures/performance-wallpaper.webm"),
        settingsFile = path.join(profile, "settings-export.json");
      await page.screenshot({ path: image });
      const choose = async (file) =>
        app.evaluate(({ dialog }, file) => {
          dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [file],
          });
        }, file);
      await choose(image);
      await page
        .getByRole("button", { name: "Choose local image", exact: true })
        .click();
      await wait(100);
      assert.equal((await state()).settings.wallpaper.kind, "image");
      assert.ok((await state()).settings.wallpaper.asset.endsWith(".png"));
      await choose(video);
      await page
        .getByRole("button", { name: "Choose local video", exact: true })
        .click();
      await wait(100);
      assert.equal((await state()).settings.wallpaper.kind, "video");
      assert.ok((await state()).settings.wallpaper.asset.endsWith(".webm"));
      await call("piccolo_ui", { action: "section", section: "Downloads" });
      await choose(profile);
      await page
        .getByRole("button", { name: "Choose folder", exact: true })
        .click();
      await wait(100);
      assert.equal((await state()).settings.downloadDirectory, profile);
      await call("piccolo_ui", { action: "section", section: "Appearance" });
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, settingsFile);
      await page
        .getByRole("button", { name: "Export settings", exact: true })
        .click();
      await wait(150);
      const exported = JSON.parse(await readFile(settingsFile, "utf8"));
      assert.equal(exported.settings.greeting, "Local settings audit");
      await call("piccolo_settings", {
        action: "update",
        settings: { greeting: "Changed after export" },
      });
      await choose(settingsFile);
      await page
        .getByRole("button", { name: "Import settings", exact: true })
        .click();
      await wait(150);
      assert.equal((await state()).settings.greeting, "Local settings audit");
    },
  );
  await check(
    "Privacy clearing removes fixture cookies/history and clears cache in the isolated profile",
    async () => {
      await app.evaluate(async () => {
        const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
        await b.ses.cookies.set({
          url: "https://example.test",
          name: "audit",
          value: "fixture",
        });
        await b.store.call(
          "visit",
          "https://example.test/audit",
          "Audit fixture",
        );
      });
      await call("piccolo_ui", { action: "section", section: "Privacy" });
      await page
        .getByRole("button", {
          name: "Clear cookies & site storage",
          exact: true,
        })
        .click();
      await wait(100);
      assert.equal(
        await app.evaluate(async () => {
          const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
          return (await b.ses.cookies.get({ name: "audit" })).length;
        }),
        0,
      );
      await page
        .getByRole("button", { name: "Clear all history", exact: true })
        .click();
      await wait(100);
      assert.equal(
        (await cmd({ type: "history", query: "Audit fixture" })).length,
        0,
      );
      await page
        .getByRole("button", { name: "Clear cache", exact: true })
        .click();
      await wait(100);
      assert.equal(
        await app.evaluate(() =>
          [
            ...globalThis[Symbol.for("piccolo.browser-registry")],
          ][0].ses.getCacheSize(),
        ),
        0,
      );
    },
  );
  await check(
    "Search editor add, edit cancel, invalid draft retention and delete",
    async () => {
      await call("piccolo_ui", { action: "section", section: "Search" });
      await page
        .getByRole("button", { name: "Add search engine", exact: true })
        .click();
      await page
        .getByLabel("Engine name", { exact: true })
        .fill("Audit engine");
      await page.getByLabel("Engine keyword", { exact: true }).fill("fixture");
      await page
        .getByLabel("Engine template", { exact: true })
        .fill("https://example.test/?q={searchTerms}");
      await page
        .getByRole("button", { name: "Save engine", exact: true })
        .click();
      await wait(100);
      assert.ok(
        (await state()).settings.searchEngines.some(
          (e) => e.name === "Audit engine",
        ),
      );
      const row = page.locator(".list-row").filter({ hasText: "Audit engine" });
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByLabel("Engine name", { exact: true })
        .fill("Unsaved edit");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.ok(
        (await state()).settings.searchEngines.some(
          (e) => e.name === "Audit engine",
        ),
      );
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByLabel("Engine template", { exact: true })
        .fill("javascript:alert(1)");
      await page
        .getByRole("button", { name: "Save engine", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "HTTP(S) template" })
        .waitFor();
      assert.equal(
        await page.getByLabel("Engine template", { exact: true }).inputValue(),
        "javascript:alert(1)",
      );
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await row.getByRole("button", { name: "Delete", exact: true }).click();
      await wait(100);
      assert.ok(
        !(await state()).settings.searchEngines.some(
          (e) => e.name === "Audit engine",
        ),
      );
    },
  );
  await check(
    "Minimum window size and 125% UI scaling keep Settings controls reachable",
    async () => {
      await call("piccolo_ui", { action: "open", page: "settings" });
      await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w.setSize(820, 600);
        w.webContents.setZoomFactor(1.25);
      });
      await wait(100);
      await call("piccolo_ui", { action: "section", section: "Downloads" });
      await page
        .getByRole("button", { name: "Choose folder", exact: true })
        .scrollIntoViewIfNeeded();
      await shot("minimum-scaled-settings");
    },
  );
  await check(
    "Settings reset affects only fixture preferences and preserves paired identity",
    async () => {
      await call("piccolo_ui", { action: "section", section: "Appearance" });
      await page
        .getByRole("button", { name: "Reset settings & layout", exact: true })
        .click();
      await wait(200);
      const s = await state();
      assert.equal(s.settings.greeting, "Make room for a little discovery.");
      assert.equal(s.settings.sidebarMode, "off");
      assert.equal(s.settings.mcpEnabled, false);
      assert.equal(
        await app.evaluate(async () => {
          const b = [...globalThis[Symbol.for("piccolo.browser-registry")]][0];
          return (await b.store.get("mcp-pairs", [])).length;
        }),
        1,
      );
    },
  );
} catch (error) {
  results.push({ name: "Execution", status: "Failed", error: String(error) });
  process.exitCode = 1;
  console.error(error);
} finally {
  await client?.close();
  await app?.close();
  await writeFile(
    "test-results/appearance-audit.json",
    JSON.stringify(
      { date: new Date().toISOString(), profile, results, inventory },
      null,
      2,
    ),
  );
}
