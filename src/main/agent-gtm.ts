import { randomUUID, createHash } from "node:crypto";
import type { AgentArtifact } from "../shared/agent";
import { TaskSheets } from "./agent-sheet";
// Reuses the task-owned writer and receives the existing native approval function.
// This function has no publishing, email or browser-control adapter.
export async function writeGtmDocuments(
  taskId: string,
  documents: {
    role: NonNullable<AgentArtifact["role"]>;
    text: string;
    claims?: AgentArtifact["claims"];
    evidence?: AgentArtifact["evidence"];
  }[],
  store: TaskSheets,
  approve: (detail: string) => Promise<void>,
  signal: AbortSignal,
) {
  await approve(
    documents
      .map((document) => document.role + ".md\n" + document.text)
      .join("\n\n"),
  );
  signal.throwIfAborted();
  const artifacts: AgentArtifact[] = [];
  for (const document of documents) {
    const id = randomUUID(),
      fileName = id + ".md";
    await store.write(taskId, fileName, document.text, signal);
    artifacts.push({
      id,
      taskId,
      fileName,
      role: document.role,
      title: document.role + ".md",
      mime: "text/markdown",
      data: document.text,
      created: Date.now(),
      sha256: createHash("sha256").update(document.text).digest("hex"),
      sources: [],
      verified: false,
      ...(document.claims ? { claims: document.claims } : {}),
      ...(document.evidence ? { evidence: document.evidence } : {}),
    });
  }
  return artifacts;
}
