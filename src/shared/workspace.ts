// Contracts only: no agent receives capabilities without explicit grants.
export interface Workspace {
  id: string;
  name: string;
  kind: "browser" | "coding" | "office";
  tools: Tool[];
}
export interface Tool {
  id: string;
  name: string;
  requiredPermissions: string[];
}
export interface Agent {
  id: string;
  provider: string;
  model: string;
  grants: PermissionRequest[];
}
export interface Task {
  id: string;
  instruction: string;
  status:
    "pending" | "running" | "paused" | "cancelled" | "verified" | "failed";
  agentId: string;
}
export interface Artifact {
  id: string;
  taskId: string;
  mime: string;
  path: string;
  sha256: string;
}
export interface PermissionRequest {
  id: string;
  scope: "tab" | "file" | "tool" | "external-action";
  resource: string;
  approved: boolean;
}
export interface ExecutionEvent {
  taskId: string;
  time: number;
  kind: "start" | "tool" | "approval" | "artifact" | "verification" | "error";
  detail: string;
}
export interface VerificationResult {
  artifactId: string;
  passed: boolean;
  evidence: string[];
}
