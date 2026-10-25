import { z } from "zod";
import { defaultEngines, validSearchTemplate } from "./search";
const engineSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().min(1).max(60),
  keyword: z.string().regex(/^[a-z0-9_-]{1,20}$/),
  template: z
    .string()
    .max(2048)
    .refine(validSearchTemplate, "Invalid search template"),
});
export const internalPages = [
  "newtab",
  "history",
  "bookmarks",
  "downloads",
  "settings",
  "performance",
  "workspaces",
  "extensions",
  "connections",
  "passwords",
  "integrations",
  "privacy",
  "about",
] as const;
export type InternalPage = (typeof internalPages)[number];
const text = z.string().max(10000);
export const widgetSchema = z.object({
  id: z.string().max(80),
  kind: z.enum(["clock", "links", "notes", "todos"]),
  width: z.enum(["small", "wide"]),
  title: z.string().max(80),
});
export const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#bea0ff"),
  density: z.enum(["compact", "comfortable"]).default("comfortable"),
  bookmarksBar: z.boolean().default(false),
  searchEngine: z.string().max(40).default("duckduckgo"),
  searchEngines: z
    .array(engineSchema)
    .min(1)
    .max(20)
    .refine(
      (es) =>
        new Set(es.map((e) => e.id)).size === es.length &&
        new Set(es.map((e) => e.keyword)).size === es.length,
      "Engine ids and keywords must be unique",
    )
    .default(defaultEngines),
  sidebarMode: z.enum(["off", "auto", "on"]).default("off"),
  dailyWallpaper: z.boolean().default(false),
  startup: z.enum(["restore", "blank"]).default("restore"),
  motion: z.boolean().default(true),
  transparency: z.boolean().default(true),
  lowPower: z.boolean().default(true),
  mcpEnabled: z.boolean().default(false),
  mcpTrusted: z.boolean().default(false),
  sleepMinutes: z.number().int().min(0).max(1440).default(30),
  sleepExcluded: z.array(z.string().max(253)).max(100).default([]),
  askDownload: z.boolean().default(true),
  downloadDirectory: z.string().max(4096).default(""),
  greeting: z.string().max(100).default("Make room for a little discovery."),
  sidebarWidth: z.number().int().min(52).max(100).default(64),
  wallpaper: z
    .object({
      kind: z.enum(["gradient", "solid", "image", "video"]).default("gradient"),
      color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .default("#141b25"),
      asset: z.string().max(100).default(""),
      fit: z.enum(["cover", "contain"]).default("cover"),
      position: z.enum(["center", "top", "bottom"]).default("center"),
      dim: z.number().min(0).max(0.9).default(0.3),
      blur: z.number().min(0).max(30).default(0),
      contrast: z.number().min(0.5).max(2).default(1),
    })
    .default({
      kind: "gradient",
      color: "#141b25",
      asset: "",
      fit: "cover",
      position: "center",
      dim: 0.3,
      blur: 0,
      contrast: 1,
    }),
  widgets: z
    .array(widgetSchema)
    .max(20)
    .default([
      { id: "clock", kind: "clock", width: "small", title: "Your time" },
      { id: "links", kind: "links", width: "wide", title: "Quick links" },
      {
        id: "notes",
        kind: "notes",
        width: "wide",
        title: "A little space to think",
      },
      { id: "todos", kind: "todos", width: "small", title: "Today" },
    ]),
  notes: z.string().max(100000).default(""),
  todos: z
    .array(
      z.object({
        id: z.string().max(80),
        text: z.string().max(500),
        done: z.boolean(),
      }),
    )
    .max(200)
    .default([]),
  quickLinks: z
    .array(z.object({ title: z.string().max(80), url: z.string().max(2048) }))
    .max(30)
    .default([
      { title: "Wikipedia", url: "https://wikipedia.org" },
      { title: "GitHub", url: "https://github.com" },
      { title: "MDN", url: "https://developer.mozilla.org" },
    ]),
});
export type Settings = z.infer<typeof settingsSchema>;
export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  error: string;
  zoom: number;
  lastActive: number;
}
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  folder: string;
  position: number;
}
export interface Visit {
  id: number;
  url: string;
  title: string;
  time: number;
}
export interface Download {
  id: string;
  name: string;
  url: string;
  path: string;
  received: number;
  total: number;
  status: string;
  private: boolean;
  speed?: number;
  eta?: number | null;
  initiator?: string;
  pageURL?: string;
  mime?: string;
  risk?: string;
  userGesture?: boolean;
  created?: number;
  blockedCount?: number;
  error?: string;
}
export interface Permission {
  origin: string;
  permission: string;
  decision: "allow" | "deny";
}
export const bookmarkSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(200),
  url: z.string().url().max(2048),
  folder: z.string().max(100),
  position: z.number().int().nonnegative(),
});
export const permissionSchema = z.object({
  origin: z.string().url().max(2048),
  permission: z.string().max(100),
  decision: z.enum(["allow", "deny"]),
});
export const downloadSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(1024),
  url: z.string().max(10000),
  path: z.string().max(4096),
  received: z.number().nonnegative(),
  total: z.number().nonnegative(),
  status: z.string().max(50),
  private: z.boolean(),
  speed: z.number().nonnegative().default(0),
  eta: z.number().nullable().default(null),
  initiator: z.string().max(10000).optional(),
  pageURL: z.string().max(10000).optional(),
  mime: z.string().max(200).optional(),
  risk: z.string().max(300).optional(),
  userGesture: z.boolean().optional(),
  created: z.number().optional(),
  blockedCount: z.number().int().nonnegative().optional(),
  error: z.string().max(1000).optional(),
});
export const sessionSchema = z
  .array(
    z.object({ url: z.string().max(10000), pinned: z.boolean().optional() }),
  )
  .max(1200);
