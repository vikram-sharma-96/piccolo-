import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { Browser } from "./browser";
import path from "node:path";
const coding = () =>
  require(path.join(__dirname, "coding.cjs")) as typeof import("./coding");
const result = (value: unknown) => ({
  content: [
    { type: "text" as const, text: JSON.stringify(value ?? { ok: true }) },
  ],
});
export function registerCodingTools(
  server: McpServer,
  target: () => Browser | undefined,
  principal?: string,
) {
  const withWorkspace =
    (fn: (b: Browser, args: any, signal: AbortSignal) => Promise<any>) =>
    async (args: any, ctx: any) => {
      const b = target();
      if (!b) throw Error("Select a normal browser window.");
      return coding().workspaceAccess(
        b,
        principal,
        ctx.mcpReq.signal,
        (signal) => fn(b, args, signal),
      );
    };
  server.registerTool(
    "workspace_state",
    {
      description:
        "Inspect a separately authorized coding project and bounded editor/diagnostic state. Browser-control grants do not authorize workspace access. Project selection, trust and workspace grants require the user UI.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const b = target();
      if (!b || !(await coding().hasWorkspaceGrant(b, principal)))
        return result({
          available: false,
          reason:
            "Open and trust a project, then grant this paired client workspace access in Project controls.",
        });
      return withWorkspace(async (b, _args, signal) => {
        const state = await coding().requestWorkspace(
          b,
          { action: "state" },
          true,
          signal,
        );
        return result({
          name: state.name,
          id: state.id,
          trusted: state.trusted,
          appearance: state.appearance,
          terminalRunning: state.terminalRunning,
          extensions: state.extensions.map((e: any) => ({
            id: e.id,
            version: e.version,
            enabled: e.enabled,
            source: e.source,
          })),
          editor: await coding().safeEditorState(b),
          activity: coding().activity(b),
        });
      })(_args, ctx);
    },
  );
  server.registerTool(
    "workspace_files",
    {
      description:
        "Operate ordinary files only inside the explicitly selected project. Links, traversal and sensitive configuration are blocked. Read returns a revision required to overwrite. Unsaved editor changes reject external writes. Delete requires native user confirmation.",
      inputSchema: z.object({
        action: z.enum([
          "list",
          "stat",
          "read",
          "write",
          "mkdir",
          "rename",
          "delete",
          "search",
        ]),
        path: z.string().max(2000).default(""),
        to: z.string().max(2000).optional(),
        text: z.string().max(150000).optional(),
        revision: z.string().max(64).nullable().optional(),
        query: z.string().min(1).max(200).optional(),
      }),
    },
    withWorkspace(async (b, a, signal) => {
      let request: any = { action: a.action, path: a.path };
      if (a.action === "write") {
        if (a.text === undefined || a.revision === undefined)
          throw Error(
            "text and revision are required; use null revision only for a new file.",
          );
        request = {
          ...request,
          data: Buffer.from(a.text, "utf8").toString("base64"),
          revision: a.revision,
        };
      }
      if (a.action === "rename") request.to = a.to;
      if (a.action === "search") request = { action: "search", query: a.query };
      const output = await coding().requestWorkspace(b, request, true, signal);
      if (a.action === "read")
        return result({
          path: a.path,
          text: Buffer.from(output.data, "base64").toString("utf8"),
          revision: output.revision,
        });
      return result(output ?? { ok: true });
    }),
  );
  server.registerTool(
    "workspace_editor",
    {
      description:
        "Inspect/open/edit/save the real coding editor, display find/replace or command palette, format the active document, or capture the coding workbench. Edits require the current editor version; sensitive documents are excluded. No arbitrary commands or privileged scripts.",
      inputSchema: z.object({
        action: z.enum([
          "inspect",
          "open",
          "read",
          "edit",
          "save",
          "find",
          "replace",
          "palette",
          "format",
          "screenshot",
        ]),
        path: z.string().max(2000).optional(),
        text: z.string().max(150000).optional(),
        version: z.number().int().positive().optional(),
      }),
    },
    withWorkspace(async (b, a, signal) => {
      if (a.action === "inspect")
        return result(await coding().safeEditorState(b));
      if (["save", "format", "screenshot"].includes(a.action))
        await coding().assertInspectable(b);
      if (a.path)
        await coding().requestWorkspace(
          b,
          { action: "stat", path: a.path },
          true,
          signal,
        );
      if (a.action === "screenshot") {
        await coding().assertInspectable(b);
        const png = await coding().capture(b);
        return {
          content: [
            {
              type: "image" as const,
              mimeType: "image/png",
              data: png.toString("base64"),
            },
          ],
        };
      }
      let operation = a.action,
        args: any[] = [];
      if (["open", "read", "edit"].includes(a.action)) {
        if (!a.path) throw Error("A project-relative path is required.");
        args = [a.path];
      }
      if (a.action === "read") operation = "readEditor";
      if (a.action === "edit") {
        if (a.version === undefined || a.text === undefined)
          throw Error("text and current editor version are required.");
        args.push(a.text, a.version);
      }
      if (["find", "replace", "palette", "format"].includes(a.action)) {
        operation = "command";
        args = [a.action];
      }
      return result(
        (await coding().editorOperation(b, operation, args)) ?? { ok: true },
      );
    }),
  );
  server.registerTool(
    "workspace_git",
    {
      description:
        "Real local Git status, tracked diff, stage, unstage and commit in the authorized project. Hooks, signing, external diffs and configured filters are disabled. No network push/pull or arbitrary Git arguments.",
      inputSchema: z.object({
        operation: z.enum(["status", "diff", "stage", "unstage", "commit"]),
        path: z.string().max(2000).optional(),
        message: z.string().min(1).max(500).optional(),
      }),
    },
    withWorkspace(async (b, a, signal) =>
      result(
        await coding().requestWorkspace(
          b,
          { action: "git", ...a },
          true,
          signal,
        ),
      ),
    ),
  );
  server.registerTool(
    "workspace_terminal",
    {
      description:
        "Start/read/stop a real project terminal, or send bounded terminal input. Starting a terminal and every MCP input require separate native approval. Commands run with user-account privileges; cancellation of a running command is available through stop. No access from browser-control permission alone.",
      inputSchema: z.object({
        action: z.enum(["start", "read", "input", "stop"]),
        text: z.string().min(1).max(1500).optional(),
      }),
    },
    withWorkspace(async (b, a, signal) => {
      if (a.action === "read") return result(coding().terminalOutput(b));
      return result(
        await coding().requestWorkspace(
          b,
          a.action === "input"
            ? { action: "terminal-input", data: a.text }
            : {
                action:
                  a.action === "start" ? "terminal-start" : "terminal-stop",
              },
          true,
          signal,
        ),
      );
    }),
  );
  server.registerTool(
    "workspace_preview",
    {
      description:
        "Open an explicitly requested loopback HTTP(S) development preview in an ordinary sandboxed browser tab. Does not start a server, install dependencies or run scripts.",
      inputSchema: z.object({ url: z.url().max(2000) }),
    },
    withWorkspace(async (b, a, signal) =>
      result(
        await coding().requestWorkspace(
          b,
          { action: "preview", url: a.url },
          true,
          signal,
        ),
      ),
    ),
  );
  server.registerTool(
    "workspace_extensions",
    {
      description:
        "Discover Open VSX extensions, inspect installed packages, request explicitly approved supported web VSIX installation, or enable/disable/remove/update. Desktop-only packages are rejected. A native picker is required for user VSIX files. Installation, removal and reload protect unsaved changes.",
      inputSchema: z.object({
        action: z.enum([
          "search",
          "list",
          "install",
          "vsix",
          "enable",
          "disable",
          "remove",
          "update",
        ]),
        query: z.string().max(100).optional(),
        id: z
          .string()
          .regex(/^[\w-]+\.[\w-]+$/)
          .optional(),
        version: z
          .string()
          .regex(/^[\w.+-]+$/)
          .optional(),
      }),
    },
    withWorkspace(async (b, a, signal) => {
      const request =
        a.action === "search"
          ? { action: "extension-search", query: a.query }
          : a.action === "list"
            ? { action: "extension-list" }
            : a.action === "install"
              ? { action: "extension-install", id: a.id, version: a.version }
              : a.action === "vsix"
                ? { action: "extension-vsix" }
                : { action: "extension-change", id: a.id, operation: a.action };
      return result(await coding().requestWorkspace(b, request, true, signal));
    }),
  );
}
