import { useEffect, useRef, useState } from "react";
import type { State, Command } from "../shared/model";
import { Icon } from "./icons";
export function BrowserMenu({
  state,
  act,
  close,
  bookmark,
  find,
}: {
  state: State;
  act: (c: Command) => Promise<unknown>;
  close: () => void;
  bookmark: () => void;
  find: () => void;
}) {
  const [sub, setSub] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const s = state.settings;
  const active = state.tabs.find((t) => t.id === state.activeId)!;
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [sub]);
  const run = (c: Command) => {
    close();
    void act(c);
  };
  const page = (name: string) => {
    const existing = state.tabs.find((t) => t.url === `piccolo://${name}`);
    if (name === "downloads")
      run(
        existing
          ? { type: "tab", action: "activate", id: existing.id }
          : { type: "new-tab", url: "piccolo://downloads" },
      );
    else run({ type: "navigate", input: `piccolo://${name}` });
  };
  const item = (
    label: string,
    click: () => void,
    key = "",
    checked?: boolean,
  ) => (
    <button
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={click}
    >
      <span>
        {checked ? "✓ " : ""}
        {label}
      </span>
      <kbd>{key}</kbd>
    </button>
  );
  const group = () => <div className="menu-separator" role="separator" />;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Piccolo browser menu"
      className="menu browser-menu"
      onKeyDown={(e) => {
        const buttons = Array.from(
          ref.current!.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(e.key)) {
          e.preventDefault();
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (i +
                    (e.key === "ArrowUp" || e.shiftKey ? -1 : 1) +
                    buttons.length) %
                  buttons.length
          ]?.focus();
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          (document.activeElement as HTMLButtonElement)?.click();
        }
        if (e.key === "ArrowLeft" || e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (sub) setSub("");
          else close();
        }
      }}
    >
      <div className="menu-title">
        {sub ? (
          <button role="menuitem" onClick={() => setSub("")}>
            ← {sub}
          </button>
        ) : (
          <span>Piccolo {state.private ? "· Private" : ""}</span>
        )}
      </div>
      {!sub && (
        <>
          {item("New tab", () => run({ type: "new-tab" }), "Ctrl+T")}
          {item(
            "New window",
            () => run({ type: "action", action: "window" }),
            "Ctrl+N",
          )}
          {item(
            "New private window",
            () => run({ type: "action", action: "private" }),
            "Ctrl+Shift+N",
          )}
          {group()}
          {item("History", () => page("history"))}
          {item("Bookmarks", () => setSub("Bookmarks"), "›")}
          {item("Downloads", () => page("downloads"), "Ctrl+J")}
          {item("Passwords and autofill", () => page("passwords"))}
          {item("Extensions", () => page("extensions"))}
          {item("VPN and proxy connections", () => page("connections"))}
          {group()}
          {item("Delete browsing data", () => page("privacy"))}
          <div className="menu-zoom">
            <span>Zoom</span>
            {item(
              "−",
              () => void act({ type: "action", action: "zoom-out" }),
              "",
            )}
            {item(
              `${Math.round(active.zoom * 100)}%`,
              () => void act({ type: "action", action: "zoom-reset" }),
            )}
            {item("+", () => void act({ type: "action", action: "zoom-in" }))}
            <button
              role="menuitem"
              title="Fullscreen (F11)"
              onClick={() => run({ type: "action", action: "fullscreen" })}
            >
              <Icon name="external" size={15} />
            </button>
          </div>
          {item(
            "Print…",
            () => run({ type: "action", action: "print" }),
            "Ctrl+P",
          )}
          {item(
            "Find in page…",
            () => {
              close();
              find();
            },
            "Ctrl+F",
          )}
          {item("Save and share", () => setSub("Save and share"), "›")}
          {group()}
          {item("More tools", () => setSub("More tools"), "›")}
          {item('Agent workspace',()=>page('agents'))}
          {item("Sidebar", () => setSub("Sidebar"), "›")}
          {item("MCP Settings", () => page("integrations"))}
          {item("Performance", () => page("performance"))}
          {item("Settings", () => page("settings"))}
          {item("About Piccolo", () => page("about"))}
          {group()}
          {item("Exit", () => run({ type: "action", action: "quit" }))}
        </>
      )}
      {sub === "Bookmarks" && (
        <>
          {item("Bookmark this page", () => {
            close();
            bookmark();
          })}
          {item(
            "Show bookmarks bar",
            () =>
              void act({
                type: "settings",
                value: { ...s, bookmarksBar: !s.bookmarksBar },
              }),
            "",
            s.bookmarksBar,
          )}
          {item("Bookmark manager", () => page("bookmarks"))}
        </>
      )}
      {sub === "Save and share" && (
        <>
          {item(
            "Save page as web archive…",
            () => run({ type: "action", action: "save-page" }),
            "Ctrl+S",
          )}
          {item("Copy page URL", () =>
            run({ type: "action", action: "copy-url" }),
          )}
          <p className="muted">
            Use the copied URL in your preferred sharing app.
          </p>
        </>
      )}
      {sub === "More tools" && (
        <>
          {item(
            "Developer tools — webpage",
            () => run({ type: "action", action: "devtools" }),
            "F12 / Ctrl+Shift+I",
          )}
          {item("Debug browser chrome", () =>
            run({ type: "action", action: "chrome-devtools" }),
          )}
          {item(
            "Reopen closed tab",
            () => run({ type: "action", action: "reopen" }),
            "Ctrl+Shift+T",
          )}
          {item("Workspace status", () => page("workspaces"))}
          {item("Workspace controls", () => run({type:'workspace',action:'manage'}))}
        </>
      )}
      {sub === "Sidebar" &&
        (["off", "auto", "on"] as const).map((mode) =>
          item(
            mode === "off" ? "Off" : mode === "auto" ? "Auto-hide" : "On",
            () =>
              void act({
                type: "settings",
                value: { ...s, sidebarMode: mode },
              }),
            "",
            s.sidebarMode === mode,
          ),
        )}
    </div>
  );
}
