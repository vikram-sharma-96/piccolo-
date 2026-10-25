import { app, dialog, nativeImage, safeStorage } from "electron";
import path from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { Browser } from "./browser";
import { webURL } from "../shared/url";
import {
  agentStart,
  redactAgentText,
  redactAgentValue,
  type AgentTask,
  type AgentCapability,
  type AgentStart,
  type AgentGrant,
  type AgentArtifact,
  type SourceReference,
} from "../shared/agent";
import { AgentEngine } from "./agent-engine";
import { AgentArchive } from "./agent-storage";
import { TaskSheets } from "./agent-sheet";
import {
  writeSheetSchema,
  verifySheetSchema,
  normalizeSheetRows,
  encodeSheet,
} from "../shared/agent-sheet";
import { AdalProvider, adalInstallation } from "./agent-adal";
import { adalImageConfiguration } from "./agent-adal";
import {
  gtmSchema,
  gtmBrief,
  verifyGtmBrief,
  type GtmObservation,
} from "../shared/agent-gtm";
import { writeGtmDocuments } from "./agent-gtm";
import {
  EvidenceLedger,
  assertEvidence,
  checkNumericSupport,
  verifyPageExpectation,
  evidenceReport,
  evidenceSummary,
  flagUnknownText,
  toArtifactEvidence,
  RECORDED_EVIDENCE_CAPABILITIES,
  type EvidenceSource,
} from "../shared/agent-evidence";
type AttachedImage = {
  id: string;
  title: string;
  data: string;
  sha256: string;
};
const services = new Map<Browser, AgentService>();
const root = () => path.join(app.getPath("userData"), "agent");
const terminalTaskStates = [
  "planning",
  "acting",
  "verifying",
  "waiting-approval",
  "paused",
];
const textSchema = z.string().min(1).max(1500),
  fileSchema = z.string().min(1).max(1000),
  tabSchema = z.string().min(1).max(100);
