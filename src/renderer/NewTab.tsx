import { useEffect, useState, useRef } from "react";
import type { State, Settings, Command } from "../shared/model";
import { Icon } from "./icons";
type Props = {
  state: State;
  act: (c: Command) => Promise<unknown>;
  navigate: (url: string) => void;
};
export function NewTab({ state, act, navigate }: Props) {
  const s = state.settings;
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(s.notes);
  const [todo, setTodo] = useState("");
  const [reduced, setReduced] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(m.matches);
    m.addEventListener("change", changed);
    return () => m.removeEventListener("change", changed);
  }, []);
  const video = useRef<HTMLVideoElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settings = useRef(s);
  settings.current = s;
  const save = (patch: Partial<Settings>) =>
    void act({ type: "settings", value: { ...settings.current, ...patch } });
  useEffect(() => {
    if (!state.visible) return;
    setNow(new Date());
    const timer = setInterval(
      () => setNow(new Date()),
      s.lowPower ? 60000 : 1000,
    );
    return () => clearInterval(timer);
  }, [state.visible, s.lowPower]);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (state.visible && !s.lowPower && s.motion && !reduced)
      void v.play().catch(() => {});
    else v.pause();
  }, [state.visible, s.lowPower, s.motion, s.wallpaper.kind, reduced]);
  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      video.current?.pause();
    },
    [],
  );
  const move = (id: string, dir: number) => {
    const widgets = [...s.widgets];
    const i = widgets.findIndex((w) => w.id === id);
    const j = i + dir;
    if (j < 0 || j >= widgets.length) return;
    [widgets[i], widgets[j]] = [widgets[j], widgets[i]];
    save({ widgets });
  };
  const wallpaper = s.wallpaper;
  const url = `piccolo-asset://wallpaper/${wallpaper.asset}`;
  return (
    <div className="newtab">
      <div
        className={`wallpaper ${wallpaper.kind}`}
        style={{ backgroundColor: wallpaper.color }}
      >
        {wallpaper.kind === "image" && wallpaper.asset && (
          <img
            alt=""
            src={url}
            style={{
              objectFit: wallpaper.fit,
              objectPosition: wallpaper.position,
              filter: `blur(${wallpaper.blur}px) contrast(${wallpaper.contrast})`,
            }}
          />
        )}
        {wallpaper.kind === "video" &&
          wallpaper.asset &&
          !s.lowPower &&
          s.motion &&
          !reduced &&
          state.visible && (
            <video
              ref={video}
              src={url}
              muted
              loop
              playsInline
              preload={s.lowPower ? "none" : "metadata"}
              style={{
                objectFit: wallpaper.fit,
                objectPosition: wallpaper.position,
                filter: `blur(${wallpaper.blur}px) contrast(${wallpaper.contrast})`,
              }}
            />
          )}
        <div
          className="wallpaper-dim"
          style={{ background: `rgba(0,0,0,${wallpaper.dim})` }}
        />
      </div>
      <div className="nt-top">
        <span className="wordmark">
          piccolo<span> / </span>
          <small>YOUR OWN LITTLE CORNER</small>
        </span>
        <div className="row">
          {state.private && (
            <span className="private-label">
              <Icon name="shield" size={14} />
              Private · history stays off
            </span>
          )}
          <button className="subtle" onClick={() => setEdit(!edit)}>
            <Icon name={edit ? "check" : "edit"} size={14} />
            {edit ? "Done editing" : "Make it yours"}
          </button>
        </div>
      </div>
      <div className="nt-body">
        <div className="greeting">
          <div className="eyebrow">A FRESH PERSPECTIVE</div>
          <h1>
            A little curiosity.
            <br />
            <span>Endless possibilities.</span>
          </h1>
          <p>{s.greeting}</p>
        </div>
        <form
          className="hero-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(query);
          }}
        >
          <Icon name="search" size={21} />
          <input
            aria-label="Search the web"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where would you like to go?"
          />
          <span>
            {s.searchEngines.find((e) => e.id === s.searchEngine)?.name ||
              "Search"}
          </span>
          <button title="Search">
            <Icon name="arrow" />
          </button>
        </form>
        {edit && (
          <div className="edit-toolbar">
            <span>Add a widget</span>
            {(["clock", "links", "notes", "todos"] as const).map((kind) => (
              <button
                key={kind}
                onClick={() =>
                  save({
                    widgets: [
                      ...s.widgets,
                      {
                        id: crypto.randomUUID(),
                        kind,
                        width: "small",
                        title: kind === "todos" ? "Today" : kind,
                      },
                    ],
                  })
                }
              >
                + {kind}
              </button>
            ))}
            <button onClick={() => navigate("piccolo://settings")}>
              Appearance & wallpaper <Icon name="arrow" size={14} />
            </button>
          </div>
        )}
        <div className={`widget-grid ${edit ? "editing" : ""}`}>
          {s.widgets.map((w) => (
            <section
              key={w.id}
              className={`widget ${w.width === "wide" ? "wide" : ""} ${w.kind === "clock" ? "clock-widget" : w.kind}`}
            >
              <div className="widget-heading">
                {edit ? (
                  <input
                    aria-label="Widget title"
                    value={w.title}
                    onChange={(e) =>
                      save({
                        widgets: s.widgets.map((x) =>
                          x.id === w.id ? { ...x, title: e.target.value } : x,
                        ),
                      })
                    }
                  />
                ) : (
                  <span>{w.title}</span>
                )}
                <Icon
                  name={
                    w.kind === "clock"
                      ? "sun"
                      : w.kind === "links"
                        ? "external"
                        : w.kind === "notes"
                          ? "edit"
                          : "check"
                  }
                  size={14}
                />
              </div>
              {edit && (
                <div className="widget-actions">
                  <button title="Move earlier" onClick={() => move(w.id, -1)}>
                    ←
                  </button>
                  <button title="Move later" onClick={() => move(w.id, 1)}>
                    →
                  </button>
                  <button
                    title="Resize widget"
                    onClick={() =>
                      save({
                        widgets: s.widgets.map((x) =>
                          x.id === w.id
                            ? {
                                ...x,
                                width: x.width === "wide" ? "small" : "wide",
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    {w.width === "wide" ? "Narrow" : "Widen"}
                  </button>
                  <button
                    title="Remove widget"
                    onClick={() =>
                      save({ widgets: s.widgets.filter((x) => x.id !== w.id) })
                    }
                  >
                    ×
                  </button>
                </div>
              )}
              {w.kind === "clock" && (
                <>
                  <div className="clock">
                    {now.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                    <span hidden={s.lowPower}>
                      {now
                        .toLocaleTimeString([], { second: "2-digit" })
                        .split(":")
                        .pop()
                        ?.replace(/\D/g, "")
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="muted">
                    {now.toLocaleDateString([], {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="clock-line">
                    <span /> Right here. Right now.
                  </div>
                </>
              )}
              {w.kind === "links" && (
                <div className="quick-links">
                  {s.quickLinks.map((l, i) => (
                    <button key={l.url + i} onClick={() => navigate(l.url)}>
                      <span className={`link-tile tile-${i % 4}`}>
                        {l.title.slice(0, 1).toUpperCase()}
                      </span>
                      {l.title}
                      <Icon name="arrow" size={12} />
                    </button>
                  ))}
                  <button
                    className="add-link"
                    onClick={() => navigate("piccolo://settings")}
                  >
                    <span className="link-tile">
                      <Icon name="plus" />
                    </span>
                    Edit links
                  </button>
                </div>
              )}
              {w.kind === "notes" && (
                <textarea
                  aria-label="Notes"
                  value={note}
                  placeholder="An idea, a reminder, a thought worth keeping…"
                  onChange={(e) => {
                    const value = e.target.value;
                    setNote(value);
                    if (noteTimer.current) clearTimeout(noteTimer.current);
                    noteTimer.current = setTimeout(
                      () => save({ notes: value }),
                      450,
                    );
                  }}
                  onBlur={() => save({ notes: note })}
                />
              )}
              {w.kind === "todos" && (
                <div className="todos">
                  {s.todos.map((t) => (
                    <div className="todo" key={t.id}>
                      <input
                        aria-label={`Complete ${t.text}`}
                        type="checkbox"
                        checked={t.done}
                        onChange={() =>
                          save({
                            todos: s.todos.map((x) =>
                              x.id === t.id ? { ...x, done: !x.done } : x,
                            ),
                          })
                        }
                      />
                      <span className={t.done ? "done" : ""}>{t.text}</span>
                      <button
                        title="Remove task"
                        onClick={() =>
                          save({ todos: s.todos.filter((x) => x.id !== t.id) })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (todo.trim()) {
                        save({
                          todos: [
                            ...s.todos,
                            {
                              id: crypto.randomUUID(),
                              text: todo.trim(),
                              done: false,
                            },
                          ],
                        });
                        setTodo("");
                      }
                    }}
                  >
                    <Icon name="plus" size={14} />
                    <input
                      aria-label="Add a task"
                      placeholder="One thing at a time…"
                      value={todo}
                      onChange={(e) => setTodo(e.target.value)}
                    />
                  </form>
                  {!s.todos.length && (
                    <small className="muted">A clear page. A clear mind.</small>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
        <footer className="nt-footer">
          {state.dailyCredit && (
            <button
              className="credit"
              title={state.dailyCredit.status}
              onClick={() => navigate(state.dailyCredit!.url)}
            >
              {state.dailyCredit.text}
            </button>
          )}
          <span>
            <span className="status-dot" />{" "}
            {state.private
              ? "Private session · downloads can remain on disk"
              : "Local by design. Open to possibility."}
          </span>
          <span>
            PICCOLO <span className="muted">/ {state.version}</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
