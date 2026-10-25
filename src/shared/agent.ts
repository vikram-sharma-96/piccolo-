import { z } from "zod";
import type { ArtifactEvidence } from "./agent-evidence";
export function redactAgentText(value: string): string {
  return value
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED]",
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~-]{12,}/gi, "$1[REDACTED]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)["']?\s*[:=]\s*["']?)([^\s"'<>;,]{4,})/gi,
      "$1[REDACTED]",
    );
}
export function redactAgentValue<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "string" ? redactAgentText(item) : item,
    ),
  );
}
export const agentDecision = z
  .object({
    plan: z.array(z.string().max(240)).max(12).default([]),
    objective: z.string().min(1).max(400),
    capability: z.string().min(1).max(80),
    arguments: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type AgentDecision = z.infer<typeof agentDecision>;
export type StepStatus =
  | "pending"
  | "running"
  | "waiting-approval"
  | "succeeded"
  | "failed"
  | "canceled"
  | "skipped";
export type TaskStatus =
  | "planning"
  | "acting"
  | "verifying"
  | "waiting-approval"
  | "paused"
  | "completed"
  | "failed"
  | "canceled"
  | "interrupted";
export interface SourceReference {
  kind: "tab" | "file" | "image" | "artifact";
  id: string;
  revision?: string;
  title: string;
  url?: string;
}
export interface AgentGrant {
  id: string;
  scope:
    | "tabs"
    | "files"
    | "edit"
    | "terminal"
    | "provider"
    | "external"
    | "artifacts";
  resources: string[];
  revoked: boolean;
}
export interface AgentApproval {
  id: string;
  objective: string;
  scope: AgentGrant["scope"];
  status: "pending" | "allowed" | "denied";
}
export interface AgentArtifact {
  id: string;
  taskId: string;
  mime: string;
  sha256: string;
  created: number;
  sources: SourceReference[];
  verified: boolean;
  title: string;
  data: string;
  fileName?: string;
  role?: 'positioning-brief'|'launch-post'|'email-draft'|'launch-banner';
  claims?: {field:string;value:string;url:string;tabId:string}[];
  generation?: {provider:string;model:string};
  /** Per-value numeric/currency support records (page-derived prose only). */
  evidence?: ArtifactEvidence;
}
export interface AgentStep {
  id: string;
  objective: string;
  capability: string;
  status: StepStatus;
  started: number;
  ended?: number;
  inputSummary: string;
  result?: unknown;
  error?: string;
  permission: string;
  grantId?: string;
  verified: boolean;
  /** Stable verification target (e.g. tab id); a failure is cleared only by success on the same target. */
  target?: string;
}
export interface AgentEvent {
  time: number;
  kind:
    | "planning"
    | "action"
    | "approval"
    | "observation"
    | "verification"
    | "checkpoint"
    | "error"
    | "control";
  detail: string;
  stepId?: string;
}
export interface AgentTask {
  grants: AgentGrant[];
  capabilities: string[];
  pendingApproval?: AgentApproval;
  id: string;
  instruction: string;
  provider: string;
  model: string;
  status: TaskStatus;
  created: number;
  updated: number;
  plan: string[];
  steps: AgentStep[];
  events: AgentEvent[];
  sources: SourceReference[];
  artifacts: AgentArtifact[];
  error?: string;
  calls: number;
  maxCalls: number;
  checkpoint: { next: number; replay: false };
}
export interface AgentProvider {
  id: string;
  model: string;
  text: boolean;
  vision: boolean;
  structured: boolean;
  streaming: boolean;
  audio: boolean;
  query(prompt: string, images: string[], signal: AbortSignal): Promise<string>;
  close(): Promise<void>;
}
export interface AgentCapability {
  id: string;
  description: string;
  schema: z.ZodType;
  permission: AgentGrant["scope"];
  consequential: boolean;
  verification: boolean;
  timeoutMs: number;
  targetKey?(args: any): string;
  execute(args: any, signal: AbortSignal): Promise<unknown>;
}
export const agentStart = z
  .object({
    instruction: z.string().trim().min(1).max(6000),
    model: z
      .string()
      .regex(/^[\w.-]*$/)
      .max(100)
      .default(""),
    provider: z.literal("adal").default("adal"),
    workflow:z.enum(['standard','gtm']).default('standard'),
    tabs: z.array(z.string().max(100)).max(8).default([]),
    files: z.array(z.string().max(1000)).max(12).default([]),
    edit: z.boolean().default(false),
    terminal: z.boolean().default(false),
    screenshots: z.boolean().default(false),
    images: z.array(z.string().max(100)).max(3).default([]),
    maxCalls: z.number().int().min(1).max(24).default(12),
  })
  .strict();
export type AgentStart = z.infer<typeof agentStart>;
export function parseAgentDecision(text: string): AgentDecision {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  if (clean.length > 50000) throw Error("Provider decision exceeds 50 KB.");
  return agentDecision.parse(JSON.parse(clean));
}
