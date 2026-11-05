import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
export function Editor({
  source,
  onChange,
  selection,
}: {
  source: string;
  onChange: (source: string) => void;
  selection: { start: number; end: number; id: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({ "aria-label": "AIDL source" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "14px" },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "Consolas, monospace",
              lineHeight: "1.8",
            },
            ".cm-content": { padding: "20px 0" },
            ".cm-gutters": {
              background: "#f5f6f8",
              color: "#a0a7b4",
              border: "none",
            },
            ".cm-activeLine": { background: "#eff3fa" },
            ".cm-line": { paddingLeft: "14px" },
            "&.cm-focused": { outline: "none" },
          }),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, []);
  useEffect(() => {
    const editor = view.current!;
    if (editor.state.doc.toString() !== source)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: source },
      });
  }, [source]);
  useEffect(() => {
    if (selection) {
      view.current!.dispatch({
        selection: { anchor: selection.start, head: selection.end },
        scrollIntoView: true,
      });
      view.current!.focus();
    }
  }, [selection]);
  return <div className="editor" ref={host} />;
}