class AgentService {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting = false;
  private starting = false;
  private executing = false;
  private barHidden = false;
  private lifecycle = new AbortController();
  private closing?: Promise<void>;
  private principal = "";
  private engine?: AgentEngine;
  private running?: Promise<void>;
  private history: AgentTask[] = [];
  private loaded = false;
  private images = new Map<string, AttachedImage>();
  private writes = Promise.resolve();
  private revision = 0;
  private navigation = new Map<string, number>();
  private origins = new Map<string, string>();
  private originApprovals = 0;
  private observedSources = new Set<string>();
  private failedSources = new Set<string>();
  private gtmObservations = new Map<string, GtmObservation>();
  // Evidence ledger reuses the observed-page snapshot map above (no second observation store).
  private ledger = new EvidenceLedger(this.gtmObservations);
  private bannerAttempted = false;
  private sheets = new TaskSheets(path.join(root(), "tasks"));
  private cleanup: (() => void)[] = [];
  private liveTabIds = new Set<string>();
  private activeSpec?: AgentStart;
  private projectId?: string;
  private hasTerminal = false;
  private currentImages: string[] = [];
  private archive = new AgentArchive(root(), {
    encrypt: (value) => safeStorage.encryptStringAsync(value),
    decrypt: async (value) =>
      (await safeStorage.decryptStringAsync(value)).result,
  });
  constructor(private b: Browser) {
    b.win.once("closed", () => {
      void this.close().finally(() => services.delete(b));
    });
  }
  private notify() {
    if (this.b.win.isDestroyed()) return;
    this.b.state.agentRevision = (this.b.state.agentRevision || 0) + 1;
    this.b.state.agentTask =
      this.engine && !this.barHidden
        ? {
            id: this.engine.task.id,
            status: this.engine.task.status,
            step: this.engine.task.steps.length,
          }
        : undefined;
    this.b.bounds();
    this.b.emit();
  }
  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await this.archive.read();
      if (Array.isArray(raw))
        this.history = raw
          .slice(-5)
          .filter(
            (t) => t && typeof t.id === "string" && Array.isArray(t.steps),
          )
          .map((t) => ({
            ...t,
            grants: (t.grants || []).map((grant) => ({
              ...grant,
              revoked: true,
            })),
            pendingApproval:
              t.pendingApproval?.status === "pending"
                ? { ...t.pendingApproval, status: "denied" as const }
                : t.pendingApproval,
            status: terminalTaskStates.includes(t.status)
              ? "interrupted"
              : t.status,
            error: terminalTaskStates.includes(t.status)
              ? "Application closed during execution. Nothing was replayed."
              : t.error,
          }));
    } catch (error: any) {
      if (error.code !== "ENOENT")
        throw Error(
          "Saved agent history could not be decrypted. Delete history to reset it.",
        );
    }
  }
  private async save(task: AgentTask) {
    if (
      task.artifacts.length > 10 ||
      task.artifacts.reduce((n, a) => n + a.data.length, 0) > 4_000_000
    )
      throw Error("Task artifact limit reached (10 artifacts / 4 MB).");
    const snapshot = [
      ...this.history.filter((t) => t.id !== task.id),
      structuredClone(task),
    ].slice(-5);
    this.history = snapshot.map((record) => ({
      ...record,
      artifacts: record.artifacts.map((artifact) => ({
        ...artifact,
        data: "",
      })),
    }));
    this.notify();
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        if (!(await safeStorage.isAsyncEncryptionAvailable()))
          throw Error(
            "Windows credential encryption unavailable. Task history cannot be stored safely.",
          );
        await this.archive.write(snapshot);
      });
    await this.writes;
  }
  async state() {
    await this.load();
    const install = await adalInstallation();
    return {
      provider: {
        id: "adal",
        available: install.available,
        model: "AdaL configured default or an explicit registry key",
        text: true,
        vision: true,
        structured: true,
        streaming: false,
        audio: false,
      },
      connected: !!this.client,
      cleaningUp:
        this.executing &&
        !terminalTaskStates.includes(this.engine?.task.status || ""),
      active: this.engine?.task.id,
      images: [...this.images.values()].map(({ data, ...i }) => i),
      tabs: this.b.state.tabs
        .filter((t) => webURL(t.url))
        .map(({ id, title, url }) => ({ id, title, url })),
      tasks: this.history.map((t) => ({
        ...t,
        artifacts: t.artifacts.map(({ data, ...a }) => a),
      })),
      limits: { concurrency: 1, maxSteps: 24, retention: 5 },
      capabilities: [
        "Selected-tab browsing",
        "Explicit file reads/edits",
        "Approved terminal commands",
        "Loopback preview",
        "Image findings",
        "Evidence artifacts",
      ],
    };
  }
  async connect() {
    if (this.client) return { connected: true };
    if (this.connecting) throw Error("Agent connection already pending.");
    this.connecting = true;
    if (this.lifecycle.signal.aborted) this.lifecycle = new AbortController();
    try {
      await this.b.command({
        type: "optional",
        service: "mcp",
        action: "server-start",
      });
      const client = new Client({
        name: "piccolo-agent",
        version: app.getVersion(),
      });
      const command = app.isPackaged ? app.getPath("exe") : process.execPath;
      const env: Record<string, string> = {
        PICCOLO_PROFILE: app.getPath("userData"),
        ELECTRON_RUN_AS_NODE: "1",
      };
      const transport = new StdioClientTransport({
        command,
        args: [
          path.join(__dirname, "mcp-stdio-entry.cjs"),
          "--client=piccolo-agent",
        ],
        env,
        stderr: "pipe",
      });
      this.transport = transport;
      transport.stderr?.on("data", () => {});
      await client.connect(transport, { timeout: 40000 });
      this.client = client;
      if (this.lifecycle.signal.aborted) {
        await client.close();
        this.client = undefined;
        throw Error("Agent connection canceled.");
      }
      this.principal =
        (await this.b.store.get<any[]>("mcp-pairs", [])).find(
          (pair) => pair.name === "piccolo-agent" && !pair.revoked,
        )?.id || "";
      await this.call(
        "browser_windows",
        { action: "select", windowId: this.b.win.id },
        AbortSignal.timeout(15000),
      );
      this.notify();
      return { connected: true };
    } catch (error) {
      await this.transport?.close().catch(() => {});
      this.transport = undefined;
      throw error;
    } finally {
      this.connecting = false;
    }
  }
  private async call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    if (!this.client) throw Error("Connect Piccolo Agent first.");
    if (signal.aborted) throw Error("Task canceled.");
    const response = await this.client.callTool(
      { name, arguments: args },
      { signal, timeout: 30000 },
    );
    if (response.isError)
      throw Error(
        response.content
          .filter((c) => c.type === "text")
          .map((c) => (c as any).text)
          .join(" ")
          .slice(0, 1200),
      );
    const images = response.content.filter((c) => c.type === "image");
    if (images.length)
      return {
        images: images.map((c) => ({
          data: (c as any).data,
          mime: (c as any).mimeType,
        })),
      };
    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as any).text)
      .join("\n");
    try {
      const parsed = JSON.parse(text),
        safe = redactAgentValue(parsed);
      if (
        name === "workspace_files" &&
        args.action === "read" &&
        typeof parsed.text === "string" &&
        parsed.text !== safe.text
      )
        safe.redacted = true;
      return safe;
    } catch {
      return { message: redactAgentText(text) };
    }
  }
  private async approval(scope: string, detail: string, signal: AbortSignal) {
    if (signal.aborted) throw Error("Approval canceled.");
    const task =
      this.engine && terminalTaskStates.includes(this.engine.task.status)
        ? this.engine.task
        : undefined;
    if (task) {
      task.status = "waiting-approval";
      task.pendingApproval = {
        id: randomUUID(),
        objective: scope,
        scope: /file/i.test(scope)
          ? "edit"
          : /image|origin/i.test(scope)
            ? "provider"
            : "external",
        status: "pending",
      };
      const step = task.steps.at(-1);
      if (step) step.status = "waiting-approval";
      await this.save(task);
    }
    const { response } = await dialog.showMessageBox(this.b.win, {
      signal,
      type: "warning",
      message: scope,
      detail,
      buttons: ["Cancel", "Allow"],
      defaultId: 0,
      cancelId: 0,
    });
    if (signal.aborted || response !== 1) {
      if (task?.pendingApproval) {
        task.pendingApproval.status = "denied";
        await this.save(task);
      }
      throw Error("Permission denied or canceled.");
    }
    if (task) {
      task.status = "acting";
      if (task.pendingApproval) {
        task.pendingApproval.status = "allowed";
        task.grants.push({
          id: task.pendingApproval.id,
          scope: task.pendingApproval.scope,
          resources: [task.steps.at(-1)?.id || task.id],
          revoked: false,
        });
      }
      const step = task.steps.at(-1);
      if (step) step.status = "running";
      await this.save(task);
    }
  }
  private tab(id: string) {
    if (!this.liveTabIds.has(id))
      throw Error("Tab is outside this task grant.");
    const tab = this.b.state.tabs.find((t) => t.id === id);
    if (!tab || !webURL(tab.url))
      throw Error("Attached tab closed or moved to a privileged page.");
    return tab;
  }
  private async select(id: string, signal: AbortSignal) {
    const tab = this.tab(id);
    await this.ensureOrigin(id, signal);
    await this.call("browser_tabs", { action: "activate", tabId: id }, signal);
    this.tab(id);
    await this.ensureOrigin(id, signal);
    if (tab.discarded)
      throw Error(
        "Attached tab is discarded. Reload it manually and observe again.",
      );
    return tab;
  }
  private async ensureOrigin(id: string, signal: AbortSignal) {
    const tab = this.tab(id),
      origin = new URL(tab.url).origin;
    if (this.origins.get(id) === origin) return;
    if (++this.originApprovals > 2)
      throw Error(
        "Task origin expansion limit reached. Review the destination and start a new task.",
      );
    await this.approval(
      "Allow this changed tab origin to send content to AdaL?",
      origin +
        "\nAttached tab navigation changed its origin. No content from this origin is transmitted until you approve.",
      signal,
    );
    if (new URL(this.tab(id).url).origin !== origin)
      throw Error("Page changed again during origin approval.");
    this.origins.set(id, origin);
  }
  private pageRevision(id: string) {
    return id + ":" + (this.navigation.get(id) || 0);
  }
  private async observe(id: string, signal: AbortSignal) {
    const tab = await this.select(id, signal);
    const source = this.engine?.task.sources.find((source) => source.id === id);
    if (source) {
      source.url = redactAgentText(tab.url);
      source.title = redactAgentText(tab.title);
    }
    if (tab.error) {
      this.observedSources.add(id);
      this.failedSources.add(tab.url);
      this.gtmObservations.set(id, {
        tabId: id,
        url: tab.url,
        title: tab.title,
        text: "unknown",
        unreachable: true,
      });
      this.engine!.task.events.push({
        time: Date.now(),
        kind: "observation",
        detail:
          "Source unreachable; product and pricing are unknown: " +
          redactAgentText(tab.url),
      });
      return {
        tabId: id,
        url: redactAgentText(tab.url),
        unreachable: true,
        text: "unknown",
        failureReason: redactAgentText(tab.error),
        observationComplete: true,
        nextAction:
          "This navigation failure is a complete observation, not a pending tool call. Do not retry. Write the source row with unknown product/pricing and status unreachable.",
      };
    }
    const revision = this.pageRevision(id);
    const text = await this.call("browser_read", { tabId: id }, signal);
    const structure = await this.call(
      "browser_structure",
      { limit: 70, tabId: id },
      signal,
    );
    if (revision !== this.pageRevision(id))
      throw Error("Page changed during observation. Read again.");
    this.observedSources.add(id);
    this.gtmObservations.set(id, {
      tabId: id,
      url: tab.url,
      title: tab.title,
      text: redactAgentText(String(text.text || "").slice(0, 18000)),
    });
    return {
      tabId: id,
      url: redactAgentText(tab.url),
      pageRevision: revision,
      text: redactAgentText(String(text.text || "").slice(0, 18000)),
      structure,
    };
  }
  private assertRevision(id: string, revision: string) {
    this.tab(id);
    if (this.pageRevision(id) !== revision)
      throw Error("Stale page revision. Observe the page again.");
  }
  private async project(signal: AbortSignal) {
    const state = await this.call("workspace_state", {}, signal);
    if (!state.available && !state.id)
      throw Error(
        "Give piccolo-agent a separate workspace grant in Project controls.",
      );
    if (this.projectId !== state.id)
      throw Error("The selected project changed. Start a new scoped task.");
    return state;
  }
  private file(file: string) {
    if (!this.activeSpec?.files.includes(file))
      throw Error("File is outside this task attachment list.");
  }
  private capability(
    id: string,
    description: string,
    schema: z.ZodType,
    permission: AgentCapability["permission"],
    consequential: boolean,
    verification: boolean,
    execute: AgentCapability["execute"],
  ): AgentCapability {
    if (id === "artifact.note" || id === "verify.artifact")
      permission = "artifacts";
    return {
      id,
      description,
      schema,
      permission,
      consequential,
      verification,
      timeoutMs: 30000,
      execute,
    };
  }
  private registry(spec: AgentStart): AgentCapability[] {
    const c: AgentCapability[] = [];
    if (spec.workflow === "gtm") {
      c.push(
        this.capability(
          "write_gtm",
          "Write a source-linked positioning brief plus launch-post/email DRAFTS as Markdown task artifacts. Observe ALL attached competitor tabs first. Competitor fields must be exact visible excerpts (whitespace normalized), or unknown; never use prior knowledge. Use drafts to promote Piccolo only; no competitor facts in drafts. Every number/price/currency in proposedPositioning, launchPost and emailDraft must also be visible on an attached observed page or the write is rejected (omit numbers). Non-numeric claims are not machine-proven. Calls native file approval; NEVER sends/publishes. All files need verify_gtm.",
          gtmSchema,
          "edit",
          true,
          false,
          async (a, s) => {
            if (!spec.edit) throw Error("File-edit permission required.");
            const task = this.engine!.task;
            if (
              task.artifacts.some(
                (item) => item.role && item.role !== "launch-banner",
              )
            )
              throw Error(
                "GTM drafts already exist; review this task before writing another kit.",
              );
            if (this.gtmObservations.size !== spec.tabs.length)
              throw Error(
                "Observe every attached competitor page first; unavailable fields must be unknown.",
              );
            const input = redactAgentValue(a),
              brief = gtmBrief(input, [...this.gtmObservations.values()]);
            // Excerpts are already exact-substring + boundary checked; free text must also
            // carry only numeric values visible on an attached observed page.
            const claimEvidence = this.ledger.claimEvidence(brief.claims),
              freeEvidence = this.ledger.freeTextEvidence([
                { location: "proposedPositioning", text: input.proposedPositioning },
                { location: "launchPost", text: input.launchPost },
                { location: "emailDraft", text: input.emailDraft },
              ]);
            assertEvidence(freeEvidence, "GTM brief/draft text");
            const part = (location: string) =>
              freeEvidence.filter((record) => record.location === location);
            const artifacts = await writeGtmDocuments(
              task.id,
              [
                {
                  role: "positioning-brief",
                  text: brief.text,
                  claims: brief.claims,
                  evidence: toArtifactEvidence([
                    ...claimEvidence,
                    ...part("proposedPositioning"),
                  ]),
                },
                {
                  role: "launch-post",
                  evidence: toArtifactEvidence(part("launchPost")),
                  text: "# Launch post — DRAFT\n\n" + input.launchPost + "\n",
                },
                {
                  role: "email-draft",
                  evidence: toArtifactEvidence(part("emailDraft")),
                  text:
                    "# Email — DRAFT, NOT SENT\n\n" + input.emailDraft + "\n",
                },
              ],
              this.sheets,
              (detail) =>
                this.approval(
                  "Write GTM draft files? Nothing will be published or sent.",
                  detail,
                  s,
                ),
              s,
            );
            for (const artifact of artifacts) {
              artifact.sources = task.sources.filter((source) =>
                this.observedSources.has(source.id),
              );
              task.artifacts.push(artifact);
            }
            for (const claim of brief.claims.filter(
              (claim) => claim.value === "unknown",
            ))
              task.events.push({
                time: Date.now(),
                kind: "observation",
                detail: claim.field + " is unknown: " + claim.url,
              });
            await this.save(task);
            return {
              artifacts: artifacts.map((item) => ({
                id: item.id,
                title: item.title,
              })),
              unknown: brief.claims.filter((claim) => claim.value === "unknown")
                .length,
              draftedOnly: true,
            };
          },
        ),
      );
      const image = this.capability(
        "generate_launch_banner",
        "Generate exactly one actual Piccolo launch banner using the configured AdaL image model. Native approval precedes provider execution. Use only own-product launch text; no competitor content, brands or claims. No placeholder/fallback. Provider/configuration failures stop the GTM task.",
        z.object({ prompt: z.string().min(20).max(1800) }).strict(),
        "provider",
        true,
        false,
        async (a, s) => {
          const task = this.engine!.task;
          if (task.artifacts.some((item) => item.role === "launch-banner"))
            throw Error("This task already generated its one launch banner.");
          if (this.bannerAttempted)
            throw Error(
              "GTM image provider blocked: a banner generation was already attempted. Review uncertain provider effects instead of replaying it.",
            );
          const configured = await adalImageConfiguration();
          if (!configured.available) throw Error(configured.reason);
          const prompt = redactAgentText(a.prompt);
          await this.approval(
            "Generate one launch banner image with AdaL?",
            configured.model +
              "\n" +
              prompt +
              "\nProvider usage may be billed. Only this prompt is sent to the image model.",
            s,
          );
          this.bannerAttempted = true;
          let bytes: Buffer;
          try {
            bytes = await new AdalProvider(
              spec.model,
              path.join(root(), "runtime"),
            ).generateLaunchBanner(prompt, configured.model, s);
          } catch (error) {
            throw Error(
              "GTM image provider blocked; no placeholder or fallback: " +
                String(error),
            );
          }
          const decoded = nativeImage.createFromBuffer(bytes),
            size = decoded.getSize();
          if (
            decoded.isEmpty() ||
            size.width < 1 ||
            size.height < 1 ||
            size.width > 4096 ||
            size.height > 4096
          )
            throw Error("GTM image provider returned an invalid image.");
          const png = decoded.toPNG();
          if (png.length > 2_500_000)
            throw Error("Generated banner exceeds task artifact budget.");
          const id = randomUUID(),
            fileName = id + ".png";
          await this.sheets.write(task.id, fileName, png, s);
          task.artifacts.push({
            id,
            taskId: task.id,
            fileName,
            role: "launch-banner",
            mime: "image/png",
            data: png.toString("base64"),
            sha256: createHash("sha256").update(png).digest("hex"),
            created: Date.now(),
            sources: [],
            verified: false,
            title: "launch-banner.png",
            generation: {
              provider: "AdaL generate_image",
              model: configured.model,
            },
          });
          await this.save(task);
          return {
            artifactId: id,
            width: size.width,
            height: size.height,
            model: configured.model,
            generated: true,
          };
        },
      );
      image.timeoutMs = 180000;
      c.push(image);
      c.push(
        this.capability(
          "verify_gtm",
          "Reopen all three Markdown files and real banner from disk. Check immutable contents, every competitor field source link, explicit unknown markers, and actual image decoding/dimensions. GTM cannot finish until this passes.",
          z.object({}).strict(),
          "artifacts",
          false,
          true,
          async (_a, _s) => {
            const task = this.engine!.task,
              check = await this.verifyGtm(task);
            for (const artifact of task.artifacts.filter((item) => item.role))
              artifact.verified = check.verified;
            await this.save(task);
            return check;
          },
        ),
      );
    }
    if (spec.edit)
      c.push(
        this.capability(
          "write_sheet",
          "Create/update a CSV in this task artifact folder. Exact columns name, product, pricing, source_url, status. Use observed source URLs only. Missing values must be unknown, never guessed; unreachable sources require status unreachable and unknown product/pricing. Updates use the current artifactId; every write invalidates prior verification. File-edit permission and native review required.",
          writeSheetSchema,
          "edit",
          true,
          false,
          async (a, s) => {
            const task = this.engine!.task;
            const previous = a.artifactId
              ? task.artifacts.find(
                  (item) =>
                    item.id === a.artifactId && item.mime === "text/csv",
                )
              : undefined;
            if (a.artifactId && !previous)
              throw Error("Unknown current sheet artifact.");
            const rows = normalizeSheetRows(redactAgentValue(a.rows)),
              sources: SourceReference[] = [];
            for (const row of rows) {
              const source = task.sources.find(
                (source) =>
                  source.url === row.source_url &&
                  this.observedSources.has(source.id),
              );
              if (!source)
                throw Error(
                  "Read this attached source URL before writing its row.",
                );
              if (!sources.some((item) => item.id === source.id))
                sources.push(source);
              if (this.failedSources.has(row.source_url)) {
                row.status = "unreachable";
                row.product = "unknown";
                row.pricing = "unknown";
              } else if (row.status === "unreachable")
                throw Error(
                  "Unreachable status requires an observed navigation failure. Use unknown for unavailable page data.",
                );
            }
            const csv = encodeSheet(rows);
            // Each row is checked against its OWN source_url observation before any approval/write.
            const evidence = this.ledger.csvEvidence(csv, task.sources);
            assertEvidence(evidence, "Sheet");
            const id = randomUUID(),
              fileName = previous?.fileName || id + ".csv";
            const before = previous
              ? await this.sheets.read(task.id, fileName)
              : undefined;
            await this.approval(
              "Write research CSV in task artifacts?",
              (before === undefined
                ? ""
                : "BEFORE:\n" + before + "\nAFTER:\n") +
                csv +
                "\nSaved locally as plaintext CSV. No file is opened or executed.",
              s,
            );
            if (
              !task.grants.some(
                (grant) => grant.scope === "edit" && !grant.revoked,
              )
            )
              throw Error("File-edit permission was revoked.");
            if (
              before !== undefined &&
              (await this.sheets.read(task.id, fileName)) !== before
            )
              throw Error(
                "Sheet changed during approval. Review the current file before updating.",
              );
            await this.sheets.write(task.id, fileName, csv, s);
            const artifact = {
              id,
              taskId: task.id,
              mime: "text/csv",
              sha256: createHash("sha256").update(csv).digest("hex"),
              created: Date.now(),
              sources,
              verified: false,
              title: "Research sheet.csv",
              data: csv,
              fileName,
              evidence: toArtifactEvidence(evidence),
            };
            task.artifacts = task.artifacts.filter(
              (item) => item.id !== previous?.id,
            );
            task.artifacts.push(artifact);
            const unknown = rows
              .filter((row) => row.status !== "ok")
              .map(
                (row) =>
                  row.name +
                  ": " +
                  row.status +
                  " (missing values written as unknown)",
              );
            for (const detail of unknown)
              task.events.push({
                time: Date.now(),
                kind: "observation",
                detail,
              });
            await this.save(task);
            return {
              artifactId: id,
              fileName,
              rows: rows.length,
              unknown,
              numericEvidence: evidenceReport(evidence, 20),
              verificationRequired: "verify_sheet",
            };
          },
        ),
      );
    c.push(
      this.capability(
        "verify_sheet",
        "Reopen the current CSV from disk and compare EVERY cell to immutable extracted rows saved by write_sheet. Returns matched/mismatched/missing records; only an exact match passes.",
        verifySheetSchema,
        "artifacts",
        false,
        true,
        async (a, _s) => {
          const task = this.engine!.task,
            artifact = task.artifacts.find(
              (item) => item.id === a.artifactId && item.mime === "text/csv",
            );
          if (!artifact?.fileName)
            throw Error("Unknown current sheet artifact.");
          const check = await this.sheets.verify(
            task.id,
            artifact.fileName,
            artifact.data,
          );
          // Recheck cell numerics against each row's own source observation.
          const records = this.ledger.csvEvidence(artifact.data, task.sources),
            fully = evidenceSummary(records).fullySupported;
          artifact.evidence = toArtifactEvidence(records);
          artifact.verified = check.verified && fully;
          await this.save(task);
          return {
            artifactId: artifact.id,
            ...check,
            verified: check.verified && fully,
            numericEvidence: evidenceReport(records),
          };
        },
      ),
    );
    const tabArgs = z.object({ tabId: tabSchema }).strict();
    if (spec.tabs.length || spec.terminal) {
      c.push(
        this.capability(
          "browser.observe",
          "Read an attached tab: bounded visible text, reliable selectors, URL and current pageRevision.",
          tabArgs,
          "tabs",
          false,
          false,
          (a, s) => this.observe(a.tabId, s),
        ),
      );
      c.push(
        this.capability(
          "browser.navigate",
          "Navigate an attached tab to HTTP(S). New-origin or query-bearing URLs need native approval.",
          z
            .object({ tabId: tabSchema, url: z.string().url().max(1500) })
            .strict(),
          "tabs",
          false,
          false,
          async (a, s) => {
            const tab = await this.select(a.tabId, s);
            if (!webURL(a.url))
              throw Error("Only HTTP(S) navigation is supported.");
            const next = new URL(a.url);
            if (next.origin !== new URL(tab.url).origin || next.search)
              await this.approval("Allow agent navigation?", a.url, s);
            await this.call("navigate", { url: a.url }, s);
            return { requested: true, tabId: a.tabId };
          },
        ),
      );
      c.push(
        this.capability(
          "browser.interact",
          "Click/type/select/scroll/key on an attached page using a fresh observed pageRevision. Native approval is required for input/click. Observe and verify afterwards.",
          z
            .object({
              tabId: tabSchema,
              pageRevision: z.string().max(150),
              action: z.enum(["click", "type", "select", "scroll", "key"]),
              selector: z.string().max(400).optional(),
              text: z.string().max(1200).optional(),
              key: z
                .enum([
                  "Enter",
                  "Tab",
                  "Escape",
                  "ArrowDown",
                  "ArrowUp",
                  "ArrowLeft",
                  "ArrowRight",
                ])
                .optional(),
              x: z.number().int().min(-2000).max(2000).default(0),
              y: z.number().int().min(-2000).max(2000).default(0),
            })
            .strict(),
          "tabs",
          true,
          false,
          async (a, s) => {
            await this.select(a.tabId, s);
            this.assertRevision(a.tabId, a.pageRevision);
            if (a.action !== "scroll")
              await this.approval(
                "Allow agent page interaction?",
                JSON.stringify(a),
                s,
              );
            this.assertRevision(a.tabId, a.pageRevision);
            if (a.action === "click")
              return this.call(
                "browser_click",
                { tabId: a.tabId, selector: a.selector },
                s,
              );
            if (a.action === "type")
              return this.call(
                "browser_type",
                { tabId: a.tabId, selector: a.selector, text: a.text || "" },
                s,
              );
            return this.call(
              "browser_input",
              {
                tabId: a.tabId,
                action: a.action,
                selector: a.selector,
                value: a.text,
                key: a.key,
                x: a.x,
                y: a.y,
              },
              s,
            );
          },
        ),
      );
      c.push(
        this.capability(
          "browser.wait",
          "Wait for a selector or visible text on an attached page (condition based, at most 12 seconds).",
          z
            .object({
              tabId: tabSchema,
              selector: z.string().max(400).optional(),
              text: z.string().max(400).optional(),
            })
            .strict(),
          "tabs",
          false,
          false,
          async (a, s) => {
            await this.select(a.tabId, s);
            if (!a.selector && !a.text)
              throw Error("A selector or text is required.");
            return this.call(
              "browser_wait",
              {
                selector: a.selector,
                text: a.text,
                timeoutMs: 12000,
                tabId: a.tabId,
              },
              s,
            );
          },
        ),
      );
      c.push(
        this.capability(
          "verify.page",
          "Independently read an attached page and require expected visible text (whitespace-normalised). Numbers/prices/currency in expected are PINNED per tab before testing: a failed attempt cannot be retried with a changed or dropped amount, and amounts must match with exact boundaries (19 is not 199, USD 19 is not EUR 19). Only use expectations matching the user task.",
          z
            .object({ tabId: tabSchema, expected: z.string().min(1).max(800) })
            .strict(),
          "tabs",
          false,
          true,
          async (a, s) =>
            // Pins numeric/currency expectations BEFORE the page is tested, so a
            // failed attempt cannot be retried with a changed or dropped amount.
            verifyPageExpectation(this.ledger, a, async () => {
              const observation = await this.observe(a.tabId, s);
              return { url: observation.url, text: observation.text };
            }),
        ),
      );
      c.at(-1)!.targetKey = (a) => "tab:" + a.tabId;
      if (spec.screenshots)
        c.push(
          this.capability(
            "browser.screenshot",
            "Capture only an attached tab; sends its image to AdaL under the task screenshot transmission grant.",
            tabArgs,
            "provider",
            false,
            false,
            async (a, s) => {
              await this.select(a.tabId, s);
              const revision = this.pageRevision(a.tabId);
              const r = await this.call(
                "browser_screenshot",
                { tabId: a.tabId },
                s,
              );
              if (revision !== this.pageRevision(a.tabId))
                throw Error("Screenshot target changed. Observe again.");
              const image = r.images?.[0];
              if (!image) throw Error("No screenshot returned.");
              return this.imageArtifact(
                "Tab screenshot",
                image.data,
                "image/png",
                { kind: "tab", id: a.tabId, title: this.tab(a.tabId).title },
              );
            },
          ),
        );
    }
    if (spec.files.length) {
      c.push(
        this.capability(
          "file.read",
          "Read only an explicitly attached ordinary project file and its current revision.",
          z.object({ path: fileSchema }).strict(),
          "files",
          false,
          false,
          async (a, s) => {
            this.file(a.path);
            await this.project(s);
            const r = await this.call(
              "workspace_files",
              { action: "read", path: a.path },
              s,
            );
            if (r.text.length > 24000)
              throw Error("Attached file exceeds 24 KB agent context limit.");
            if (r.text.includes("\0"))
              throw Error(
                "Agent file editing supports text files only. Attach images separately.",
              );
            const safe = redactAgentText(r.text);
            r.redacted = r.redacted || safe !== r.text;
            r.text = safe;
            this.observedSources.add(a.path);
            this.ledger.files.set(a.path, safe);
            const source = this.engine!.task.sources.find(
              (source) => source.kind === "file" && source.id === a.path,
            );
            if (source) source.revision = r.revision;
            return r;
          },
        ),
      );
      c.push(
        this.capability(
          "git.diff",
          "Inspect a real Git diff for an attached file. No commits, staging, hooks, push or deploy.",
          z.object({ path: fileSchema }).strict(),
          "files",
          false,
          false,
          async (a, s) => {
            this.file(a.path);
            await this.project(s);
            return this.call(
              "workspace_git",
              { operation: "diff", path: a.path },
              s,
            );
          },
        ),
      );
      c.push(
        this.capability(
          "verify.file",
          "Independently read the saved attached file and check expected exact text.",
          z
            .object({ path: fileSchema, expected: z.string().min(1).max(1000) })
            .strict(),
          "files",
          false,
          true,
          async (a, s) => {
            this.file(a.path);
            await this.project(s);
            const r = await this.call(
              "workspace_files",
              { action: "read", path: a.path },
              s,
            );
            if (!r.text.includes(a.expected))
              throw Error("Expected saved file text is absent.");
            return {
              verified: true,
              path: a.path,
              revision: r.revision,
              expected: a.expected,
            };
          },
        ),
      );
      if (spec.edit)
        c.push(
          this.capability(
            "file.write",
            "Replace an attached file using the SHA revision from file.read. Native diff approval and dirty-buffer conflict checks apply.",
            z
              .object({
                path: fileSchema,
                text: z.string().max(24000),
                revision: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
            "edit",
            true,
            false,
            async (a, s) => {
              this.file(a.path);
              await this.project(s);
              const before = await this.call(
                "workspace_files",
                { action: "read", path: a.path },
                s,
              );
              if (before.revision !== a.revision)
                throw Error("Disk changed. Read and propose the edit again.");
              if (
                before.redacted ||
                before.text.includes("\0") ||
                redactAgentText(before.text) !== before.text
              )
                throw Error(
                  "Recognizable credentials or binary data were found. Edit this file manually; the agent cannot safely replace redacted content.",
                );
              await this.approval(
                "Review agent file replacement",
                a.path + "\nBEFORE:\n" + before.text + "\nAFTER:\n" + a.text,
                s,
              );
              await this.project(s);
              return this.call("workspace_files", { action: "write", ...a }, s);
            },
          ),
        );
    }
    if (spec.terminal) {
      c.push(
        this.capability(
          "terminal.start",
          "Start an explicitly approved shell for this task. Never start project scripts automatically.",
          z.object({}).strict(),
          "terminal",
          true,
          false,
          async (_a, s) => {
            await this.project(s);
            const r = await this.call(
              "workspace_terminal",
              { action: "start" },
              s,
            );
            this.hasTerminal = true;
            return r;
          },
        ),
      );
      c.push(
        this.capability(
          "terminal.input",
          "Send one complete command/input to this task shell. Every input requires native user approval; no automatic install/commit/push/deploy.",
          z.object({ text: textSchema }).strict(),
          "terminal",
          true,
          false,
          async (a, s) => {
            await this.project(s);
            if (!this.hasTerminal)
              throw Error("Start the task terminal first.");
            return this.call(
              "workspace_terminal",
              {
                action: "input",
                text: a.text.endsWith("\r") ? a.text : a.text + "\r",
              },
              s,
            );
          },
        ),
      );
      c.push(
        this.capability(
          "terminal.read",
          "Read output only from the task-owned shell. Output is bounded and may contain sensitive data.",
          z.object({}).strict(),
          "terminal",
          false,
          false,
          async (_a, s) => {
            await this.project(s);
            if (!this.hasTerminal) throw Error("No task-owned terminal.");
            const r = await this.call(
              "workspace_terminal",
              { action: "read" },
              s,
            );
            return { ...r, text: redactAgentText(r.text.slice(-12000)) };
          },
        ),
      );
      c.push(
        this.capability(
          "preview.open",
          "Open a loopback development preview in a new browser tab; that tab becomes explicitly included in this task.",
          z.object({ url: z.string().url().max(1500) }).strict(),
          "tabs",
          false,
          false,
          async (a, s) => {
            await this.project(s);
            const u = new URL(a.url);
            if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
              throw Error("Loopback preview only.");
            await this.call("workspace_preview", { url: a.url }, s);
            const tab = this.b.state.tabs.find((t) => t.url === u.href);
            if (!tab) throw Error("Preview tab did not appear.");
            this.attachTab(tab.id);
            this.engine!.task.sources.push({
              kind: "tab",
              id: tab.id,
              title: "Local project preview",
            });
            return { tabId: tab.id, url: tab.url };
          },
        ),
      );
    }
    if (spec.images.length || spec.screenshots) {
      c.push(
        this.capability(
          "image.findings",
          "Record structured findings grounded in an attached image, with its source image id. The user reviews them before follow-up actions.",
          z
            .object({
              imageId: z.string().max(100),
              findings: z.array(z.string().min(1).max(1000)).min(1).max(12),
              limitations: z.string().max(1000),
            })
            .strict(),
          "provider",
          false,
          false,
          async (a, s) => {
            const image = this.images.get(a.imageId);
            if (!image || !spec.images.includes(a.imageId))
              throw Error("Image is not attached to this task.");
            a.findings = a.findings.map(redactAgentText);
            a.limitations = redactAgentText(a.limitations);
            await this.approval(
              "Review image findings",
              a.findings.join("\n") + "\nLimitations: " + a.limitations,
              s,
            );
            const data = JSON.stringify(a, null, 2),
              task = this.engine!.task;
            const artifact = {
              id: randomUUID(),
              taskId: task.id,
              mime: "application/json",
              sha256: createHash("sha256").update(data).digest("hex"),
              data,
              created: Date.now(),
              sources: [
                { kind: "image" as const, id: image.id, title: image.title },
              ],
              verified: false,
              title: "Image findings",
            };
            task.artifacts.push(artifact);
            await this.save(task);
            return {
              artifactId: artifact.id,
              findings: a.findings,
              userReviewed: true,
            };
          },
        ),
      );
    }
    c.push(
      this.capability(
        "artifact.note",
        "Create bounded research/extraction notes with source ids that belong to this task. Every number/price/currency amount in title or text must appear (with exact numeric/currency boundaries) in the observed text of a DECLARED source, otherwise the note is rejected; set acknowledgeUnsupportedNumbers only to deliberately keep unproven values flagged unknown (such a note can never verify). Non-numeric claims are not machine-proven.",
        z
          .object({
            title: z.string().min(1).max(150),
            text: z.string().min(1).max(12000),
            sourceIds: z.array(z.string().max(100)).min(1).max(15),
            acknowledgeUnsupportedNumbers: z.boolean().default(false),
          })
          .strict(),
        "files",
        false,
        false,
        async (a, _s) => {
          a.text = redactAgentText(a.text);
          a.title = redactAgentText(a.title);
          const task = this.engine!.task,
            sources = task.sources.filter((x) => a.sourceIds.includes(x.id));
          if (sources.length !== new Set(a.sourceIds).size)
            throw Error("Artifact references unattached sources.");
          if (sources.some((source) => !this.observedSources.has(source.id)))
            throw Error(
              "Read the attached source before citing it in an artifact.",
            );
          const records = this.ledger.noteEvidence(
            a,
            sources,
            a.acknowledgeUnsupportedNumbers,
          );
          assertEvidence(records, "Artifact note");
          // Acknowledged unknowns are marked inside the saved note text itself.
          const text = flagUnknownText(a.text, records);
          const artifact: AgentArtifact = {
            id: randomUUID(),
            taskId: task.id,
            mime: "text/plain",
            sha256: createHash("sha256").update(text).digest("hex"),
            data: text,
            created: Date.now(),
            sources,
            verified: false,
            title: a.title,
            evidence: toArtifactEvidence(
              records,
              a.acknowledgeUnsupportedNumbers,
            ),
          };
          task.artifacts.push(artifact);
          await this.save(task);
          return {
            artifactId: artifact.id,
            title: artifact.title,
            numericEvidence: evidenceReport(records, 20),
          };
        },
      ),
    );
    c.push(
      this.capability(
        "verify.artifact",
        "Verify stored artifact bytes, attached source references and read-back hash. This verifies provenance/storage, not factual truth of model analysis.",
        z.object({ artifactId: z.string().max(100) }).strict(),
        "files",
        false,
        true,
        async (a, _s) => {
          const task = this.engine!.task,
            artifact = task.artifacts.find((x) => x.id === a.artifactId);
          if (!artifact) throw Error("Unknown task artifact.");
          if (artifact.mime === "text/csv")
            throw Error(
              "CSV requires cell-by-cell verify_sheet, not generic artifact verification.",
            );
          await this.save(task);
          const stored = await this.archive.read();
          const metadata = stored
            .find((t) => t.id === task.id)
            ?.artifacts.find((item) => item.id === artifact.id);
          const saved = metadata && (await this.archive.artifact(metadata));
          if (!saved)
            throw Error("Artifact missing during encrypted disk read-back.");
          if (
            createHash("sha256")
              .update(
                saved.mime.startsWith("image/")
                  ? Buffer.from(saved.data, "base64")
                  : saved.data,
              )
              .digest("hex") !== artifact.sha256
          )
            throw Error("Artifact hash mismatch.");
          // Source-derived notes: recheck every numeric value against the CURRENT observed
          // text of the declared sources. Code/file/vision artifacts keep storage-only semantics.
          const records = this.ledger.recheckArtifact(artifact, task.sources);
          if (records) {
            artifact.evidence = toArtifactEvidence(
              records,
              !!artifact.evidence?.acknowledgedUnknown,
            );
            if (!evidenceSummary(records).acceptable) artifact.verified = false;
            assertEvidence(records, "Artifact");
          }
          const fully = !records || evidenceSummary(records).fullySupported;
          artifact.verified = fully;
          await this.save(task);
          return {
            verified: fully,
            artifactId: artifact.id,
            ...(records ? { numericEvidence: evidenceReport(records) } : {}),
            scope:
              "Artifact storage hash and attached source provenance" +
              (records
                ? ", plus numeric/currency values matched against observed attached-source text (non-numeric claims are NOT proven)"
                : "") +
                "; findings require user review.",
          };
        },
      ),
    );
    return spec.workflow === "gtm"
      ? c.filter((capability) =>
          [
            "browser.observe",
            "write_gtm",
            "generate_launch_banner",
            "verify_gtm",
          ].includes(capability.id),
        )
      : c;
  }
  /** Completion prose may only contain numbers backed by page/file/code evidence or recorded system data. */
  private auditSummary(summary: string, task: AgentTask) {
    const sources: EvidenceSource[] = [
      ...[...this.gtmObservations.values()].map((page): EvidenceSource => ({
        id: page.tabId,
        url: page.url,
        kind: "page",
        text: page.text,
        unreachable: page.unreachable,
      })),
      ...[...this.ledger.files].map(([id, text]): EvidenceSource => ({
        id,
        url: id,
        kind: "file",
        text,
      })),
      {
        id: "recorded-steps",
        url: "recorded code/file/terminal step results",
        kind: "recorded",
        text: task.steps
          .filter((step) => RECORDED_EVIDENCE_CAPABILITIES.includes(step.capability))
          .map((step) => JSON.stringify(step.result ?? ""))
          .join("\n"),
      },
    ];
    return checkNumericSupport(summary, "completion summary", sources);
  }
  private async verifyGtm(task: AgentTask) {
    const checks: Record<string, unknown>[] = [];
    for (const role of [
      "positioning-brief",
      "launch-post",
      "email-draft",
      "launch-banner",
    ] as const) {
      const artifact = task.artifacts.find((item) => item.role === role);
      if (!artifact?.fileName) {
        checks.push({
          role,
          verified: false,
          error: "Required artifact missing",
        });
        continue;
      }
      try {
        const bytes = await this.sheets.readBytes(task.id, artifact.fileName);
        let verified =
          createHash("sha256").update(bytes).digest("hex") === artifact.sha256;
        if (role === "launch-banner") {
          const image = nativeImage.createFromBuffer(bytes),
            size = image.getSize();
          verified =
            verified && !image.isEmpty() && size.width > 0 && size.height > 0;
          checks.push({ role, verified, ...size });
        } else {
          const text = bytes.toString("utf8"),
            claims =
              role === "positioning-brief"
                ? verifyGtmBrief(text, artifact.claims || [])
                : undefined;
          // Recheck numbers from the on-disk text against the current attached observations.
          const records = this.ledger.gtmArtifactEvidence(
              role,
              text,
              artifact.claims || [],
            ),
            numeric = evidenceSummary(records);
          artifact.evidence = toArtifactEvidence(records);
          verified = verified && (!claims || claims.verified) && numeric.fullySupported;
          checks.push({
            role,
            verified,
            ...(claims ? { sourceCheck: claims } : {}),
            numericEvidence: evidenceReport(records, 15),
          });
        }
      } catch (error) {
        checks.push({
          role,
          verified: false,
          error: String(error).slice(0, 300),
        });
      }
    }
    return {
      verified: checks.every((check) => check.verified === true),
      checks,
      draftedOnly: true,
      networkSendOrPublish: false,
    };
  }
  private attachTab(id: string) {
    if (this.liveTabIds.has(id)) return;
    this.liveTabIds.add(id);
    const attached = this.b.state.tabs.find((t) => t.id === id);
    if (attached) this.origins.set(id, new URL(attached.url).origin);
    if (this.executing && this.engine) {
      let grant = this.engine.task.grants.find(
        (g) => g.scope === "tabs" && !g.revoked,
      );
      if (!grant) {
        grant = {
          id: randomUUID(),
          scope: "tabs",
          resources: [],
          revoked: false,
        };
        this.engine.task.grants.push(grant);
      }
      if (!grant.resources.includes(id)) grant.resources.push(id);
    }
    this.navigation.set(id, ++this.revision);
    const wc = this.b.views.get(id)?.webContents;
    if (wc) {
      const changed = () => this.navigation.set(id, ++this.revision);
      wc.on("did-start-navigation", changed);
      this.cleanup.push(() => {
        if (!wc.isDestroyed())
          wc.removeListener("did-start-navigation", changed);
      });
    }
  }
  private async imageArtifact(
    title: string,
    data: string,
    mime: string,
    source: SourceReference,
  ) {
    if (data.length > 2_000_000 || this.currentImages.length >= 3)
      throw Error("Image exceeds task limits (2 MB each, 3 images total).");
    const image = {
      id: randomUUID(),
      title,
      data: "data:" + mime + ";base64," + data,
      sha256: createHash("sha256")
        .update(Buffer.from(data, "base64"))
        .digest("hex"),
    };
    this.images.set(image.id, image);
    this.observedSources.add(image.id);
    this.activeSpec!.images.push(image.id);
    this.currentImages.push(image.data);
    this.engine!.task.sources.push({ kind: "image", id: image.id, title });
    this.engine!.task.artifacts.push({
      id: image.id,
      taskId: this.engine!.task.id,
      mime,
      sha256: image.sha256,
      data,
      created: Date.now(),
      sources: [source],
      verified: false,
      title,
    });
    return { imageId: image.id, title, source };
  }
  async start(raw: unknown) {
    if (this.starting || this.executing)
      throw Error("An agent task or its cleanup is already running.");
    this.starting = true;
    try {
      await this.load();
      if (this.engine && terminalTaskStates.includes(this.engine.task.status))
        throw Error(
          "One agent task is allowed at a time. Stop or finish the current task.",
        );
      if (!this.client)
        throw Error("Connect Piccolo Agent and grant browser access first.");
      const spec = agentStart.parse(raw);
      if (spec.workflow === "gtm") {
        if (
          !spec.edit ||
          !spec.tabs.length ||
          spec.files.length ||
          spec.terminal ||
          spec.images.length ||
          spec.screenshots
        )
          throw Error(
            "GTM requires attached competitor tabs and file-edit permission only; no terminal, project files, or screenshot attachments.",
          );
        const configured = await adalImageConfiguration();
        if (!configured.available) throw Error(configured.reason);
      }
      spec.instruction = redactAgentText(spec.instruction);
      if (spec.files.some((file) => redactAgentText(file) !== file))
        throw Error(
          "Choose an ordinary file path without embedded credentials.",
        );
      if (redactAgentText(spec.model) !== spec.model)
        throw Error("Enter a model registry name, not an API key.");
      spec.tabs = [...new Set(spec.tabs)];
      spec.files = [...new Set(spec.files)];
      spec.images = [...new Set(spec.images)];
      for (const id of spec.tabs)
        if (!this.b.state.tabs.some((t) => t.id === id && webURL(t.url)))
          throw Error("Select only existing normal website tabs.");
      for (const id of spec.images)
        if (!this.images.has(id)) throw Error("Unknown image attachment.");
      if (
        spec.images.reduce(
          (total, id) => total + this.images.get(id)!.data.length,
          0,
        ) > 3_000_000
      )
        throw Error(
          "Selected images exceed the combined task budget. Attach fewer or smaller images.",
        );
      await this.approval(
        "Allow selected task data to be sent to AdaL?",
        JSON.stringify({
          instruction: spec.instruction,
          tabs: spec.tabs.map(
            (id) => this.b.state.tabs.find((t) => t.id === id)?.url,
          ),
          files: spec.files,
          images: spec.images.map((id) => this.images.get(id)?.title),
          screenshots: spec.screenshots,
          edit: spec.edit,
          workflow: spec.workflow,
          terminal: spec.terminal,
          model: spec.model || "AdaL configured default",
          maxCalls: spec.maxCalls,
        }) +
          "\nAdaL uses its configured model service and credentials. Only selected data is sent. Terminal inputs, file changes and consequential page interactions require further native approval.",
        AbortSignal.any([AbortSignal.timeout(120000), this.lifecycle.signal]),
      );
      if (!this.client || this.lifecycle.signal.aborted)
        throw Error("Agent disconnected before task start.");
      if (!(await safeStorage.isAsyncEncryptionAvailable()))
        throw Error("OS encryption is required for agent history.");
      this.projectId = undefined;
      if (spec.files.length || spec.terminal) {
        const state = await this.call(
          "workspace_state",
          {},
          AbortSignal.timeout(30000),
        );
        if (!state.id || !state.trusted)
          throw Error(
            "Open/trust a project and grant piccolo-agent workspace permission in Project controls first.",
          );
        if (spec.terminal && state.terminalRunning)
          throw Error(
            "Stop the existing project terminal before starting an agent-owned shell.",
          );
        if (state.editor?.ready === false)
          throw Error(
            "Code workbench is still loading. Wait for the editor, then start the task.",
          );
        this.projectId = state.id;
      }
      this.activeSpec = spec;
      this.liveTabIds.clear();
      this.origins.clear();
      this.originApprovals = 0;
      this.observedSources = new Set(spec.images);
      this.failedSources.clear();
      this.gtmObservations.clear();
      this.ledger.reset();
      this.bannerAttempted = false;
      this.cleanup.forEach((fn) => fn());
      this.cleanup = [];
      for (const id of spec.tabs) this.attachTab(id);
      const sources: SourceReference[] = [
        ...spec.tabs.map((id) => ({
          kind: "tab" as const,
          id,
          title: redactAgentText(this.tab(id).title),
          url: redactAgentText(this.tab(id).url),
        })),
        ...spec.files.map((id) => ({ kind: "file" as const, id, title: id })),
        ...spec.images.map((id) => ({
          kind: "image" as const,
          id,
          title: this.images.get(id)!.title,
        })),
      ];
      const engine = new AgentEngine(
        new AdalProvider(spec.model, path.join(root(), "runtime")),
        this.registry(spec),
        spec.instruction,
        sources,
        spec.maxCalls,
        (t) => this.save(t),
        async (task) => {
          if (spec.workflow === "gtm" && !(await this.verifyGtm(task)).verified)
            throw Error(
              "GTM completion blocked: required files, claim sources, unknown markers or banner are unverified.",
            );
          for (const artifact of task.artifacts.filter(
            (item) => item.mime === "text/csv",
          )) {
            const check = await this.sheets.verify(
              task.id,
              artifact.fileName!,
              artifact.data,
            );
            if (!check.verified) {
              artifact.verified = false;
              throw Error(
                "Sheet changed before completion: " +
                  check.mismatched +
                  " mismatched / " +
                  check.missing +
                  " missing cells.",
              );
            }
          }
          // Final recheck of source-derived numerics against current observations.
          for (const artifact of task.artifacts) {
            const records = this.ledger.recheckArtifact(artifact, task.sources);
            if (records && !evidenceSummary(records).acceptable) {
              artifact.verified = false;
              assertEvidence(records, "Artifact \"" + artifact.title + "\"");
            }
            if (records) artifact.evidence = toArtifactEvidence(records, !!artifact.evidence?.acknowledgedUnknown);
          }
          if (this.ledger.pins.outstanding().length)
            throw Error(
              "Unresolved verify.page numeric expectations remain for: " +
                this.ledger.pins.outstanding().join(", "),
            );
        },
        (summary, task) => this.auditSummary(summary, task),
      );
      this.engine = engine;
      const grant = (scope: AgentGrant["scope"], resources: string[]) => {
        if (resources.length)
          engine.task.grants.push({
            id: randomUUID(),
            scope,
            resources,
            revoked: false,
          });
      };
      grant("provider", ["adal", ...spec.images, ...spec.tabs, ...spec.files]);
      grant("artifacts", [engine.task.id]);
      grant("tabs", spec.tabs);
      grant("files", spec.files);
      if (spec.edit) grant("edit", [...spec.files, engine.task.id]);
      if (spec.terminal) grant("terminal", [this.projectId!]);
      this.barHidden = false;
      this.executing = true;
      this.currentImages = spec.images.map((id) => this.images.get(id)!.data);
      for (const id of spec.images) {
        const image = this.images.get(id)!;
        engine.task.artifacts.push({
          id,
          taskId: engine.task.id,
          mime: "image/png",
          sha256: image.sha256,
          data: image.data.split(",")[1],
          created: Date.now(),
          sources: [{ kind: "image", id, title: image.title }],
          verified: false,
          title: image.title,
        });
      }
      this.b.agentTasks++;
      const run = async () => {
        try {
          await engine.run(this.currentImages);
        } finally {
          await this.stopTerminal();
          this.cleanup.forEach((fn) => fn());
          this.cleanup = [];
          this.b.agentTasks--;
          this.executing = false;
          this.currentImages = [];
          this.notify();
        }
      };
      this.running = run().catch((error) => {
        engine.task.status = "failed";
        engine.task.error = String(error).slice(0, 800);
        this.notify();
      });
      return { taskId: engine.task.id };
    } finally {
      this.starting = false;
    }
  }
  private async stopTerminal() {
    if (this.hasTerminal) {
      await this.call(
        "workspace_terminal",
        { action: "stop" },
        AbortSignal.timeout(10000),
      ).catch(() => {});
      this.hasTerminal = false;
    }
  }
  async control(action: string) {
    if (!this.engine) throw Error("No current task.");
    if (action === "hide" || action === "show") {
      this.barHidden = action === "hide";
      this.notify();
      return { ok: true };
    }
    if (action === "pause") {
      await this.engine.pause();
      await this.stopTerminal();
    } else if (action === "resume") {
      for (const id of this.liveTabIds)
        this.navigation.set(id, ++this.revision);
      await this.engine.resume();
    } else {
      await this.engine.cancel();
      await this.stopTerminal();
      if (action === "takeover") {
        this.activeSpec = undefined;
        this.liveTabIds.clear();
      }
    }
    return { ok: true };
  }
  async attachImage() {
    if (this.engine && terminalTaskStates.includes(this.engine.task.status))
      throw Error("Attach images before starting a task.");
    if (this.images.size >= 6)
      throw Error("Remove/clear attachments before adding more images.");
    const { filePaths } = await dialog.showOpenDialog(this.b.win, {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!filePaths[0]) return { cancelled: true };
    if ((await stat(filePaths[0])).size > 5_000_000)
      throw Error("Image exceeds 5 MB.");
    const input = nativeImage.createFromBuffer(await readFile(filePaths[0]));
    if (input.isEmpty()) throw Error("Could not decode image.");
    const size = input.getSize();
    if (size.width * size.height > 24_000_000)
      throw Error("Image dimensions exceed limit.");
    const scale = Math.min(1, 1200 / size.width, 1200 / size.height);
    const png = input
        .resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
        })
        .toPNG(),
      id = randomUUID();
    if (png.length > 1_500_000)
      throw Error("Resized image exceeds the 1.5 MB context limit.");
    this.images.set(id, {
      id,
      title: path.basename(filePaths[0]),
      data: "data:image/png;base64," + png.toString("base64"),
      sha256: createHash("sha256").update(png).digest("hex"),
    });
    return { id };
  }
  async artifact(id: string) {
    await this.load();
    await this.writes;
    const artifact = this.history
      .flatMap((t) => t.artifacts)
      .find((a) => a.id === id);
    if (!artifact) throw Error("Unknown artifact.");
    if (artifact.role && artifact.fileName) {
      const bytes = await this.sheets.readBytes(
        artifact.taskId,
        artifact.fileName,
      );
      return {
        ...artifact,
        data: artifact.mime.startsWith("image/")
          ? bytes.toString("base64")
          : bytes.toString("utf8"),
        verified:
          artifact.verified &&
          createHash("sha256").update(bytes).digest("hex") === artifact.sha256,
      };
    }
    if (artifact.mime === "text/csv" && artifact.fileName) {
      const data = await this.sheets.read(artifact.taskId, artifact.fileName);
      const check = await this.sheets.verify(
        artifact.taskId,
        artifact.fileName,
        (await this.archive.artifact(artifact)).data,
      );
      return {
        ...artifact,
        data,
        verified: artifact.verified && check.verified,
        sha256: createHash("sha256").update(data).digest("hex"),
      };
    }
    return this.archive.artifact(artifact);
  }
  async exportSummary(id: string) {
    await this.load();
    const task = this.history.find((t) => t.id === id);
    if (!task) throw Error("Unknown task.");
    const { filePath } = await dialog.showSaveDialog(this.b.win, {
      defaultPath: "piccolo-task-summary.json",
      filters: [{ name: "Task summary", extensions: ["json"] }],
    });
    if (!filePath) return { cancelled: true };
    const summary = {
      id: task.id,
      status: task.status,
      created: task.created,
      updated: task.updated,
      provider: task.provider,
      calls: task.calls,
      checks: task.steps.map((s) => ({
        capability: s.capability,
        status: s.status,
        verified: s.verified,
      })),
      artifacts: task.artifacts.map((a) => ({
        id: a.id,
        mime: a.mime,
        sha256: a.sha256,
        verified: a.verified,
      })),
      redaction:
        "Instructions, file/page/image contents, URLs, paths, command text and detailed errors are excluded.",
    };
    await writeFile(filePath, JSON.stringify(summary, null, 2));
    return { exported: true };
  }
  async remove(id?: string) {
    if (this.executing || this.starting)
      throw Error("Wait for task cleanup before deleting records.");
    if (this.engine && terminalTaskStates.includes(this.engine.task.status))
      throw Error("Stop the active task before deleting history.");
    if (id && !this.history.some((task) => task.id === id))
      return { notFound: true };
    this.images.clear();
    this.history = id ? this.history.filter((t) => t.id !== id) : [];
    if (!id || this.engine?.task.id === id) this.engine = undefined;
    if (this.history.length) await this.save(this.history.at(-1)!);
    else {
      await this.writes.catch(() => {});
      await this.archive.clear();
    }
    this.notify();
    return { ok: true };
  }
  async close() {
    if (this.closing) return this.closing;
    this.closing = this.closeImpl();
    try {
      await this.closing;
    } finally {
      this.closing = undefined;
    }
  }
  private async closeImpl() {
    this.lifecycle.abort(Error("Agent disconnected."));
    await this.engine?.cancel();
    await this.running;
    await this.stopTerminal();
    await this.client?.close().catch(() => {});
    this.client = undefined;
    await this.transport?.close().catch(() => {});
    this.transport = undefined;
    await this.writes.catch(() => {});
    this.barHidden = true;
    this.notify();
  }
  async revoke(scope: { principal?: string; project?: string }) {
    if (!this.executing) return;
    if (scope.principal && scope.principal !== this.principal) return;
    if (scope.project && scope.project !== this.projectId) return;
    await this.control("takeover");
  }
}
export async function handleAgent(b: Browser, action: string, value?: unknown) {
  if (b.state.private)
    throw Error("Agents are available only in normal windows.");
  let service = services.get(b);
  if (!service && services.size)
    throw Error(
      "The Agent workspace belongs to another Piccolo window. Use or close that window first.",
    );
  if (!service) {
    service = new AgentService(b);
    services.set(b, service);
  }
  switch (action) {
    case "status":
      return service.state();
    case "connect":
      return service.connect();
    case "disconnect":
      return service.close();
    case "start":
      return service.start(value);
    case "attach-image":
      return service.attachImage();
    case "artifact":
      return service.artifact(z.string().uuid().parse(value));
    case "delete":
      return service.remove(z.string().uuid().optional().parse(value));
    case "export-summary":
      return service.exportSummary(z.string().uuid().parse(value));
    case "pause":
    case "resume":
    case "cancel":
    case "takeover":
    case "hide":
    case "show":
      return service.control(action);
    default:
      throw Error("Unknown agent action.");
  }
}
export async function shutdownAgents() {
  await Promise.allSettled([...services.values()].map((s) => s.close()));
}
export async function revokeAgent(scope: {
  principal?: string;
  project?: string;
}) {
  await Promise.allSettled(
    [...services.values()].map((service) => service.revoke(scope)),
  );
}
