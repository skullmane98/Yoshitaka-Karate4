import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { mergeTemplates } from "@/lib/idcardTemplates";
import { X, Save } from "lucide-react";

/**
 * Admin/super-admin editor for the global ID-card template defaults.
 *
 * Persists to `/cms/pages/idcard-templates`. Per-user overrides
 * (`idcard_overrides`) still stack on top of these defaults so editing a
 * template doesn't clobber individual customisations.
 */
const FIELDS = [
  ["dojo_name", "Dojo Name", "text"],
  ["certificate_title", "Member Title", "text"],
  ["kanji_top", "Kanji (top)", "text"],
  ["kanji_bottom", "Kanji (bottom)", "text"],
  ["issued_text", "Issued footer", "text"],
  ["scan_text", "Scan caption", "text"],
  ["name_label", "Name label", "text"],
  ["role_label", "Role label", "text"],
  ["rank_label", "Rank label", "text"],
  ["footer_label", "Member# label", "text"],
  ["accent_color", "Accent color", "color"],
  ["title_bg_color", "Title pill background", "color"],
  ["title_text_color", "Title text color", "color"],
];

export default function IDCardTemplateEditor({ onClose }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState("student");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.get("/cms/pages/idcard-templates")
      .then((r) => { if (active) setData(mergeTemplates(r.data?.content || {})); })
      .catch(() => { if (active) setData(mergeTemplates(null)); });
    return () => { active = false; };
  }, []);

  if (!data) return null;
  const cur = data[editing] || { label: editing, description: "", config: {} };

  const setField = (key, value) => {
    setData((d) => ({
      ...d,
      [editing]: {
        ...d[editing],
        config: { ...(d[editing]?.config || {}), [key]: value },
      },
    }));
  };

  const setMeta = (key, value) => {
    setData((d) => ({ ...d, [editing]: { ...d[editing], [key]: value } }));
  };

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api.put("/cms/pages/idcard-templates", {
        title: "ID Card Templates",
        content: data,
      });
      setMsg("Saved. New defaults apply to every user assigned this template.");
    } catch (e) {
      setMsg(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose} data-testid="template-editor-overlay">
      <div className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[var(--dojo-paper)] border-b border-[var(--dojo-border)] px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Admin</div>
            <div className="font-serif text-2xl">Edit ID Card Templates</div>
          </div>
          <button onClick={onClose} className="p-2 hover:text-[var(--dojo-hinomaru)]" data-testid="template-editor-close"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-2" data-testid="template-tabs">
            {Object.keys(data).map((k) => (
              <button
                key={k}
                onClick={() => setEditing(k)}
                className={`px-3 py-2 text-xs uppercase tracking-[0.18em] border-b-2 ${editing === k ? "border-[var(--dojo-green)] text-[var(--dojo-ink)]" : "border-transparent text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]"}`}
                data-testid={`template-tab-${k}`}
              >{data[k].label || k}</button>
            ))}
          </div>

          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Template metadata</div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Display name">
              <input className="input" value={cur.label || ""} onChange={(e) => setMeta("label", e.target.value)} data-testid="template-label-input" />
            </Field>
            <Field label="Description">
              <input className="input" value={cur.description || ""} onChange={(e) => setMeta("description", e.target.value)} data-testid="template-description-input" />
            </Field>
          </div>

          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] pt-2">Default fields (apply to every user on this template)</div>
          <div className="grid md:grid-cols-2 gap-3">
            {FIELDS.map(([key, label, type]) => (
              <Field key={key} label={label}>
                {type === "color" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={cur.config?.[key] || "#FFFFFF"}
                      onChange={(e) => setField(key, e.target.value)}
                      className="h-10 w-14 border border-[var(--dojo-border)]"
                      data-testid={`template-field-${key}-picker`}
                    />
                    <input
                      className="input flex-1"
                      value={cur.config?.[key] || ""}
                      onChange={(e) => setField(key, e.target.value)}
                      placeholder="#RRGGBB"
                      data-testid={`template-field-${key}-input`}
                    />
                  </div>
                ) : (
                  <input
                    className="input"
                    value={cur.config?.[key] || ""}
                    onChange={(e) => setField(key, e.target.value)}
                    data-testid={`template-field-${key}-input`}
                  />
                )}
              </Field>
            ))}
          </div>

          {msg && <div className="text-sm pt-3 border-t border-[var(--dojo-border)]" data-testid="template-editor-msg">{msg}</div>}
        </div>
        <div className="sticky bottom-0 bg-[var(--dojo-paper)] border-t border-[var(--dojo-border)] px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="btn-outline">Close</button>
          <button onClick={save} disabled={busy} className="btn-primary flex items-center gap-2" data-testid="template-editor-save">
            <Save size={14} /> {busy ? "Saving…" : "Save Template Defaults"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
