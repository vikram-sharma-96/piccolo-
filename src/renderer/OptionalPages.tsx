import { useEffect, useState } from "react";
import type { State, Command, Settings } from "../shared/model";
type Props = {
  page: string;
  state: State;
  act: (c: Command) => Promise<unknown>;
  navigate: (url: string) => void;
};
export default function OptionalPages({ page, state, act, navigate }: Props) {
  const [data, setData] = useState<any>();
  const [url, setURL] = useState("");
  const [bearer, setBearer] = useState("");
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const service =
    page === "connections"
      ? "proxy"
      : page === "integrations"
        ? "mcp"
        : "extensions";
  const run = async (action: string, value?: unknown) => {
    setBusy(true);
    try {
      const next = await act({ type: "optional", service, action, value });
      if (next === undefined) {
        const refreshed = await act({
          type: "optional",
          service,
          action: "status",
        });
        if (refreshed) setData(refreshed);
      }
      if (next)
        setData(
          (next as any).status?.serverEnabled !== undefined
            ? (next as any).status
            : next,
        );
      if ((next as any)?.result)
        setResult(
          JSON.stringify((next as any).result, null, 2).slice(0, 100000),
        );
      return next;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The operation failed.",
      );
    } finally {
      setBusy(false);
      setBearer("");
    }
  };
  useEffect(() => {
    setData(undefined);
    if (page !== "passwords") void run("status");
  }, [page]);
  return (
    <div className="page">
      <div className="eyebrow">PICCOLO / OPTIONAL SERVICES</div>
      <h1>
        {
          (
            {
              extensions: "Extensions",
              connections: "VPN & proxy connections",
              passwords: "Passwords & autofill",
              integrations: "MCP Settings",
            } as Record<string, string>
          )[page]
        }
      </h1>
      {state.private ? (
        <div className="notice">
          Configure integrations in a normal window. Private sessions never load
          extensions. MCP private access requires a separate grant in a normal
          window.
        </div>
      ) : (
        <>
          {page === "passwords" && (
            <>
              <div className="notice">
                Secure browser autofill is unavailable in this release. No
                passwords are collected or stored.
              </div>
              <p>
                Maintained password managers typically depend on Chrome
                extension APIs and native messaging that Piccolo’s limited
                extension runtime does not provide. A reviewed manager adapter
                with origin/frame matching and explicit autofill consent is
                required before this can be enabled.
              </p>
              <button
                onClick={() => navigate("https://bitwarden.com/download/")}
              >
                Open Bitwarden download information
              </button>
              <p className="muted">
                You can use a password manager’s separate desktop app manually.
                This button does not install a manager or enable autofill.
              </p>
            </>
          )}
          {page === "extensions" && (
            <>
              <p className="muted">
                Experimental unpacked content-script extensions only. No Chrome
                Web Store, background scripts, service workers, native messaging
                or private-session extensions. Extensions cannot access
                Piccolo’s UI session or preload bridge. Review their website
                access before installing.
              </p>
              <button disabled={busy} onClick={() => void run("install")}>
                Install unpacked extension…
              </button>
              <button
                onClick={() =>
                  navigate(
                    "https://addons.mozilla.org/en-US/firefox/extensions/",
                  )
                }
              >
                Explore Firefox add-ons (catalog only)
              </button>
              <p className="muted">
                Firefox XPI and Chrome CRX packages cannot be installed here.
                Catalog listings are discovery information, not compatibility
                approval. Only reviewed unpacked content-script folders can be
                loaded; updates require removal and a new consent review.
              </p>
              {Array.isArray(data) &&
                data.map((e) => (
                  <section className="extension-card" key={e.id}>
                    <strong>{e.name}</strong>
                    <small>
                      {e.enabled ? "Enabled" : "Disabled"} · {e.id}
                    </small>
                    <p className="muted">
                      Website permissions: {e.permissions.join(", ") || "None"}
                    </p>
                    {e.error && <p>{e.error}</p>}
                    <div className="row">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(e.enabled ? "disable" : "enable", e.id)
                        }
                      >
                        {e.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void run("remove", e.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </section>
                ))}
              {Array.isArray(data) && !data.length && (
                <p>
                  No installed extensions. Optional code loads only when this
                  manager is used or an installed extension is enabled.
                </p>
              )}
            </>
          )}
          {page === "connections" && (
            <>
              <div className="notice">
                Browser proxy: normal Piccolo website traffic only. A system VPN
                is unavailable; Piccolo does not install drivers or change OS
                network settings. Private sessions remain direct.
              </div>
              <p>{data?.status || "No connection configured."}</p>
              <form
                className="optional-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("connect", url);
                }}
              >
                <label>
                  Manual HTTP / HTTPS / SOCKS5 proxy
                  <input
                    aria-label="Proxy URL"
                    placeholder="http://127.0.0.1:8080"
                    value={url}
                    onChange={(e) => setURL(e.target.value)}
                  />
                </label>
                <button disabled={busy} className="primary">
                  Apply & verify
                </button>
                <button
                  type="button"
                  disabled={busy || (!data?.enabled && !data?.blocked)}
                  onClick={() => void run("disconnect")}
                >
                  Disconnect
                </button>
              </form>
              <p className="muted">
                Use a supported local provider client that exposes a proxy port.
                A connection is reported verified only after routing and an
                HTTPS reachability check succeed. Failure pauses traffic until
                you explicitly disconnect. Credentials are not accepted;
                authenticated-provider adapters require separate reviewed
                support. Connections are session-only and do not reconnect on
                restart.
              </p>
            </>
          )}
          {page === "integrations" && (
            <>
              <div className="notice">
                The preferred connection is a local stdio adapter. It connects
                to Piccolo, starts it if needed, and reconnects after restarts.
                Configure each AI client once and approve its pairing key here.
                No bearer token belongs in client JSON. All clients share one
                browser instance for this profile.
              </div>
              <h2>Piccolo MCP server</h2>
              <p>
                {data?.serverEnabled
                  ? data.endpoint
                  : "Stopped · stdio adapter and authenticated loopback HTTP are disabled"}
              </p>
              <div className="row">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      data?.serverEnabled ? "server-stop" : "server-start",
                    )
                  }
                >
                  {data?.serverEnabled
                    ? "Disable MCP server"
                    : "Enable server…"}
                </button>
                <button
                  disabled={busy || !data?.serverEnabled || !data?.trusted}
                  onClick={() => void run("trust-disable")}
                >
                  Revoke all trusted control
                </button>
                <button
                  disabled={busy}
                  onClick={() => void run("rotate-token")}
                >
                  Rotate HTTP pairing
                </button>
                <button
                  disabled={!data?.serverEnabled}
                  onClick={() => void run("copy-token")}
                >
                  Copy connection token
                </button>
              </div>
              <p className="muted">
                {data?.permissions ||
                  "Enable the server to see pairing and permission status."}{" "}
                Only browser tools are exposed. Private windows require a
                separate client grant. Password stores, filesystem, shell, raw
                IPC and arbitrary privileged JavaScript remain unavailable.
              </p>
              <h3>Paired clients</h3>
              {!data?.clients?.length && (
                <p>
                  No clients paired. Copy a configuration below and connect from
                  your AI client. Piccolo will ask once to pair its key.
                </p>
              )}
              {data?.clients?.map((client: any) => (
                <article className="mcp-client" key={client.id}>
                  <strong>{client.name}</strong>
                  <span>
                    {client.connections} connected ·{" "}
                    {client.revoked
                      ? "Revoked"
                      : client.full
                        ? "Trusted browser control"
                        : "Per-call approval"}{" "}
                    · Private: {client.private ? "Allowed" : "Blocked"}
                  </span>
                  <code title={client.id}>Key: {client.id.slice(0, 16)}…</code>
                  <div className="row">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          client.revoked ? "restore-client" : "revoke-client",
                          client.id,
                        )
                      }
                    >
                      {client.revoked ? "Restore…" : "Revoke client"}
                    </button>
                    {!client.revoked && !client.full && (
                      <button
                        disabled={busy}
                        onClick={() => void run("grant-client", client.id)}
                      >
                        Trust browser control…
                      </button>
                    )}
                    {!client.revoked && (
                      <button
                        disabled={busy}
                        onClick={() => void run("private-client", client.id)}
                      >
                        {client.private
                          ? "Revoke private access…"
                          : "Allow private access…"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {data?.stdio && (
                <>
                  <h3>Codex · config.toml</h3>
                  <pre className="tool-result">{data.stdio.codexToml}</pre>
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(data.stdio.codexToml)
                        .then(() => setNotice("Codex TOML copied."))
                    }
                  >
                    Copy Codex configuration
                  </button>
                  <h3>Antigravity · mcp_config.json</h3>
                  <pre className="tool-result">{data.stdio.json}</pre>
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(data.stdio.json)
                        .then(() => setNotice("Antigravity JSON copied."))
                    }
                  >
                    Copy Antigravity configuration
                  </button>
                  <p className="muted">{data.stdio.note}</p>
                </>
              )}
              <h2>Connect to a local MCP server</h2>
              <form
                className="optional-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("connect", { url, bearer: bearer || undefined });
                }}
              >
                <label>
                  Loopback endpoint
                  <input
                    aria-label="MCP endpoint"
                    value={url}
                    placeholder="http://127.0.0.1:3000/mcp"
                    onChange={(e) => setURL(e.target.value)}
                  />
                </label>
                <label>
                  Bearer token (optional, memory only)
                  <input
                    aria-label="MCP bearer token"
                    type="password"
                    autoComplete="off"
                    value={bearer}
                    onChange={(e) => setBearer(e.target.value)}
                  />
                </label>
                <button disabled={busy} className="primary">
                  Connect
                </button>
                <button
                  type="button"
                  disabled={!data?.clientConnected}
                  onClick={() => void run("disconnect")}
                >
                  Disconnect
                </button>
              </form>
              <p>
                {data?.clientConnected
                  ? "Connected · tool access still requires approval"
                  : "Disconnected"}
              </p>
              {data?.clientConnected && (
                <form
                  className="optional-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      const parsed = JSON.parse(args);
                      void run("call", { name: tool, arguments: parsed });
                    } catch {
                      setNotice("Arguments must be valid JSON.");
                    }
                  }}
                >
                  <label>
                    Tool
                    <select
                      aria-label="MCP tool"
                      value={tool}
                      onChange={(e) => setTool(e.target.value)}
                    >
                      <option value="">Choose a tool</option>
                      {data.tools?.map((t: any) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    {data.tools?.find((t: any) => t.name === tool)?.description}
                  </p>
                  <label>
                    Arguments (JSON)
                    <textarea
                      aria-label="MCP arguments"
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                    />
                  </label>
                  <button disabled={busy || !tool}>
                    Request approval & call
                  </button>
                  <button type="button" onClick={() => void run("cancel")}>
                    Cancel pending call
                  </button>
                </form>
              )}
              {notice && <p role="alert">{notice}</p>}
              {result && <pre className="tool-result">{result}</pre>}
              <h3>Redacted activity</h3>
              <button onClick={() => void run("status")}>Refresh status</button>
              {data?.activity?.map((r: any, i: number) => (
                <div key={i} className="list-row">
                  <span>{new Date(r.time).toLocaleTimeString()}</span>
                  <span>{r.action}</span>
                  <span>{r.client || "Local configuration"}</span>
                  <span>{r.status}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
