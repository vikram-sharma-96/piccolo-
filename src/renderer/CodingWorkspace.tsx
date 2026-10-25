import { useEffect, useState } from "react";
import type { State, Command } from "../shared/model";
export default function CodingWorkspace({
  state,
  act,
}: {
  state: State;
  act: (c: Command) => Promise<unknown>;
}) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    act({ type: "workspace", action: "status" })
      .then(setData)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void load();
  }, [state.workspaceRevision]);
  async function run(action: any, value?: string) {
    setBusy(true);
    setError("");
    try {
      await act({ type: "workspace", action, value });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page coding-manager">
      <div className="coding-title">
        <div>
          <h1>Code, beside your browser.</h1>
          <p>Open a local project in Piccolo’s Code OSS workbench.</p>
        </div>
        <button
          className="primary"
          disabled={busy || state.private}
          onClick={() => void run("pick")}
        >
          Open project folder…
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {state.private ? (
        <p>Coding projects are available in normal windows only.</p>
      ) : (
        <>
          {data?.open && (
            <section className="coding-project">
              <h2>{data.name}</h2>
              <p className="muted">{data.root}</p>
              <p>
                {data.trusted
                  ? "Trusted for this open session."
                  : "Restricted: extensions and terminal are blocked. No project scripts run automatically."}
              </p>
              <div className="row">
                <button disabled={busy} onClick={() => void run("show")}>
                  Return to editor
                </button>
                <button disabled={busy} onClick={() => void run("trust")}>
                  {data.trusted ? "Revoke project trust…" : "Trust project…"}
                </button>
                <button disabled={busy} onClick={() => void run("takeover")}>
                  Take over · revoke workspace automation
                </button>
                <button disabled={busy} onClick={() => void run("close")}>
                  Close workspace…
                </button>
              </div>
              <h3>Workspace access for MCP clients</h3>
              <p className="muted">
                Browser control does not grant project files or terminal access.
                Choose clients individually; terminal input still asks for
                approval.
              </p>
              {!data.clients?.length && (
                <p>
                  No paired clients. Configure pairing in MCP Settings first.
                </p>
              )}
              {data.clients?.map((client: any) => (
                <div className="setting" key={client.id}>
                  <span>
                    {client.name}
                    <small>
                      {client.workspace
                        ? "Workspace access granted"
                        : "No workspace access"}{" "}
                      · Key {client.id.slice(0, 12)}…
                    </small>
                  </span>
                  <button
                    disabled={busy || !data.trusted}
                    onClick={() =>
                      void run(
                        client.workspace ? "revoke-client" : "grant-client",
                        client.id,
                      )
                    }
                  >
                    {client.workspace
                      ? "Revoke workspace access"
                      : "Allow workspace access…"}
                  </button>
                </div>
              ))}
            </section>
          )}
          <h2>Recent projects</h2>
          {!data?.recent?.length ? (
            <p className="muted">
              Projects appear here after you choose a folder. Nothing starts
              until you open one.
            </p>
          ) : (
            data.recent.map((project: any) => (
              <div className="setting" key={project.id}>
                <span>
                  {project.name}
                  <small>{project.root}</small>
                </span>
                <button
                  disabled={busy}
                  onClick={() => void run("reopen", project.id)}
                >
                  Reopen
                </button>
              </div>
            ))
          )}
          <div className="notice">
            Web extensions and declarative themes are supported through a
            separate worker extension host. Desktop Node extensions and
            Microsoft-only services are unavailable. Open VSX and user-selected
            VSIX packages require explicit installation. The terminal runs with
            your user-account privileges.
          </div>
        </>
      )}
    </section>
  );
}
