import { useState, useEffect, lazy, Suspense } from "react";
import type {
  State,
  Settings,
  Command,
  Visit,
  Bookmark,
} from "../shared/model";
import { SearchSettings } from "./SearchSettings";
import { liveDownload } from "../shared/download-policy";
const OptionalPages = lazy(() => import("./OptionalPages"));
const CodingWorkspace = lazy(() => import("./CodingWorkspace"));
import { Icon } from "./icons";
type Props = {
  page: string;
  state: State;
  act: (c: Command) => Promise<unknown>;
  navigate: (url: string) => void;
};
export default function Tools({ page, state, act, navigate }: Props) {
  const [dailyKey, setDailyKey] = useState("");
  const [dailyMessage, setDailyMessage] = useState("");
  const [query, setQuery] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [metrics, setMetrics] = useState<any>();
  const [edit, setEdit] = useState<Bookmark>();
  const [section, setSection] = useState("Appearance");
  const [range, setRange] = useState("all");
  const [downloadView, setDownloadView] = useState("active");
  const s = state.settings;
  const save = (patch: Partial<Settings>) =>
    void act({ type: "settings", value: { ...s, ...patch } });
  const history = () =>
    void act({ type: "history", query }).then((v) =>
      setVisits((v || []) as Visit[]),
    );
  useEffect(() => {
    if (page !== "history") return;
    const timer = setTimeout(history, 180);
    return () => clearTimeout(timer);
  }, [page, query]);
  useEffect(() => {
    if (page === "performance") void act({ type: "metrics" }).then(setMetrics);
  }, [page]);
  useEffect(() => {
    if (page === "privacy") setSection("Privacy");
    if (page === "about") setSection("About");
    setQuery("");
    setEdit(undefined);
  }, [page]);
  const select = (
    label: string,
    value: string,
    options: string[],
    change: (s: string) => void,
  ) => (
    <label className="setting">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (
    label: string,
    value: boolean,
    change: (v: boolean) => void,
    detail?: string,
  ) => (
    <label className="setting">
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={value}
        onChange={(e) => change(e.target.checked)}
      />
    </label>
  );
  if (page === "workspaces")
    return (
      <Suspense
        fallback={<div className="page">Opening workspace controls…</div>}
      >
        <CodingWorkspace state={state} act={act} />
      </Suspense>
    );
  const heading: Record<string, [string, string]> = {
    history: ["Your trail", "Places you have been. Ready to revisit."],
    bookmarks: [
      "Worth keeping",
      "Your collection of useful corners of the web.",
    ],
    downloads: ["Downloads", "Files you chose to bring with you."],
    settings: ["Settings", "Appearance, browsing and local connections."],
    performance: [
      "Under the hood",
      "Measured process information, when you ask for it.",
    ],
    workspaces: ["Room to grow", "A secure foundation for what comes next."],
    privacy: ["Browsing data", "Choose which local data to clear."],
    about: ["About Piccolo", "Your personal browser."],
  };
  if (["extensions", "connections", "passwords", "integrations"].includes(page))
    return (
      <Suspense fallback={<div className="page">Opening…</div>}>
        <OptionalPages
          page={page}
          state={state}
          act={act}
          navigate={navigate}
        />
      </Suspense>
    );
  return (
    <div className="page">
      <div className="eyebrow">PICCOLO / {page.toUpperCase()}</div>
      <h1>{heading[page]?.[0]}</h1>
      <p className="page-subtitle">{heading[page]?.[1]}</p>
      {page === "history" && (
        <>
          <div className="page-toolbar">
            <input
              aria-label="Search history"
              placeholder="Search history"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="History time range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="all">All time</option>
              <option value="hour">Last hour</option>
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
            </select>
            <button
              onClick={() =>
                void act({
                  type: "clear",
                  target: "history",
                  since:
                    range === "all"
                      ? 0
                      : Date.now() -
                        ({ hour: 3600000, day: 86400000, week: 604800000 }[
                          range
                        ] || 0),
                }).then(history)
              }
            >
              Clear selected range
            </button>
          </div>
          {state.private && (
            <div className="notice">
              Private windows do not record or query browsing history. Downloads
              and exported files can remain on disk.
            </div>
          )}
          {visits.map((v, i) => (
            <div key={v.id}>
              {(i === 0 ||
                new Date(v.time).toDateString() !==
                  new Date(visits[i - 1].time).toDateString()) && (
                <h3>
                  {new Date(v.time).toLocaleDateString([], {
                    dateStyle: "full",
                  })}
                </h3>
              )}
              <div className="list-row">
                <Icon name="history" />
                <button className="entry" onClick={() => navigate(v.url)}>
                  {v.title}
                  <small>{v.url}</small>
                </button>
                <time>
                  {new Date(v.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <button
                  className="icon-button"
                  title="Delete visit"
                  onClick={() =>
                    void act({ type: "history-delete", id: v.id }).then(history)
                  }
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
          {!visits.length && (
            <div className="empty">
              <Icon name="history" size={36} />
              <h3>No visits here yet.</h3>
              <p>Your next discovery is a search away.</p>
            </div>
          )}
          <p className="muted">Showing up to 300 recent matching visits.</p>
        </>
      )}
      {page === "bookmarks" && (
        <>
          <div className="page-toolbar">
            <input
              aria-label="Search bookmarks"
              placeholder="Search titles, URLs or folders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              onClick={() =>
                void act({ type: "bookmarks-file", action: "import" })
              }
            >
              Import HTML
            </button>
            <button
              onClick={() =>
                void act({ type: "bookmarks-file", action: "export" })
              }
            >
              Export HTML
            </button>
            <button
              className="primary"
              onClick={() =>
                setEdit({
                  id: "",
                  title: "",
                  url: "https://",
                  folder: "Favorites",
                  position: state.bookmarks.length,
                })
              }
            >
              Add bookmark
            </button>
          </div>
          {edit && (
            <form
              className="edit-bookmark"
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  type: "bookmark",
                  action: "save",
                  value: { ...edit, id: edit.id || undefined },
                }).then(() => setEdit(undefined));
              }}
            >
              <input
                aria-label="Bookmark title"
                placeholder="Name"
                required
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
              <input
                aria-label="Bookmark URL"
                placeholder="https://"
                required
                value={edit.url}
                onChange={(e) => setEdit({ ...edit, url: e.target.value })}
              />
              <input
                aria-label="Bookmark folder"
                placeholder="Folder"
                value={edit.folder}
                onChange={(e) => setEdit({ ...edit, folder: e.target.value })}
              />
              <button className="primary">Save</button>
              <button type="button" onClick={() => setEdit(undefined)}>
                Cancel
              </button>
            </form>
          )}
          {[...new Set(state.bookmarks.map((b) => b.folder))].map((folder) => (
            <section key={folder}>
              <h3 className="row">
                <Icon name="folder" size={16} />
                {folder || "Unfiled"}
              </h3>
              {state.bookmarks
                .filter(
                  (b) =>
                    b.folder === folder &&
                    (b.title + b.url + b.folder)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .sort((a, b) => a.position - b.position)
                .map((b, i) => (
                  <div className="list-row" key={b.id}>
                    <Icon name="star" />
                    <button className="entry" onClick={() => navigate(b.url)}>
                      {b.title}
                      <small>{b.url}</small>
                    </button>
                    <button
                      title="Move earlier"
                      onClick={() => {
                        const prev = state.bookmarks
                          .filter((x) => x.folder === folder)
                          .sort((a, b) => a.position - b.position)[i - 1];
                        if (prev) {
                          void (async () => {
                            await act({
                              type: "bookmark",
                              action: "save",
                              value: { ...prev, position: b.position },
                            });
                            await act({
                              type: "bookmark",
                              action: "save",
                              value: { ...b, position: prev.position },
                            });
                          })();
                        }
                      }}
                    >
                      ↑
                    </button>
                    <button onClick={() => setEdit(b)}>Edit</button>
                    <button
                      className="icon-button"
                      title="Remove bookmark"
                      onClick={() =>
                        void act({
                          type: "bookmark",
                          action: "delete",
                          value: b,
                        })
                      }
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                ))}
            </section>
          ))}
          {!state.bookmarks.length && (
            <div className="empty">
              <Icon name="star" size={36} />
              <h3>A home for your favorites.</h3>
              <p>Use the star in the address bar to save a page.</p>
            </div>
          )}
        </>
      )}
      {page === "downloads" && (
        <>
          <div className="page-toolbar">
            <label>
              Show downloads{" "}
              <select
                aria-label="Download view"
                value={downloadView}
                onChange={(e) => setDownloadView(e.target.value)}
              >
                <option value="active">Active &amp; awaiting approval</option>
                <option value="history">Download history</option>
              </select>
            </label>
            <span aria-live="polite">
              {state.downloads.filter((d) => liveDownload(d.status)).length}{" "}
              active or waiting
            </span>
            <button onClick={() => void act({ type: "downloads-clear" })}>
              Clear download history
            </button>
          </div>
          {state.private && (
            <div className="notice">
              Download records in this window are temporary. Saved files remain
              on disk.
            </div>
          )}
          {state.downloads
            .filter((d) =>
              downloadView === "active"
                ? liveDownload(d.status)
                : !liveDownload(d.status),
            )
            .slice(0, 100)
            .map((d) => (
              <div className="download-card" key={d.id}>
                <Icon name="download" size={26} />
                <div className="entry">
                  <strong>{d.name}</strong>
                  <small>{d.path || "Waiting for a destination…"}</small>
                  <small title={d.url}>From {d.url}</small>
                  <small>
                    Initiating site:{" "}
                    {d.initiator || "Unavailable in older records"}
                  </small>
                  {d.pageURL && <small>Initiating page: {d.pageURL}</small>}
                  {d.mime && <small>Type: {d.mime}</small>}
                  {d.risk && (
                    <p className="warning-text">
                      {d.risk}. Review this file carefully; it has not been
                      scanned.
                    </p>
                  )}
                  {d.error && <p className="warning-text">{d.error}</p>}
                  <small>
                    {d.status === "cancelled"
                      ? "Canceled"
                      : d.status === "awaiting-approval"
                        ? "Awaiting your approval"
                        : d.status}{" "}
                    · {(d.received / 1048576).toFixed(2)} MB
                    {d.total > 0
                      ? ` / ${(d.total / 1048576).toFixed(2)} MB`
                      : ""}
                  </small>
                  <small>
                    {d.status === "progressing"
                      ? d.speed
                        ? `${((d.speed || 0) / 1024).toFixed(1)} KiB/s`
                        : "Waiting for data…"
                      : ""}
                    {d.eta != null && d.status === "progressing"
                      ? ` · ~${Math.ceil(d.eta)} s remaining`
                      : ""}
                    {d.total <= 0 ? " · Size unknown" : ""}
                  </small>
                  {d.status === "progressing" && (
                    <progress
                      aria-label={`Progress for ${d.name}`}
                      max={d.total || 1}
                      value={d.received}
                    />
                  )}
                </div>
                <div className="row">
                  {d.status === "awaiting-approval" && (
                    <button
                      className="primary"
                      onClick={() =>
                        void act({
                          type: "download",
                          id: d.id,
                          action: "approve",
                        })
                      }
                    >
                      Allow download
                    </button>
                  )}
                  {["awaiting-approval", "approving"].includes(d.status) && (
                    <button
                      onClick={() =>
                        void act({
                          type: "download",
                          id: d.id,
                          action: "cancel",
                        })
                      }
                    >
                      Cancel
                    </button>
                  )}
                  {d.status === "blocked" &&
                    d.initiator?.startsWith("http") && (
                      <button
                        onClick={() =>
                          void act({
                            type: "download-multiple",
                            origin: d.initiator!,
                          })
                        }
                      >
                        Review multiple-download permission…
                      </button>
                    )}
                  {!liveDownload(d.status) && (
                    <button
                      onClick={() =>
                        void act({
                          type: "download",
                          id: d.id,
                          action: "remove",
                        })
                      }
                    >
                      Remove record
                    </button>
                  )}
                  {["cancelled", "interrupted"].includes(d.status) && (
                    <button
                      onClick={() =>
                        void act({
                          type: "download",
                          id: d.id,
                          action: "retry",
                        })
                      }
                    >
                      Retry from start
                    </button>
                  )}
                  {["progressing", "paused", "interrupted"].includes(
                    d.status,
                  ) && (
                    <>
                      {d.status !== "interrupted" && (
                        <button
                          onClick={() =>
                            void act({
                              type: "download",
                              id: d.id,
                              action:
                                d.status === "paused" ? "resume" : "pause",
                            })
                          }
                        >
                          {d.status === "paused" ? "Resume" : "Pause"}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          void act({
                            type: "download",
                            id: d.id,
                            action: "cancel",
                          })
                        }
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  {d.status === "completed" && (
                    <>
                      <button
                        onClick={() =>
                          void act({
                            type: "download",
                            id: d.id,
                            action: "reveal",
                          })
                        }
                      >
                        Show in folder
                      </button>
                      <button
                        onClick={() =>
                          void act({
                            type: "download",
                            id: d.id,
                            action: "open",
                          })
                        }
                      >
                        Open
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          {!state.downloads.some((d) =>
            downloadView === "active"
              ? liveDownload(d.status)
              : !liveDownload(d.status),
          ) && (
            <div className="empty">
              <Icon name="download" size={36} />
              <h3>
                {downloadView === "active"
                  ? "No active downloads"
                  : "No download history"}
              </h3>
              <p>
                Canceled files stay out of Active. Removing history never
                deletes completed files.
              </p>
            </div>
          )}
          <p className="muted">
            Downloads interrupted by a restart cannot be resumed. Downloaded
            files never open automatically.
          </p>
        </>
      )}
      {["settings", "privacy", "about"].includes(page) && (
        <div className="settings-layout">
          <nav className="settings-nav">
            {[
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
            ].map((name) => (
              <button
                key={name}
                className={section === name ? "chosen" : ""}
                aria-current={section === name ? "page" : undefined}
                onClick={() => setSection(name)}
              >
                {name}
              </button>
            ))}
            <hr />
            {[
              ["Extensions", "extensions"],
              ["Passwords & autofill", "passwords"],
              ["VPN & proxy", "connections"],
            ].map(([label, page]) => (
              <button key={page} onClick={() => navigate(`piccolo://${page}`)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-panel settings-content" key={section}>
            <h2>{section}</h2>
            {section === "MCP" && (
              <>
                <p>
                  Pair local AI clients once, inspect connections and revoke
                  browser permissions in MCP Settings. Access to private windows
                  is a separate permission.
                </p>
                <button onClick={() => navigate("piccolo://integrations")}>
                  Open MCP Settings
                </button>
                <p className="muted">
                  {s.mcpEnabled
                    ? "MCP starts automatically with Piccolo."
                    : "MCP is disabled."}
                </p>
              </>
            )}
            {state.private && (
              <div className="notice">
                Changes in this private window are temporary. Imported or
                exported files remain on disk.
              </div>
            )}
            {section === "Appearance" && (
              <>
                {select(
                  "Theme",
                  s.theme,
                  ["dark", "light", "system"],
                  (theme) => save({ theme: theme as Settings["theme"] }),
                )}
                <label className="setting">
                  <span>Accent color</span>
                  <input
                    aria-label="Accent color"
                    type="color"
                    value={s.accent}
                    onChange={(e) => save({ accent: e.target.value })}
                  />
                </label>
                {select(
                  "Sidebar mode",
                  s.sidebarMode,
                  ["off", "auto", "on"],
                  (sidebarMode) =>
                    save({
                      sidebarMode: sidebarMode as Settings["sidebarMode"],
                    }),
                )}
                {select(
                  "Density",
                  s.density,
                  ["compact", "comfortable"],
                  (density) =>
                    save({ density: density as Settings["density"] }),
                )}
                {toggle("Bookmarks bar", s.bookmarksBar, (v) =>
                  save({ bookmarksBar: v }),
                )}
                {toggle(
                  "Motion",
                  s.motion,
                  (v) => save({ motion: v }),
                  "Short interface transitions. Reduced motion and low-power mode disable nonessential effects.",
                )}
                {toggle("Transparency", s.transparency, (v) =>
                  save({ transparency: v }),
                )}
                <label className="setting">
                  <span>Sidebar width</span>
                  <input
                    aria-label="Sidebar width"
                    type="range"
                    min="52"
                    max="100"
                    value={s.sidebarWidth}
                    onChange={(e) => save({ sidebarWidth: +e.target.value })}
                  />
                </label>
                <div className="row">
                  <button
                    onClick={() =>
                      void act({ type: "settings-file", action: "export" })
                    }
                  >
                    Export settings
                  </button>
                  <button
                    onClick={() =>
                      void act({ type: "settings-file", action: "import" })
                    }
                  >
                    Import settings
                  </button>
                  <button
                    onClick={() =>
                      void act({ type: "settings-file", action: "reset" })
                    }
                  >
                    Reset settings & layout
                  </button>
                </div>
                <p className="muted">
                  Settings exports include notes, tasks and links. Wallpaper
                  files are local and are not included.
                </p>
              </>
            )}
            {section === "New tab" && (
              <>
                <label className="setting">
                  <span>Greeting</span>
                  <input
                    aria-label="Greeting"
                    value={s.greeting}
                    onChange={(e) => save({ greeting: e.target.value })}
                  />
                </label>
                {select(
                  "Wallpaper",
                  s.wallpaper.kind,
                  ["gradient", "solid", "image", "video"],
                  (kind) =>
                    save({ wallpaper: { ...s.wallpaper, kind: kind as any } }),
                )}
                <label className="setting">
                  <span>Background color</span>
                  <input
                    type="color"
                    value={s.wallpaper.color}
                    onChange={(e) =>
                      save({
                        wallpaper: { ...s.wallpaper, color: e.target.value },
                      })
                    }
                  />
                </label>
                <div className="row">
                  <button
                    onClick={() =>
                      void act({ type: "wallpaper", kind: "image" })
                    }
                  >
                    Choose local image
                  </button>
                  <button
                    onClick={() =>
                      void act({ type: "wallpaper", kind: "video" })
                    }
                  >
                    Choose local video
                  </button>
                </div>
                {select("Fit", s.wallpaper.fit, ["cover", "contain"], (fit) =>
                  save({ wallpaper: { ...s.wallpaper, fit: fit as any } }),
                )}
                {select(
                  "Position",
                  s.wallpaper.position,
                  ["center", "top", "bottom"],
                  (position) =>
                    save({
                      wallpaper: { ...s.wallpaper, position: position as any },
                    }),
                )}
                {(["dim", "blur", "contrast"] as const).map((key) => (
                  <label key={key} className="setting">
                    <span>{key}</span>
                    <input
                      aria-label={key}
                      type="range"
                      min={key === "contrast" ? 0.5 : 0}
                      max={key === "blur" ? 30 : key === "dim" ? 0.9 : 2}
                      step={key === "blur" ? 1 : 0.05}
                      value={s.wallpaper[key]}
                      onChange={(e) =>
                        save({
                          wallpaper: { ...s.wallpaper, [key]: +e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
                <p className="muted">
                  Videos are muted, paused when hidden, and disabled by
                  low-power or reduced-motion settings. The background color is
                  the static fallback.
                </p>
                {s.wallpaper.kind === "video" &&
                  toggle(
                    "Allow live wallpaper playback",
                    !s.lowPower,
                    (v) => save({ lowPower: !v }),
                    "Explicitly enables decoding when visible. Reduced motion and Motion settings are still respected.",
                  )}
                <h3>Daily static wallpaper</h3>
                {state.dailyCredit && (
                  <p role="status">{state.dailyCredit.status}</p>
                )}
                <div className="optional-form">
                  <label>
                    NASA API key (optional)
                    <input
                      aria-label="NASA API key"
                      type="password"
                      autoComplete="off"
                      value={dailyKey}
                      onChange={(e) => setDailyKey(e.target.value)}
                    />
                  </label>
                  <button
                    onClick={() => {
                      void act({
                        type: "optional",
                        service: "daily",
                        action: "key",
                        value: dailyKey,
                      })
                        .then((r) => setDailyMessage((r as any)?.status || ""))
                        .finally(() => setDailyKey(""));
                    }}
                  >
                    Save key securely
                  </button>
                  <button
                    onClick={() =>
                      void act({
                        type: "optional",
                        service: "daily",
                        action: "clear-key",
                      }).then((r) => setDailyMessage((r as any)?.status || ""))
                    }
                  >
                    Remove key
                  </button>
                </div>
                {dailyMessage && <p className="muted">{dailyMessage}</p>}
                <p className="muted">
                  Opt-in NASA APOD adapter. Copyright-marked images and videos
                  are skipped. Keeps one cached image, without a polling
                  service. Public DEMO_KEY rate limits apply.
                </p>
                <button
                  onClick={() =>
                    void act({
                      type: "optional",
                      service: "daily",
                      action: s.dailyWallpaper ? "disable" : "enable",
                    })
                  }
                >
                  {s.dailyWallpaper
                    ? "Disable daily wallpaper"
                    : "Enable daily wallpaper…"}
                </button>
                {s.dailyWallpaper && (
                  <button
                    onClick={() =>
                      void act({
                        type: "optional",
                        service: "daily",
                        action: "check",
                      })
                    }
                  >
                    Check current day
                  </button>
                )}
                <h3>Quick links</h3>
                {s.quickLinks.map((l, i) => (
                  <div className="link-editor" key={i}>
                    <input
                      aria-label={`Link ${i + 1} title`}
                      value={l.title}
                      onChange={(e) =>
                        save({
                          quickLinks: s.quickLinks.map((x, j) =>
                            j === i ? { ...x, title: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Link ${i + 1} URL`}
                      value={l.url}
                      onChange={(e) =>
                        save({
                          quickLinks: s.quickLinks.map((x, j) =>
                            j === i ? { ...x, url: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <button
                      title="Remove link"
                      onClick={() =>
                        save({
                          quickLinks: s.quickLinks.filter((_, j) => j !== i),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    save({
                      quickLinks: [
                        ...s.quickLinks,
                        { title: "New link", url: "https://example.com" },
                      ],
                    })
                  }
                >
                  Add quick link
                </button>
                <p className="muted">
                  Use “Make it yours” on the new-tab page to add, move and
                  resize widgets. Weather is deferred until a provider is
                  configured.
                </p>
              </>
            )}
            {section === "Search" && (
              <SearchSettings settings={s} save={save} />
            )}
            {section === "Startup" && (
              <>
                {select(
                  "On startup",
                  s.startup,
                  ["restore", "blank"],
                  (startup) =>
                    save({ startup: startup as Settings["startup"] }),
                )}
                <p className="muted">
                  Normal tab URLs and pins are saved. Private tabs are never
                  restored. Recovery reloads pages and cannot recover unsaved
                  forms.
                </p>
                {state.recovered && (
                  <div className="notice">
                    The previous run ended unexpectedly. Available tab snapshots
                    have been recovered.
                  </div>
                )}
              </>
            )}
            {section === "Privacy" && (
              <>
                <p>
                  Clear data for{" "}
                  {state.private
                    ? "this private session"
                    : "the normal browsing session"}
                  . Open sites may need a reload.
                </p>
                <div className="row">
                  <button
                    onClick={() =>
                      void act({ type: "clear", target: "site-data", since: 0 })
                    }
                  >
                    Clear cookies & site storage
                  </button>
                  <button
                    onClick={() =>
                      void act({ type: "clear", target: "cache", since: 0 })
                    }
                  >
                    Clear cache
                  </button>
                  <button
                    onClick={() =>
                      void act({ type: "clear", target: "history", since: 0 })
                    }
                  >
                    Clear all history
                  </button>
                </div>
                <button
                  onClick={() =>
                    void act({ type: "action", action: "private" })
                  }
                >
                  Open private window
                </button>
                <p className="muted">
                  Private windows use separate, nonpersistent sessions.
                  Downloads and exported files can remain on disk. This does not
                  hide activity from websites or your network.
                </p>
              </>
            )}
            {section === "Permissions" && (
              <>
                <p>
                  Sensitive permissions ask first on HTTPS. Screen capture and
                  unsupported capabilities are denied.
                </p>
                {state.permissions.map((p) => (
                  <div className="list-row" key={p.origin + p.permission}>
                    <div className="entry">
                      {p.origin}
                      <small>
                        {p.permission} · {p.decision}
                      </small>
                    </div>
                    <button
                      onClick={() =>
                        void act({
                          type: "permission-delete",
                          origin: p.origin,
                          permission: p.permission,
                        })
                      }
                    >
                      Revoke
                    </button>
                  </div>
                ))}
                {!state.permissions.length && (
                  <p className="muted">No saved site decisions.</p>
                )}
                <p className="muted">
                  Revoking prevents future access; reload or close tabs to end
                  existing media streams.
                </p>
              </>
            )}
            {section === "Downloads" && (
              <>
                <div className="notice">
                  Every website download requires approval, including redirects
                  and blob exports. Files are paused in a private staging area
                  until you allow saving. Additional requests are limited; HTTPS
                  does not establish that a file is safe.
                </div>
                {toggle("Ask where to save", s.askDownload, (v) =>
                  save({ askDownload: v }),
                )}
                <p>
                  Destination:{" "}
                  {s.downloadDirectory || "System Downloads folder"}
                </p>
                <button
                  onClick={() => void act({ type: "download-directory" })}
                >
                  Choose folder
                </button>
                <button onClick={() => navigate("piccolo://downloads")}>
                  Review downloads &amp; approvals
                </button>
                <p>
                  Risky file types require an additional confirmation. No
                  antivirus or reputation scanning is provided.
                </p>
              </>
            )}
            {section === "Performance" && (
              <>
                <button
                  onClick={() =>
                    save({
                      lowPower: true,
                      motion: false,
                      density: "compact",
                      wallpaper: { ...s.wallpaper, kind: "solid" },
                    })
                  }
                >
                  Apply low-power preset
                </button>
                {toggle(
                  "Low-power mode",
                  s.lowPower,
                  (v) => save({ lowPower: v }),
                  "Disables live wallpaper and nonessential interface motion; reduces clock updates.",
                )}
                <label className="setting">
                  <span>
                    Sleep inactive tabs after (minutes)
                    <small>
                      0 disables sleeping. Restoring reloads the page; unsaved
                      state may be lost.
                    </small>
                  </span>
                  <input
                    aria-label="Sleep minutes"
                    type="number"
                    min="0"
                    max="1440"
                    value={s.sleepMinutes}
                    onChange={(e) => save({ sleepMinutes: +e.target.value })}
                  />
                </label>
                <label>
                  Excluded hostnames, one per line
                  <textarea
                    aria-label="Sleep excluded sites"
                    value={s.sleepExcluded.join("\n")}
                    onChange={(e) =>
                      save({
                        sleepExcluded: e.target.value
                          .split("\n")
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <p className="muted">
                  Pinned, audible, loading and captured tabs stay awake.
                  Sleeping is suspended while this window has active downloads.
                </p>
                <button onClick={() => navigate("piccolo://performance")}>
                  View process metrics
                </button>
              </>
            )}
            {section === "Shortcuts" && (
              <div className="shortcuts">
                {[
                  ["New tab", "Ctrl+T"],
                  ["Close tab", "Ctrl+W"],
                  ["Reopen closed tab", "Ctrl+Shift+T"],
                  ["Address bar", "Ctrl+L"],
                  ["Find in page", "Ctrl+F"],
                  ["New window", "Ctrl+N"],
                  ["Private window", "Ctrl+Shift+N"],
                  ["Switch tabs", "Ctrl+Tab / Ctrl+Shift+Tab"],
                  ["Reorder active tab", "Ctrl+Shift+PageUp / PageDown"],
                  ["Downloads & approvals", "Ctrl+J"],
                  ["Back / forward", "Alt+Left / Alt+Right"],
                  ["Reload", "Ctrl+R"],
                  ["Zoom", "Ctrl + / − / 0"],
                  ["Fullscreen", "F11"],
                  ["Developer tools", "F12 / Ctrl+Shift+I"],
                ].map(([label, key]) => (
                  <div className="setting" key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
            )}
            {section === "About" && (
              <>
                <div className="about-wordmark">
                  piccolo<span>•</span>
                </div>
                <p>
                  Version {state.version} · A little curiosity. Endless
                  possibilities.
                </p>
                <p className="muted">
                  An Electron browser foundation. General Chrome extension
                  compatibility, DRM, sync, a password vault and default-browser
                  integration are not supported in this release.
                </p>
                <button onClick={() => navigate("piccolo://workspaces")}>
                  Coding workspace
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {page === "performance" && (
        <>
          <div className="notice">
            Snapshot metrics come from Electron’s supported process API. Working
            set is reported in KiB. This page refreshes only on request.
          </div>
          <button
            onClick={() => void act({ type: "metrics" }).then(setMetrics)}
          >
            Refresh measurements
          </button>
          {metrics && (
            <>
              <div className="metrics-summary">
                <div>
                  <span>{metrics.processes.length}</span>processes
                </div>
                <div>
                  <span>{state.tabs.length}</span>tabs
                </div>
                <div>
                  <span>{state.tabs.filter((t) => t.discarded).length}</span>
                  sleeping
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Process</th>
                    <th>PID</th>
                    <th>CPU %</th>
                    <th>Working set (KiB)</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.processes.map((p: any) => (
                    <tr key={p.pid}>
                      <td>{p.type}</td>
                      <td>{p.pid}</td>
                      <td>{p.cpu.percentCPUUsage.toFixed(2)}</td>
                      <td>{p.memory.workingSetSize.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                {metrics.webContents?.length || 0} WebContents · optional MCP
                code {metrics.optionalLoaded?.mcp ? "loaded" : "unloaded"}
              </p>
              <h3>Tab processes</h3>
              {metrics.tabs.map((t: any) => (
                <div className="list-row" key={t.id}>
                  <span className="entry">{t.title}</span>
                  <span>
                    {t.discarded ? "Discarded" : t.pid || "Internal UI"}
                  </span>
                </div>
              ))}
              <p className="muted">
                Electron {metrics.versions.electron} · Chromium{" "}
                {metrics.versions.chrome} · Node {metrics.versions.node}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
