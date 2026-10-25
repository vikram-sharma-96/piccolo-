import { searchURL, defaultEngines } from "./search";
import type { Settings } from "./model";
export function internal(url: string) {
  return /^piccolo:\/\/(newtab|history|bookmarks|downloads|settings|performance|workspaces|extensions|connections|passwords|integrations|privacy|about)\/?$/.test(
    url,
  );
}
export function webURL(input: string): boolean {
  try {
    const u = new URL(input);
    return (
      ["https:", "http:"].includes(u.protocol) &&
      !!u.hostname &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
export function destination(
  input: string,
  engine: Settings["searchEngine"] = "duckduckgo",
  engines?: Settings["searchEngines"],
): string {
  const value = input.trim();
  if (engines && engines.some((e) => value.startsWith(e.keyword + " ")))
    return searchURL(value, engines, engine);
  if (!value) return "piccolo://newtab";
  if (internal(value)) return value.replace(/\/$/, "");
  if (/^https?:\/\//i.test(value)) {
    if (!webURL(value)) throw Error("Invalid web address.");
    return new URL(value).href;
  }
  const host = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(:\d+)?(\/|$)/i.test(
    value,
  );
  if (host) return new URL(`http://${value}`).href;
  if (/^[a-z][a-z\d+.-]*:/i.test(value))
    throw Error("Only HTTP, HTTPS, and Piccolo pages are supported.");
  if (
    !/\s/.test(value) &&
    /^[\w\p{L}-]+(?:\.[\w\p{L}-]+)+(?:[:/].*)?$/u.test(value)
  ) {
    const url = `https://${value}`;
    if (webURL(url)) return new URL(url).href;
  }
  return searchURL(value, engines || defaultEngines, engine);
}
