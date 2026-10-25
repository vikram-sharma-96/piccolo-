import { useState } from "react";
import type { Settings } from "../shared/model";
import { validSearchTemplate } from "../shared/search";
export function SearchSettings({
  settings: s,
  save,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>) => void;
}) {
  const [edit, setEdit] = useState<{
    id: string;
    name: string;
    keyword: string;
    template: string;
  }>();
  const [error, setError] = useState("");
  return (
    <>
      <label className="setting">
        <span>Default search engine</span>
        <select
          aria-label="Default search engine"
          value={s.searchEngine}
          onChange={(e) => save({ searchEngine: e.target.value })}
        >
          {s.searchEngines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      {s.searchEngines.map((engine) => (
        <div className="list-row" key={engine.id}>
          <div className="entry">
            {engine.name}
            <small>
              {engine.keyword} · {engine.template}
            </small>
          </div>
          <button onClick={() => setEdit({ ...engine })}>Edit</button>
          <button
            disabled={s.searchEngines.length <= 1}
            onClick={() => {
              const engines = s.searchEngines.filter((e) => e.id !== engine.id);
              save({
                searchEngines: engines,
                searchEngine:
                  s.searchEngine === engine.id ? engines[0].id : s.searchEngine,
              });
            }}
          >
            Delete
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          setEdit({
            id: crypto.randomUUID().slice(0, 8),
            name: "",
            keyword: "",
            template: "https://example.com/search?q={searchTerms}",
          })
        }
      >
        Add search engine
      </button>
      {edit && (
        <form
          className="optional-form"
          onSubmit={(e) => {
            e.preventDefault();
            const searchEngines = [
              ...s.searchEngines.filter((x) => x.id !== edit.id),
              edit,
            ];
            if (!validSearchTemplate(edit.template)) {
              setError(
                "Use an HTTP(S) template with exactly one {searchTerms} placeholder.",
              );
              return;
            }
            if (
              searchEngines.filter((e) => e.keyword === edit.keyword).length > 1
            ) {
              setError("Choose a unique search keyword.");
              return;
            }
            save({ searchEngines });
            setError("");
            setEdit(undefined);
          }}
        >
          {(["name", "keyword", "template"] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                aria-label={`Engine ${key}`}
                required
                autoComplete="off"
                spellCheck={false}
                maxLength={key === "name" ? 60 : key === "keyword" ? 20 : 2048}
                pattern={key === "keyword" ? "[a-z0-9_\\-]{1,20}" : undefined}
                value={edit[key]}
                onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="warning-text">
              {error}
            </p>
          )}
          <button className="primary">Save engine</button>
          <button type="button" onClick={() => setEdit(undefined)}>
            Cancel
          </button>
        </form>
      )}
      <p className="muted">
        Template requires exactly one {"{searchTerms}"} placeholder and an
        HTTP(S) URL. Type a keyword followed by a space and query in the address
        bar. Queries are URL encoded.
      </p>
    </>
  );
}
