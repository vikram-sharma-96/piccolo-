import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import type { State, Command, Bookmark, Visit } from "../shared/model";
import { internal } from "../shared/url";
import { Icon } from "./icons";
import { BrowserMenu } from "./BrowserMenu";
import { NewTab } from "./NewTab";
import { liveDownload } from "../shared/download-policy";
import "./style.css";
const Tools = lazy(() => import("./Tools"));
export function send(c: Command) {
  return window.piccolo.command(c);
}
function App() {
  const [state, setState] = useState<State>();
  const [address, setAddress] = useState("");
  const [editing, setEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { title: string; url: string }[]
  >([]);
  const [menu, setMenu] = useState<string | null>(null);
  const [bookmark, setBookmark] = useState<Bookmark>();
  const [error, setError] = useState("");
  const [find, setFind] = useState<string | null>(null);
  const [matches, setMatches] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!bookmark) return;
    const previous = document.activeElement as HTMLElement;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(".dialog input")?.focus(),
    );
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(".dialog input,.dialog button"),
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [!!bookmark]);
  const previousTabs = useRef(
    new Map<string, { rect: DOMRect; clone: HTMLElement }>(),
  );
  const tabAnimations = useRef<{ animation: Animation; ghost?: HTMLElement }[]>(
    [],
  );
  useLayoutEffect(() => {
    for (const entry of tabAnimations.current) {
      entry.animation.cancel();
      entry.ghost?.remove();
    }
    tabAnimations.current = [];
    const enabled =
      !!state?.settings.motion &&
      !state.settings.lowPower &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { rect: DOMRect; clone: HTMLElement }>();
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(".tab[data-tab-id]"),
    )) {
      const id = element.dataset.tabId!,
        rect = element.getBoundingClientRect(),
        old = previousTabs.current.get(id);
      if (enabled && old && Math.abs(old.rect.left - rect.left) > 1) {
        const animation = element.animate(
          [
            { transform: `translateX(${old.rect.left - rect.left}px)` },
            { transform: "translateX(0)" },
          ],
          { duration: 150, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
        tabAnimations.current.push({ animation });
      }
      next.set(id, { rect, clone: element.cloneNode(true) as HTMLElement });
    }
    if (enabled)
      for (const [id, old] of previousTabs.current)
        if (!next.has(id)) {
          const ghost = old.clone;
          ghost.inert = true;
          ghost.setAttribute("aria-hidden", "true");
          ghost.classList.add("tab-ghost");
          Object.assign(ghost.style, {
            position: "fixed",
            left: old.rect.left + "px",
            top: old.rect.top + "px",
            width: old.rect.width + "px",
            height: old.rect.height + "px",
            pointerEvents: "none",
            zIndex: "25",
            margin: "0",
          });
          document.querySelector(".tabs-bar")?.append(ghost);
          const animation = ghost.animate(
            [
              { opacity: 1, transform: "translateY(0)" },
              { opacity: 0, transform: "translateY(-4px)" },
            ],
            { duration: 100 },
          );
          tabAnimations.current.push({ animation, ghost });
          void animation.finished.then(
            () => ghost.remove(),
            () => ghost.remove(),
          );
        }
    previousTabs.current = next;
  }, [
    state?.tabs.map((t) => t.id).join(","),
    state?.settings.motion,
    state?.settings.lowPower,
  ]);
  const act = async (c: Command) => {
    try {
      return await send(c);
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
    }
  };
  useEffect(() => {
    void window.piccolo.state().then(setState);
    const a = window.piccolo.subscribe(setState),
      b = window.piccolo.onFocus(() => {
        setEditing(true);
        addressRef.current?.focus();
        addressRef.current?.select();
      }),
      c = window.piccolo.onFind((r) =>
        setMatches(`${r.activeMatchOrdinal} / ${r.matches}`),
      );
    const d = window.piccolo.onFindFocus(() => {
      setFind("");
      setTimeout(() => findRef.current?.focus(), 0);
    });
    return () => {
      a();
      b();
      c();
      d();
    };
  }, []);
  const active = state?.tabs.find((t) => t.id === state.activeId);
  useEffect(() => {
    if (!editing) setAddress(active && !internal(active.url) ? active.url : "");
  }, [active?.url, editing]);
  useEffect(() => {
    setFind(null);
    setMenu(null);
    setEditing(false);
  }, [state?.activeId]);
  useEffect(() => {
    void act({ type: "overlay", open: !!menu || !!bookmark || editing });
  }, [menu, bookmark, editing]);
  useEffect(() => {
    if (!editing || !state) return;
    const timer = setTimeout(() => {
      void act({ type: "history", query: address }).then((rows) => {
        const h = (rows || []) as Visit[];
        const seen = new Set<string>();
        setSuggestions(
          [...state.bookmarks, ...h]
            .filter(
              (v) =>
                (v.url + " " + v.title)
                  .toLowerCase()
                  .includes(address.toLowerCase()) &&
                !seen.has(v.url) &&
                !!seen.add(v.url),
            )
            .slice(0, 7),
        );
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [address, editing]);
  useEffect(() => {
    if (!state) return;
    const s = state.settings;
    document.documentElement.dataset.theme = state.appearance;
    document.documentElement.style.setProperty("--accent", s.accent);
    const rgb = s.accent
      .slice(1)
      .match(/../g)!
      .map((v) => {
        const c = parseInt(v, 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    document.documentElement.style.setProperty(
      "--on-accent",
      luminance > 0.179 ? "#000000" : "#ffffff",
    );
    document.documentElement.style.setProperty(
      "--rail",
      `${s.sidebarMode === "off" ? 0 : s.sidebarMode === "auto" && !state.sidebarOpen ? 4 : s.sidebarWidth}px`,
    );
    document.documentElement.dataset.density = s.density;
    document.documentElement.dataset.motion = String(s.motion && !s.lowPower);
    document.documentElement.dataset.glass = String(s.transparency);
  }, [state?.settings, state?.sidebarOpen, state?.appearance]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setBookmark(undefined);
        setEditing(false);
        if (find !== null) {
          setFind(null);
          void act({
            type: "find",
            text: "",
            forward: true,
            next: false,
            close: true,
          });
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [find]);
  if (!state || !active) return <div className="boot">Opening Piccolo…</div>;
  const navigate = (input: string) => {
    setEditing(false);
    setMenu(null);
    void act({ type: "navigate", input });
  };
  const action = (action: Extract<Command, { type: "action" }>["action"]) =>
    void act({ type: "action", action });
  const page = (name: string) => {
    if (name === "downloads" && active.url !== "piccolo://downloads") {
      setMenu(null);
      const existing = state.tabs.find((t) => t.url === "piccolo://downloads");
      void act(
        existing
          ? { type: "tab", action: "activate", id: existing.id }
          : { type: "new-tab", url: "piccolo://downloads" },
      );
    } else navigate(`piccolo://${name}`);
  };
  const addBookmark = () => {
    if (internal(active.url)) return;
    setBookmark(
      state.bookmarks.find((b) => b.url === active.url) || {
        id: "",
        title: active.title,
        url: active.url,
        folder: "Favorites",
        position: state.bookmarks.length,
      },
    );
  };
  const closeMenus = () => {
    setMenu(null);
    setEditing(false);
    setBookmark(undefined);
  };
  return (
    <div className="app">
      <header className="tabs-bar">
        <div className="brand-mark" title="Piccolo">
          p<span>•</span>
        </div>
        <div className="tabs" role="tablist" aria-label="Browser tabs">
          {state.tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === state.activeId}
              tabIndex={0}
              data-tab-id={t.id}
              className={`tab ${t.id === state.activeId ? "active" : ""} ${t.pinned ? "pinned" : ""}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("tab", t.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void act({
                  type: "reorder",
                  id: e.dataTransfer.getData("tab"),
                  before: t.id,
                });
              }}
              onClick={() =>
                void act({ type: "tab", action: "activate", id: t.id })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  void act({ type: "tab", action: "activate", id: t.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(t.id);
              }}
              title={t.url}
            >
              {t.loading ? (
                <span className="spinner" />
              ) : t.discarded ? (
                <Icon name="sleep" size={14} />
              ) : t.favicon ? (
                <img
                  alt=""
                  src={t.favicon}
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              ) : (
                <Icon name={internal(t.url) ? "sun" : "globe"} size={14} />
              )}
              <span>{t.title === "newtab" ? "New tab" : t.title}</span>
              {t.audible && <Icon name="volume" size={12} />}
              <button
                aria-label={`Close ${t.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void act({ type: "tab", action: "close", id: t.id });
                }}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="new-tab icon-button"
          title="New tab (Ctrl+T)"
          onClick={() => {
            void act({ type: "new-tab" });
          }}
        >
          <Icon name="plus" />
        </button>
        {state.private && <span className="private-badge">Private</span>}
      </header>
      <div className="toolbar">
        <button
          className="icon-button"
          title="Back (Alt+Left)"
          disabled={!active.canGoBack}
          onClick={() => action("back")}
        >
          <Icon name="back" />
        </button>
        <button
          className="icon-button"
          title="Forward (Alt+Right)"
          disabled={!active.canGoForward}
          onClick={() => action("forward")}
        >
          <Icon name="forward" />
        </button>
        <button
          className="icon-button"
          title={active.loading ? "Stop loading" : "Reload"}
          onClick={() => action(active.loading ? "stop" : "reload")}
        >
          <Icon name={active.loading ? "close" : "reload"} />
        </button>
        <button
          className="icon-button"
          title="Home"
          onClick={() => action("home")}
        >
          <Icon name="home" />
        </button>
        <form
          className={`address ${editing ? "focused" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
            addressRef.current?.blur();
          }}
        >
          <Icon
            name={active.url.startsWith("https:") ? "shield" : "search"}
            size={16}
          />
          <input
            aria-label="Address or search"
            ref={addressRef}
            value={address}
            spellCheck={false}
            placeholder="Search the web or enter an address"
            onFocus={() => setEditing(true)}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                addressRef.current?.blur();
              }
            }}
          />
          {!internal(active.url) && (
            <button
              type="button"
              className="icon-button"
              title="Bookmark this page"
              onClick={addBookmark}
            >
              <Icon name="star" size={16} />
            </button>
          )}
        </form>
        <button
          className="icon-button"
          title="Downloads"
          aria-label="Downloads"
          onClick={() => page("downloads")}
        >
          <Icon name="download" />
          {state.downloads.some((d) => liveDownload(d.status)) && (
            <span className="download-count" aria-label="Active downloads">
              {state.downloads.filter((d) => liveDownload(d.status)).length}
            </span>
          )}
        </button>
        <button
          className="icon-button"
          title="Browser menu"
          onClick={() => setMenu(menu === "browser" ? null : "browser")}
        >
          <Icon name="more" />
        </button>
      </div>
      {state.settings.bookmarksBar && (
        <div className="bookmarks-bar">
          {state.bookmarks.slice(0, 12).map((b) => (
            <button key={b.id} onClick={() => navigate(b.url)}>
              <Icon name="star" size={12} />
              {b.title}
            </button>
          ))}
          {!state.bookmarks.length && (
            <span>Add bookmarks with the star in the address bar.</span>
          )}
        </div>
      )}
      {find !== null && (
        <div className="find-bar">
          <Icon name="search" size={15} />
          <input
            ref={findRef}
            autoFocus
            aria-label="Find in page"
            placeholder="Find in page"
            value={find}
            onChange={(e) => {
              setFind(e.target.value);
              void act({
                type: "find",
                text: e.target.value,
                forward: true,
                next: false,
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                void act({
                  type: "find",
                  text: find,
                  forward: !e.shiftKey,
                  next: true,
                });
            }}
          />
          <span>{matches}</span>
          <button
            onClick={() =>
              void act({ type: "find", text: find, forward: false, next: true })
            }
          >
            ↑
          </button>
          <button
            onClick={() =>
              void act({ type: "find", text: find, forward: true, next: true })
            }
          >
            ↓
          </button>
          <button
            title="Close find"
            onClick={() => {
              setFind(null);
              void act({
                type: "find",
                text: "",
                forward: true,
                next: false,
                close: true,
              });
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="workspace">
        {state.settings.sidebarMode !== "off" && (
          <aside
            className={`rail ${state.settings.sidebarMode === "auto" ? "auto" : ""} ${state.sidebarOpen ? "revealed" : ""}`}
            onMouseEnter={() => {
              if (state.settings.sidebarMode === "auto")
                void act({ type: "sidebar", open: true });
            }}
            onMouseLeave={() => {
              if (state.settings.sidebarMode === "auto")
                void act({ type: "sidebar", open: false });
            }}
          >
            <div>
              {[
                ["newtab", "home"],
                ["bookmarks", "star"],
                ["history", "history"],
                ["downloads", "download"],
              ].map(([name, icon]) => (
                <button
                  key={name}
                  className={`rail-button ${active.url === `piccolo://${name}` ? "selected" : ""}`}
                  title={name}
                  onClick={() => page(name)}
                >
                  <Icon name={icon} />
                </button>
              ))}
              <div className="rail-separator" />
              <button
                className="rail-button"
                title="Workspace foundation"
                onClick={() => page("workspaces")}
              >
                <Icon name="grid" />
              </button>
            </div>
            <div>
              <button
                className="rail-button"
                title="Performance"
                onClick={() => page("performance")}
              >
                <Icon name="chart" />
              </button>
              <button
                className="rail-button"
                title="Settings"
                onClick={() => page("settings")}
              >
                <Icon name="settings" />
              </button>
              <span className="rail-end">P</span>
            </div>
          </aside>
        )}
        <main className="content">
          {active.error ? (
            <div className="error-page">
              <Icon name="globe" size={50} />
              <h1>A small interruption.</h1>
              <p>{active.error}</p>
              <p className="muted">{active.url}</p>
              <button className="primary" onClick={() => action("reload")}>
                Try again
              </button>
            </div>
          ) : internal(active.url) ? (
            active.url === "piccolo://newtab" ? (
              <NewTab state={state} act={act} navigate={navigate} />
            ) : (
              <Suspense fallback={<div className="page">Opening…</div>}>
                <Tools
                  page={active.url.split("://")[1]}
                  state={state}
                  act={act}
                  navigate={navigate}
                />
              </Suspense>
            )
          ) : null}
        </main>
      </div>
      {(menu || editing || bookmark) && (
        <div className="overlay-backdrop" onClick={closeMenus} />
      )}
      {editing && (
        <div className="suggestions">
          <div className="eyebrow">
            {address ? "CONTINUE EXPLORING" : "HISTORY & BOOKMARKS"}
          </div>
          {suggestions.map((s) => (
            <button key={s.url} onClick={() => navigate(s.url)}>
              <Icon name="history" size={16} />
              <span>
                {s.title}
                <small>{s.url}</small>
              </span>
              <Icon name="arrow" size={15} />
            </button>
          ))}
          <p>
            Press Enter to{" "}
            {address.includes(".") ? "open address" : "search the web"}. Escape
            to return.
          </p>
        </div>
      )}
      {menu === "browser" ? (
        <BrowserMenu
          state={state}
          act={act}
          close={() => {
            setMenu(null);
            document
              .querySelector<HTMLButtonElement>('[title="Browser menu"]')
              ?.focus();
          }}
          bookmark={addBookmark}
          find={() => {
            setFind("");
            void act({ type: "find", text: "", forward: true, next: false });
            setTimeout(() => findRef.current?.focus(), 0);
          }}
        />
      ) : (
        menu && (
          <div className="menu">
            <div className="eyebrow">
              {menu === "browser" ? "PICCOLO" : "TAB OPTIONS"}
            </div>
            {menu === "browser" ? (
              <>
                {[
                  ["New tab", "new-tab"],
                  ["New window", "window"],
                  ["New private window", "private"],
                  ["Reopen closed tab", "reopen"],
                  ["Copy page address", "copy-url"],
                  ["Fullscreen", "fullscreen"],
                  ["Developer tools", "devtools"],
                ].map(([label, a]) => (
                  <button
                    key={a}
                    onClick={() => {
                      setMenu(null);
                      if (a === "new-tab") void act({ type: "new-tab" });
                      else action(a as any);
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setMenu(null);
                    setFind("");
                    void act({
                      type: "find",
                      text: "",
                      forward: true,
                      next: false,
                    });
                    setTimeout(() => findRef.current?.focus(), 0);
                  }}
                >
                  Find in page <kbd>Ctrl F</kbd>
                </button>
                <div className="zoom">
                  <button onClick={() => action("zoom-out")}>−</button>
                  <button onClick={() => action("zoom-reset")}>
                    {Math.round(active.zoom * 100)}%
                  </button>
                  <button onClick={() => action("zoom-in")}>+</button>
                </div>
                <button
                  onClick={() => {
                    setMenu(null);
                    page("settings");
                  }}
                >
                  Settings
                </button>
              </>
            ) : (
              <>
                {(["pin", "duplicate", "discard", "close"] as const).map(
                  (a) => (
                    <button
                      key={a}
                      onClick={() => {
                        setMenu(null);
                        void act({ type: "tab", action: a, id: menu });
                      }}
                    >
                      {a === "pin"
                        ? state.tabs.find((t) => t.id === menu)?.pinned
                          ? "Unpin"
                          : "Pin"
                        : a === "discard"
                          ? "Sleep tab (reloads on return)"
                          : a[0].toUpperCase() + a.slice(1)}
                    </button>
                  ),
                )}
              </>
            )}
          </div>
        )
      )}
      {bookmark && (
        <form
          className="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Save bookmark"
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              type: "bookmark",
              action: "save",
              value: { ...bookmark, id: bookmark.id || undefined },
            });
            setBookmark(undefined);
          }}
        >
          <div className="eyebrow">SAVE FOR LATER</div>
          <h2>Bookmark this page</h2>
          <label>
            Name
            <input
              value={bookmark.title}
              onChange={(e) =>
                setBookmark({ ...bookmark, title: e.target.value })
              }
            />
          </label>
          <label>
            Folder
            <input
              value={bookmark.folder}
              onChange={(e) =>
                setBookmark({ ...bookmark, folder: e.target.value })
              }
            />
          </label>
          <div className="row">
            <button type="button" onClick={() => setBookmark(undefined)}>
              Cancel
            </button>
            <button className="primary">Save bookmark</button>
          </div>
        </form>
      )}
      {error && (
        <div role="alert" className="toast">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