export interface State {
  agentRevision?: number;
  agentTask?: {id:string;status:string;step:number};
  workspaceRevision?: number;
  appearance: "light" | "dark";
  tabs: Tab[];
  activeId: string;
  private: boolean;
  settings: Settings;
  bookmarks: Bookmark[];
  downloads: Download[];
  permissions: Permission[];
  visible: boolean;
  version: string;
  recovered: boolean;
  sidebarOpen: boolean;
  dailyCredit?: { text: string; url: string; status: string };
}
const id = z.string().min(1).max(100);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal('agent'),action:z.enum(['status','connect','disconnect','start','pause','resume','cancel','takeover','attach-image','artifact','delete','hide','show','export-summary']),value:z.unknown().optional()}),
  z.object({type:z.literal('workspace'),action:z.enum(['status','pick','reopen','close','trust','reload','manage','show','grant-client','revoke-client','takeover']),value:z.string().max(64).optional()}),
  z.object({ type: z.literal("navigate"), input: text }),
  z.object({
    type: z.literal("new-tab"),
    url: text.optional(),
    background: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("tab"),
    action: z.enum(["activate", "close", "duplicate", "pin", "discard"]),
    id,
  }),
  z.object({ type: z.literal("reorder"), id, before: id }),
  z.object({
    type: z.literal("action"),
    action: z.enum([
      "back",
      "forward",
      "reload",
      "stop",
      "home",
      "reopen",
      "private",
      "window",
      "fullscreen",
      "devtools",
      "copy-url",
      "zoom-in",
      "zoom-out",
      "zoom-reset",
      "print",
      "save-page",
      "quit",
      "chrome-devtools",
    ]),
  }),
  z.object({ type: z.literal("sidebar"), open: z.boolean() }),
  z.object({
    type: z.literal("optional"),
    service: z.enum(["extensions", "proxy", "daily", "mcp"]),
    action: z.string().max(40),
    value: z.unknown().optional(),
  }),
  z.object({ type: z.literal("overlay"), open: z.boolean() }),
  z.object({
    type: z.literal("find"),
    text: z.string().max(1000),
    forward: z.boolean().default(true),
    next: z.boolean().default(false),
    close: z.boolean().optional(),
  }),
  z.object({ type: z.literal("settings"), value: settingsSchema }),
  z.object({
    type: z.literal("settings-file"),
    action: z.enum(["import", "export", "reset"]),
  }),
  z.object({ type: z.literal("wallpaper"), kind: z.enum(["image", "video"]) }),
  z.object({
    type: z.literal("bookmark"),
    action: z.enum(["save", "delete"]),
    value: z.object({
      id: z.string().max(100).optional(),
      title: z.string().max(200),
      url: z.string().max(2048),
      folder: z.string().max(100),
      position: z.number().int().min(0).max(100000).optional(),
    }),
  }),
  z.object({
    type: z.literal("bookmarks-file"),
    action: z.enum(["import", "export"]),
  }),
  z.object({
    type: z.literal("history"),
    query: z.string().max(500).default(""),
  }),
  z.object({
    type: z.literal("history-delete"),
    id: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("clear"),
    target: z.enum(["history", "site-data", "cache"]),
    since: z.number().min(0).default(0),
  }),
  z.object({
    type: z.literal("download"),
    id,
    action: z.enum([
      "pause",
      "resume",
      "cancel",
      "open",
      "reveal",
      "retry",
      "approve",
      "remove",
    ]),
  }),
  z.object({ type: z.literal("downloads-clear") }),
  z.object({
    type: z.literal("download-multiple"),
    origin: z.string().max(2048),
  }),
  z.object({ type: z.literal("download-directory") }),
  z.object({
    type: z.literal("permission-delete"),
    origin: z.string().max(2048),
    permission: z.string().max(100),
  }),
  z.object({ type: z.literal("metrics") }),
]);
export type Command = z.infer<typeof commandSchema>;
export interface Bridge {
  command: (command: Command) => Promise<unknown>;
  state: () => Promise<State>;
  subscribe: (callback: (state: State) => void) => () => void;
  onFocus: (callback: () => void) => () => void;
  onFindFocus: (callback: () => void) => () => void;
  onFind: (
    callback: (result: { activeMatchOrdinal: number; matches: number }) => void,
  ) => () => void;
}
declare global {
  interface Window {
    piccolo: Bridge;
  }
}
