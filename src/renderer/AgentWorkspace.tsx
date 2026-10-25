import { useEffect, useState, useRef } from "react";
import type { State, Command } from "../shared/model";
import type { AgentTask, AgentArtifact } from "../shared/agent";
type Props = {
  state: State;
  act: (c: Command) => Promise<unknown>;
  navigate: (url: string) => void;
};
export default function AgentWorkspace({ state, act, navigate }: Props) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState(""),
    [model, setModel] = useState(""),
    [tabs, setTabs] = useState<string[]>([]),
    [files, setFiles] = useState(""),
    [images, setImages] = useState<string[]>([]),
    [edit, setEdit] = useState(false),
    [terminal, setTerminal] = useState(false),
    [screenshots, setScreenshots] = useState(false),
    [gtm, setGtm] = useState(false),
    [maxCalls, setMaxCalls] = useState(12),
    [artifact, setArtifact] = useState<AgentArtifact>(),
    [selectedTask, setSelectedTask] = useState<string>();
  const load = () =>
    act({ type: "agent", action: "status" })
      .then(setData)
      .catch((e) => setError(String(e)));
  const artifactDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (artifact) {
      if (!artifactDialog.current?.open) artifactDialog.current?.showModal();
    } else artifactDialog.current?.close();
  }, [artifact]);
  useEffect(() => {
    void load();
  }, [state.agentRevision]);
  async function run(action: any, value?: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await act({ type: "agent", action, value });
      if (action === "attach-image" && (result as any)?.id)
        setImages((old) => [...old, (result as any).id]);
      if (action === "artifact") setArtifact(result as AgentArtifact);
      if (action === "start" || action === "delete") setSelectedTask(undefined);
      if (action === "delete") {
        setGtm(false);
        setImages([]);
        setTabs([]);
        setFiles("");
        setEdit(false);
        setTerminal(false);
        setScreenshots(false);
        setArtifact(undefined);
      }
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const current: AgentTask | undefined =
    data?.tasks?.find(
      (t: AgentTask) => t.id === (selectedTask || data.active),
    ) || data?.tasks?.at(-1);
  const active =
    current &&
    ["planning", "acting", "verifying", "waiting-approval", "paused"].includes(
      current.status,
    );
  const checked = (values: string[], id: string, set: (v: string[]) => void) =>
    set(values.includes(id) ? values.filter((x) => x !== id) : [...values, id]);
  return (
    <section className="page agent-workspace">
      <header className="agent-heading">
        <div>
          <h1>Piccolo Agent</h1>
          <p className="muted">
            Selected context, visible actions, evidence you can inspect.
          </p>
        </div>
        <nav aria-label="Workspace area">
          <button onClick={() => navigate("piccolo://newtab")}>Browser</button>
          <button onClick={() => navigate("piccolo://workspaces")}>Code</button>
          <button aria-current="page">Agent</button>
        </nav>
      </header>
      {error && (
        <p role="alert" className="agent-error">
          {error}
        </p>
      )}
      {state.private ? (
        <p>Agents are unavailable in private windows.</p>
      ) : (
        <>
          <div className="agent-columns">
            <section className="agent-compose" aria-label="Task and context">
              <div className="row">
                <h2>New task</h2>
                <span className="muted">
                  AdaL · {data?.connected ? "paired" : "not connected"}
                </span>
                {data?.connected && (
                  <button
                    disabled={busy}
                    onClick={() => void run("disconnect")}
                  >
                    Disconnect
                  </button>
                )}
              </div>
              {!data?.provider?.available && (
                <p className="notice">
                  Install AdaL and complete its sign-in first. Piccolo does not
                  collect or copy your AdaL credentials.
                </p>
              )}
              {!data?.connected && (
                <>
                  <button disabled={busy} onClick={() => void run("connect")}>
                    Pair and connect Piccolo Agent
                  </button>
                  <p className="muted">
                    Pair once. Browser control is separate from project access.
                    Allow the named client in MCP Settings; grant its project
                    access in Code → Project controls.
                  </p>
                </>
              )}
              <label className="agent-field">
                Instruction
                <textarea
                  aria-label="Agent instruction"
                  rows={4}
                  maxLength={6000}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Describe the result and how it should be verified."
                />
              </label>
              <button
                className="primary"
                disabled={
                  busy ||
                  !!active ||
                  data?.cleaningUp ||
                  !instruction.trim() ||
                  !data?.connected ||
                  !data?.provider?.available
                }
                onClick={() =>
                  void run("start", {
                    instruction,
                    workflow: gtm ? "gtm" : "standard",
                    provider: "adal",
                    model,
                    tabs,
                    files: files
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                    images,
                    edit,
                    terminal,
                    screenshots,
                    maxCalls,
                  })
                }
              >
                Review transmission and start
              </button>

              <details open>
                <summary>Attached context</summary>
                <p className="muted">
                  Only checked tabs, listed files and selected images enter this
                  task.
                </p>
                <div className="agent-context">
                  {data?.tabs?.length ? (
                    data.tabs.map((tab: any) => (
                      <label key={tab.id}>
                        <input
                          type="checkbox"
                          checked={tabs.includes(tab.id)}
                          onChange={() => checked(tabs, tab.id, setTabs)}
                        />
                        <span>
                          {tab.title || tab.url}
                          <small>{tab.url}</small>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="muted">
                      No website tabs available. Open a page to attach it.
                    </p>
                  )}
                </div>
                <label className="agent-field">
                  Attached project files · one relative path per line
                  <textarea
                    aria-label="Attached project files"
                    rows={2}
                    value={files}
                    onChange={(e) => setFiles(e.target.value)}
                    placeholder="src/example.ts"
                  />
                </label>
                <div className="row">
                  <button
                    disabled={busy || !!active}
                    onClick={() => void run("attach-image")}
                  >
                    Attach image…
                  </button>
                  <span className="muted">PNG, JPEG or WebP · up to 5 MB</span>
                </div>
                {data?.images?.map((image: any) => (
                  <label className="agent-check" key={image.id}>
                    <input
                      type="checkbox"
                      checked={images.includes(image.id)}
                      onChange={() => checked(images, image.id, setImages)}
                    />
                    {image.title}
                  </label>
                ))}
              </details>
              <details>
                <summary>Task permissions and limits</summary>
                <label className="agent-check">
                  <input
                    type="checkbox"
                    checked={gtm}
                    onChange={(event) => {
                      setGtm(event.target.checked);
                      if (event.target.checked) {
                        setEdit(true);
                        setTerminal(false);
                        setScreenshots(false);
                        setFiles("");
                        setImages([]);
                      }
                    }}
                  />
                  GTM launch kit · requires approved Markdown files and one real
                  banner; drafts only
                </label>
                <label className="agent-field">
                  Model name (optional, not an API key)
                  <input
                    aria-label="Agent model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    maxLength={100}
                    placeholder="Use AdaL’s configured default"
                  />
                </label>
                <label className="agent-check">
                  <input
                    type="checkbox"
                    checked={edit}
                    onChange={(e) => setEdit(e.target.checked)}
                  />
                  Allow file edits and task CSV sheets · review before saving
                </label>
                <label className="agent-check">
                  <input
                    type="checkbox"
                    checked={terminal}
                    onChange={(e) => setTerminal(e.target.checked)}
                  />
                  Allow an approved task terminal and local preview
                </label>
                <label className="agent-check">
                  <input
                    type="checkbox"
                    checked={screenshots}
                    onChange={(e) => setScreenshots(e.target.checked)}
                  />
                  Allow screenshots of attached tabs to be sent to AdaL
                </label>
                <label className="agent-field">
                  Maximum model decisions
                  <input
                    aria-label="Maximum model decisions"
                    type="number"
                    min={1}
                    max={24}
                    value={maxCalls}
                    onChange={(e) => setMaxCalls(Number(e.target.value))}
                  />
                </label>
                <p className="muted">
                  One task at a time; eight-minute limit. AdaL/model charges and
                  quotas apply. No automatic commits, publishing, purchases or
                  dependency installation.
                </p>
              </details>
            </section>
            <section
              className="agent-execution"
              aria-label="Execution timeline"
            >
              <div className="row">
                <h2>{current ? "Current task" : "Execution"}</h2>
                <span role="status">
                  {current?.status || "No task started"}
                </span>
              </div>
              {current ? (
                <>
                  <p>{current.instruction}</p>
                  <p className="muted">
                    {current.provider} · {current.model} · {current.calls} /{" "}
                    {current.maxCalls} model decisions
                  </p>
                  {active && (
                    <div className="row">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            current.status === "paused" ? "resume" : "pause",
                          )
                        }
                      >
                        {current.status === "paused"
                          ? "Resume after review"
                          : "Pause"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void run("cancel")}
                      >
                        Cancel task
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void run("takeover")}
                      >
                        Take over
                      </button>
                    </div>
                  )}
                  {current.status === "waiting-approval" && (
                    <p className="notice">
                      Waiting for your native approval dialog. Cancel or deny to
                      stop that action.
                    </p>
                  )}
                  {current.error && <p role="alert">{current.error}</p>}
                  <details>
                    <summary>Granted context and capabilities</summary>
                    <ul>
                      {current.sources.map((source) => (
                        <li key={source.kind + source.id}>
                          {source.kind}: {source.title}
                        </li>
                      ))}
                    </ul>
                    <p className="muted">{current.capabilities?.join(" · ")}</p>
                    <p className="muted">
                      Task grants:{" "}
                      {current.grants
                        ?.map(
                          (grant) =>
                            grant.scope + (grant.revoked ? " (ended)" : ""),
                        )
                        .join(" · ")}
                    </p>
                  </details>
                  <div className="row">
                    <h3>Artifacts</h3>
                    <button disabled={busy} onClick={() => void run("show")}>
                      Show task bar
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void run("export-summary", current.id)}
                    >
                      Export redacted summary…
                    </button>
                  </div>
                  {current.artifacts.length ? (
                    current.artifacts.map((item) => (
                      <div className="agent-artifact" key={item.id}>
                        <span>
                          {item.title}
                          <small>
                            {item.mime} ·{" "}
                            {item.verified
                              ? "Recorded checks passed"
                              : "Review required"}
                          </small>
                        </span>
                        <button onClick={() => void run("artifact", item.id)}>
                          Inspect
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Artifacts appear after real work produces them.
                    </p>
                  )}
                  {!!current.plan.length && (
                    <details open>
                      <summary>Operational plan</summary>
                      <ol>
                        {current.plan.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <ol className="agent-steps">
                    {current.steps.map((step) => (
                      <li key={step.id}>
                        <div className="row">
                          <strong>{step.objective}</strong>
                          <span>
                            {step.status}
                            {step.verified ? " · checked" : ""}
                          </span>
                        </div>
                        <small>
                          {step.capability} · {step.permission}
                        </small>
                        {step.error && <p role="alert">{step.error}</p>}
                        <details>
                          <summary>Observed result</summary>
                          <pre>
                            {JSON.stringify(
                              step.result ?? { state: step.status },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                  <details>
                    <summary>Execution events</summary>
                    {current.events.slice(-30).map((event, i) => (
                      <p key={i}>
                        <time>{new Date(event.time).toLocaleTimeString()}</time>{" "}
                        · {event.detail}
                      </p>
                    ))}
                  </details>
                  {!active && (
                    <button
                      disabled={busy}
                      onClick={() => void run("delete", current.id)}
                    >
                      Delete this task and its artifacts
                    </button>
                  )}
                </>
              ) : (
                <p className="muted">
                  Start with a clear instruction and explicit attachments. The
                  timeline will show real provider decisions, tool observations,
                  approvals and verification.
                </p>
              )}
            </section>
          </div>
          <details className="agent-history">
            <summary>Task history · last {data?.tasks?.length || 0}</summary>
            {data?.tasks?.map((task: AgentTask) => (
              <p key={task.id}>
                <button
                  onClick={() => setSelectedTask(task.id)}
                  disabled={busy || !!active || !!data?.cleaningUp}
                >
                  Review task
                </button>{" "}
                {new Date(task.created).toLocaleString()} · {task.status} ·{" "}
                {task.steps.length} steps · {task.artifacts.length} artifacts
              </p>
            ))}
            <p className="muted">
              Encrypted locally with Windows account protection. Interrupted
              tasks are retained for review and never automatically replayed.
              Raw task data stays out of default exports.
            </p>
            <button
              disabled={busy || !!active}
              onClick={() => void run("delete")}
            >
              Clear history and image attachments
            </button>
          </details>
        </>
      )}
      <dialog
        ref={artifactDialog}
        className="agent-artifact-dialog"
        aria-labelledby="artifact-title"
        onCancel={() => setArtifact(undefined)}
      >
        {artifact && (
          <>
            <div className="row">
              <h2 id="artifact-title">{artifact.title}</h2>
              <button autoFocus onClick={() => setArtifact(undefined)}>
                Close artifact
              </button>
            </div>
            {artifact.mime.startsWith("image/") ? (
              <img
                src={"data:" + artifact.mime + ";base64," + artifact.data}
                alt={artifact.title}
              />
            ) : (
              <pre>{artifact.data}</pre>
            )}
            <p className="muted">
              Sources: {artifact.sources.map((s) => s.title).join(", ")}
            </p>
            {artifact.sources
              .filter(
                (source) => source.url && /^https?:\/\//i.test(source.url),
              )
              .map((source) => (
                <button
                  key={source.id}
                  onClick={() => {
                    setArtifact(undefined);
                    navigate(source.url!);
                  }}
                >
                  Open source: {source.title}
                </button>
              ))}
            <p className="muted">SHA-256 {artifact.sha256}</p>
            {artifact.fileName && (
              <p className="muted">
                Task file: agent/tasks/{artifact.taskId}/{artifact.fileName} ·
                CSV is stored as plaintext. Verification compares every cell on
                disk.
              </p>
            )}
          </>
        )}
      </dialog>
    </section>
  );
}
