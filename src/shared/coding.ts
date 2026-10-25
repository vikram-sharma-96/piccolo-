import { z } from "zod";
const relative = z.string().max(2000);
export const codingRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("manage") }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reload") }),
  z.object({ action: z.literal("trust") }),
  z.object({ action: z.literal("state") }),
  z.object({ action: z.literal("stat"), path: relative }),
  z.object({ action: z.literal("list"), path: relative }),
  z.object({ action: z.literal("read"), path: relative }),
  z.object({
    action: z.literal("write"),
    path: relative,
    data: z.string().max(12_000_000),
    revision: z.string().max(64).nullable(),
  }),
  z.object({ action: z.literal("mkdir"), path: relative }),
  z.object({ action: z.literal("rename"), path: relative, to: relative }),
  z.object({ action: z.literal("delete"), path: relative }),
  z.object({ action: z.literal("search"), query: z.string().min(1).max(200) }),
  z.object({
    action: z.literal("git"),
    operation: z.enum([
      "status",
      "diff",
      "stage",
      "unstage",
      "commit",
      "original",
    ]),
    path: relative.optional(),
    message: z.string().min(1).max(500).optional(),
  }),
  z.object({ action: z.literal("terminal-start") }),
  z.object({
    action: z.literal("terminal-input"),
    data: z.string().max(10000),
  }),
  z.object({
    action: z.literal("terminal-resize"),
    cols: z.number().int().min(10).max(400),
    rows: z.number().int().min(3).max(150),
  }),
  z.object({ action: z.literal("terminal-stop") }),
  z.object({ action: z.literal("preview"), url: z.url().max(2000) }),
  z.object({
    action: z.literal("extension-search"),
    query: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal("extension-install"),
    id: z.string().regex(/^[\w-]+\.[\w-]+$/),
    version: z.string().regex(/^[\w.+-]+$/),
  }),
  z.object({ action: z.literal("extension-vsix") }),
  z.object({
    action: z.literal("extension-change"),
    id: z.string().regex(/^[\w-]+\.[\w-]+$/),
    operation: z.enum(["enable", "disable", "remove", "update"]),
  }),
  z.object({ action: z.literal("extension-list") }),
]);
export type CodingRequest = z.infer<typeof codingRequest>;
export type CodingState = {
  name: string;
  id: string;
  trusted: boolean;
  appearance: "dark" | "light";
  extensions: any[];
  terminalRunning: boolean;
  recent: string[];
};
export type CodingBridge = {
  request: (request: CodingRequest) => Promise<any>;
  subscribe: (callback: (event: any) => void) => () => void;
};
