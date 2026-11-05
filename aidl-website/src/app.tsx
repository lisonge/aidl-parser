import { useEffect, useMemo, useRef, useState } from "react";
import upstream from "../../aidl-cpp/upstream/metadata.json";
import type { AidlParseResult, SourceRange } from "aidl-parser";
import type { Request, Response } from "./protocol.ts";
import { LatestRequest } from "./latest-request.ts";
import { Editor } from "./editor.tsx";
import { samples } from "./samples.ts";

function Tree({
  value,
  label = "document",
  onSelect,
  depth = 0,
}: {
  value: unknown;
  label?: string;
  onSelect: (location: SourceRange) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 3);
  if (value === null || typeof value !== "object")
    return (
      <div className="tree-value">
        <span>{label}</span>
        <code>{JSON.stringify(value)}</code>
      </div>
    );
  const node = value as Record<string, unknown>;
  const entries = Object.entries(node).filter(
    ([key]) =>
      key !== "range" &&
      key !== "comments" &&
      !(Array.isArray(node[key]) && node[key].length === 0),
  );
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="tree-node"
    >
      <summary>
        <span className="tree-label">
          {Array.isArray(value)
            ? `${label} [${value.length}]`
            : String(node.kind ?? label)}
        </span>
        {typeof node.name === "string" && <strong>{node.name}</strong>}
        {!!node.range && (
          <button
            title="Jump to source"
            onClick={(event) => {
              event.preventDefault();
              onSelect(node.range as SourceRange);
            }}
          >
            ↗
          </button>
        )}
      </summary>
      {open && (
        <div className="tree-children">
          {entries.map(([key, child]) => (
            <Tree
              key={key}
              value={child}
              label={key}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </details>
  );
}
function JsonView({ result }: { result: AidlParseResult }) {
  const text = useMemo(() => JSON.stringify(result, null, 2), [result]);
  return <pre>{text}</pre>;
}
export default function App() {
  const [source, setSource] = useState(
    () => localStorage.getItem("aidl-source") ?? samples["Service interface"]!,
  );
  const [result, setResult] = useState<AidlParseResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [tab, setTab] = useState<"tree" | "json">("tree");
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    id: number;
  } | null>(null);
  const version = useRef(0);
  const requests = useRef<LatestRequest<Request> | null>(null);
  useEffect(() => {
    const instance = new Worker(
      new URL("./parser.worker.ts", import.meta.url),
      { type: "module" },
    );
    const queue = new LatestRequest<Request>((request) =>
      instance.postMessage(request),
    );
    requests.current = queue;
    instance.onmessage = ({ data }: MessageEvent<Response>) => {
      queue.complete();
      if (data.version !== version.current) return;
      setBusy(false);
      if ("error" in data) {
        setError(data.error);
        setResult(null);
      } else {
        setResult(data.result);
        setElapsed(data.elapsed);
        setError("");
      }
    };
    instance.onerror = (event) => {
      queue.complete();
      setBusy(false);
      setError(event.message);
    };
    return () => {
      requests.current = null;
      instance.terminate();
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("aidl-source", source);
    const next = ++version.current;
    setBusy(true);
    requests.current?.discardPending();
    const timer = setTimeout(
      () => requests.current?.submit({ version: next, source }),
      160,
    );
    return () => clearTimeout(timer);
  }, [source]);
  const jump = (location: SourceRange) =>
    setSelection({
      start: location.start.offset,
      end: location.end.offset,
      id: Date.now(),
    });
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "aidl-structure.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main>
      <header>
        <a className="brand" href="./">
          <span className="brand-icon">
            a<span>:</span>
          </span>
          <b>AIDL</b>
          <span className="brand-divider" />
          Structure Lab
        </a>
        <span className="version">
          Android 17 <span>·</span> WASM
        </span>
        <a
          className="source-link"
          href={`https://github.com/msft-mirror-aosp/platform.system.tools.aidl/tree/${upstream.tag}`}
          target="_blank"
          rel="noreferrer"
        >
          AOSP source ↗
        </a>
      </header>
      <section className="intro">
        <div className="eyebrow">
          <span /> OFFICIAL GRAMMAR, STRUCTURED DATA
        </div>
        <h1>
          Explore AIDL structure<span>.</span>
        </h1>
        <p>
          Explore interface definitions with instant structure and syntax
          feedback. Parsing runs locally in your browser.
        </p>
      </section>
      <section className="workspace">
        <div className="pane source-pane">
          <div className="pane-header">
            <div>
              <span className="number">01</span>
              <b>Source</b>
              <span className="file-type">.aidl</span>
            </div>
            <select
              aria-label="Choose an example"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) setSource(samples[event.target.value]!);
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Load example
              </option>
              {Object.keys(samples).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </div>
          <Editor source={source} onChange={setSource} selection={selection} />
          <div className="pane-footer">
            <span>UTF-8 → UTF-16</span>
            <span>
              {source.split("\n").length} lines · {source.length} characters
            </span>
          </div>
        </div>
        <div className="pane result-pane">
          <div className="pane-header">
            <div>
              <span className="number">02</span>
              <b>Structure</b>
            </div>
            <div className="tabs">
              <button
                className={tab === "tree" ? "active" : ""}
                onClick={() => setTab("tree")}
              >
                Tree
              </button>
              <button
                className={tab === "json" ? "active" : ""}
                onClick={() => setTab("json")}
              >
                JSON
              </button>
            </div>
          </div>
          <div className="output" aria-label="Parse result">
            {error ? (
              <div className="error">{error}</div>
            ) : result?.document ? (
              tab === "json" ? (
                <JsonView result={result} />
              ) : (
                <Tree value={result.document} onSelect={jump} />
              )
            ) : (
              <div className="empty">
                <span>{busy ? "◌" : "⌁"}</span>
                <b>{busy ? "Parsing…" : "Waiting for valid AIDL"}</b>
                <p>
                  {busy
                    ? "Loading the official parser"
                    : "Fix the source using the diagnostics below."}
                </p>
              </div>
            )}
          </div>
          <div className="pane-footer">
            <span>
              {result?.document
                ? `${result.document.declarations.length} top-level declaration${result.document.declarations.length === 1 ? "" : "s"}`
                : "No structure available"}
            </span>
            <button onClick={download} disabled={!result}>
              Download JSON ↓
            </button>
          </div>
        </div>
      </section>
      <section className="diagnostics">
        <div className="diagnostic-title">
          <b>Diagnostics</b>
          <span
            className={
              error || result?.diagnostics.length ? "status bad" : "status"
            }
          >
            {busy
              ? "Parsing"
              : error
                ? "Runtime error"
                : result?.diagnostics.length
                  ? `${result.diagnostics.length} diagnostic${result.diagnostics.length === 1 ? "" : "s"}`
                  : "Parse successful"}
          </span>
          <span className="timing">{elapsed.toFixed(2)} ms</span>
        </div>
        {result?.diagnostics.map((item, index) => (
          <button
            key={index}
            className="diagnostic"
            onClick={() => item.range && jump(item.range)}
          >
            <span>Error</span>
            <code>
              {item.range
                ? `${item.range.start.line}:${item.range.start.column}`
                : "—"}
            </code>
            {item.message}
          </button>
        ))}
        {!busy && !error && result?.diagnostics.length === 0 && (
          <p className="all-clear">
            No syntax diagnostics. Type checking and import resolution are not
            performed.
          </p>
        )}
      </section>
      <footer>
        <span>Powered by the official AOSP Flex / Bison parser</span>
        <code>
          {upstream.tag} · {upstream.commit.slice(0, 8)}
        </code>
      </footer>
    </main>
  );
}
