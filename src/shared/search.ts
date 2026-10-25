export interface SearchEngine {
  id: string;
  name: string;
  keyword: string;
  template: string;
}
export function validSearchTemplate(value: string) {
  try {
    const u = new URL(value.replace("{searchTerms}", "piccoloquerymarker"));
    return (
      ["http:", "https:"].includes(u.protocol) &&
      !u.origin.includes("piccoloquerymarker") &&
      !u.username &&
      !u.password &&
      value.split("{searchTerms}").length === 2
    );
  } catch {
    return false;
  }
}
function checkedTemplate(value: string) {
  if (!validSearchTemplate(value))
    throw Error(
      "Use an HTTP(S) URL containing exactly one {searchTerms} placeholder.",
    );
  return value;
}
export const defaultEngines = [
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    keyword: "d",
    template: "https://duckduckgo.com/?q={searchTerms}",
  },
  {
    id: "google",
    name: "Google",
    keyword: "g",
    template: "https://www.google.com/search?q={searchTerms}",
  },
  {
    id: "bing",
    name: "Bing",
    keyword: "b",
    template: "https://www.bing.com/search?q={searchTerms}",
  },
];
export function searchURL(
  query: string,
  engines: SearchEngine[],
  defaultId: string,
) {
  let engine = engines.find((e) => e.id === defaultId) || engines[0];
  const match = /^(\S+)\s+([\s\S]+)$/.exec(query);
  if (match) {
    const keyword = engines.find((e) => e.keyword === match[1]);
    if (keyword) {
      engine = keyword;
      query = match[2];
    }
  }
  if (!engine) throw Error("Configure a search engine first.");
  return checkedTemplate(engine.template).replace(
    "{searchTerms}",
    encodeURIComponent(query),
  );
}
