import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import IDCard from "@/components/IDCard";
import { X, Save, Plus, Copy as CopyIcon, Trash2, Lock } from "lucide-react";

/**
 * Full CRUD editor for ID-card templates.
 *
 * Layout: three columns.
 *   Left   — list of templates with add / duplicate / delete actions.
 *   Middle — editable fields for the selected template.
 *   Right  — live mini preview that updates on every keystroke.
 *
 * Built-in templates (student / team_class / sensei) can be edited but not
 * deleted. Custom templates have no such restriction.
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
  ["footer_label", "Member# label", "text"],
  ["accent_color", "Accent color", "color"],
  ["qr_color", "QR Code Color", "color"],
  ["title_bg_color", "Title pill background", "color"],
  ["title_text_color", "Title text color", "color"],
  ["title_offset_x", "Title nudge ↔ (mm)", "offset"],
  ["title_offset_y", "Title nudge ↕ (mm)", "offset"],
  // Size sliders — `scale` is a 0.25–3.0 multiplier (rendered as 25–300%).
  // Per-user overrides for these existed long before template defaults; now
  // admins can set sensible per-template starting values too.
  ["photo_size", "Student photo size", "scale", { max: 300 }],
  ["qr_size", "QR code size", "scale", { max: 200 }],
  ["background_size", "Card background size", "scale", { max: 200 }],
  ["background_url", "Card background image", "image"],
  ["background_opacity", "Background opacity", "opacity"],
  ["bg_offset_x", "Background nudge ↔ (mm)", "offset"],
  ["bg_offset_y", "Background nudge ↕ (mm)", "offset"],
];

// Fake user used to render the live mini preview. The IDCard component
// fetches QR codes from the API but is fault-tolerant — if the request 404s
// it falls back to a placeholder. We pass `idcard_template` separately so
// the resolver runs against the live in-progress config.
const PREVIEW_USER = {
  id: "__template_preview__",
  name: "Sample Member",
  role: "student",
  belt_rank: "Brown — 1st Kyu",
  member_number: "YD-PREVIEW",
  photo_url: "",
  idcard_template: null,
  idcard_overrides: {},
};

export default function IDCardTemplateEditor({ onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [draftConfig, setDraftConfig] = useState({});
  const [draftMeta, setDraftMeta] = useState({ label: "", description: "" });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  // Initial load
  useEffect(() => {
    let active = true;
    api.get("/idcard-templates").then((r) => {
      if (!active) return;
      setTemplates(r.data || []);
      if (r.data?.length && !selectedKey) selectFresh(r.data[0]);
    }).catch((e) => setMsg(formatApiError(e)));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => templates.find((t) => t.key === selectedKey) || null,
    [templates, selectedKey],
  );

  // Pull a template into the draft state. Called when switching tabs.
  const selectFresh = (t) => {
    setSelectedKey(t.key);
    setDraftConfig({ ...(t.config || {}) });
    setDraftMeta({ label: t.label || "", description: t.description || "" });
    setDirty(false);
    setMsg("");
  };

  const setField = (key, value) => {
    setDraftConfig((c) => ({ ...c, [key]: value }));
    setDirty(true);
  };

  const setMeta = (key, value) => {
    setDraftMeta((m) => ({ ...m, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true); setMsg("");
    try {
      const r = await api.patch(`/idcard-templates/${selected.key}`, {
        label: draftMeta.label,
        description: draftMeta.description,
        config: draftConfig,
      });
      setTemplates((ts) => ts.map((t) => (t.key === r.data.key ? r.data : t)));
      setDirty(false);
      setMsg("Saved. Defaults applied to every user on this template.");
    } catch (e) { setMsg(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const duplicate = async (t) => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post(`/idcard-templates/${t.key}/duplicate`);
      setTemplates((ts) => [...ts, r.data].sort((a, b) => a.sort_order - b.sort_order));
      selectFresh(r.data);
      setMsg(`Created "${r.data.label}" — rename and customise it.`);
    } catch (e) { setMsg(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const removeTemplate = async (t) => {
    if (t.is_builtin) return;
    if (!window.confirm(`Delete "${t.label}"? Any user assigned to this template will be reset to no template.`)) return;
    setBusy(true); setMsg("");
    try {
      await api.delete(`/idcard-templates/${t.key}`);
      const remaining = templates.filter((x) => x.key !== t.key);
      setTemplates(remaining);
      if (remaining.length) selectFresh(remaining[0]);
      else { setSelectedKey(null); setDraftConfig({}); setDraftMeta({ label: "", description: "" }); }
    } catch (e) { setMsg(formatApiError(e)); }
    finally { setBusy(false); }
  };

  // Preview merges the live draft on top of the selected template so edits
  // show up before save.
  const previewUser = useMemo(() => {
    if (!selected) return PREVIEW_USER;
    return {
      ...PREVIEW_USER,
      idcard_template: selected.key,
      // Stash the draft config into the user's overrides so the existing
      // `resolveIDCardDesign(globalCMS, user, templates)` pipeline picks it
      // up without any special-case code paths.
      idcard_overrides: draftConfig,
    };
  }, [selected, draftConfig]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50" onClick={onClose} data-testid="template-editor-overlay">
      <div className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] m-4 w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-[var(--dojo-border)] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Admin</div>
            <div className="font-serif text-2xl">ID Card Templates</div>
          </div>
          <button onClick={onClose} className="p-2 hover:text-[var(--dojo-hinomaru)]" data-testid="template-editor-close"><X size={18} /></button>
        </div>

        {/* Body — 3 columns */}
        <div className="flex-1 overflow-hidden grid grid-cols-12 min-h-0">
          {/* LEFT — list */}
          <aside className="col-span-3 border-r border-[var(--dojo-border)] overflow-y-auto p-3 space-y-1" data-testid="template-list">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-[0.18em] border border-dashed border-[var(--dojo-border)] hover:border-[var(--dojo-ink)]"
              onClick={() => setNewOpen(true)}
              data-testid="template-new-btn"
            ><Plus size={14} /> New template</button>
            {templates.map((t) => (
              <div
                key={t.key}
                className={`group rounded px-3 py-2 cursor-pointer border ${selectedKey === t.key ? "border-[var(--dojo-green)] bg-[var(--dojo-paper-deep)]" : "border-transparent hover:border-[var(--dojo-border)]"}`}
                onClick={() => { if (dirty && !window.confirm("Discard unsaved changes?")) return; selectFresh(t); }}
                data-testid={`template-row-${t.key}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate flex items-center gap-1">
                      {t.is_builtin && <Lock size={11} className="text-[var(--dojo-ink-soft)]" />}
                      {t.label}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--dojo-ink-soft)] truncate">{t.key}</div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); duplicate(t); }} className="p-1 hover:text-[var(--dojo-green)]" title="Duplicate" data-testid={`template-duplicate-${t.key}`}><CopyIcon size={13} /></button>
                    {!t.is_builtin && (
                      <button onClick={(e) => { e.stopPropagation(); removeTemplate(t); }} className="p-1 hover:text-[var(--dojo-hinomaru)]" title="Delete" data-testid={`template-delete-${t.key}`}><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </aside>

          {/* MIDDLE — fields */}
          <section className="col-span-5 border-r border-[var(--dojo-border)] overflow-y-auto p-5">
            {!selected ? (
              <div className="text-sm text-[var(--dojo-ink-soft)] text-center py-12">Select a template on the left, or create a new one.</div>
            ) : (
              <div className="space-y-5">
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Template metadata</div>
                <Field label="Display name">
                  <input className="input" value={draftMeta.label} onChange={(e) => setMeta("label", e.target.value)} data-testid="template-label-input" />
                </Field>
                <Field label="Description">
                  <input className="input" value={draftMeta.description} onChange={(e) => setMeta("description", e.target.value)} data-testid="template-description-input" />
                </Field>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] pt-2 border-t border-[var(--dojo-border)]">Default fields (apply to every user on this template)</div>
                <div className="grid grid-cols-2 gap-3">
                  {FIELDS.map(([key, label, type]) => (
                    <Field key={key} label={label} colSpan={type === "image" ? 2 : undefined}>
                      {type === "color" ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={draftConfig[key] || "#FFFFFF"}
                            onChange={(e) => setField(key, e.target.value)}
                            className="h-10 w-12 border border-[var(--dojo-border)] shrink-0"
                            data-testid={`template-field-${key}-picker`}
                          />
                          <input
                            className="input flex-1"
                            value={draftConfig[key] || ""}
                            onChange={(e) => setField(key, e.target.value)}
                            placeholder="#RRGGBB"
                            data-testid={`template-field-${key}-input`}
                          />
                        </div>
                      ) : type === "image" ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          {draftConfig[key] && (
                            <img
                              src={draftConfig[key]}
                              alt="Background preview"
                              className="h-16 w-24 object-cover border border-[var(--dojo-border)]"
                            />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              if (f.size > 1.5 * 1024 * 1024) { alert("Image must be under 1.5 MB"); return; }
                              const r = new FileReader();
                              r.onload = () => setField(key, r.result);
                              r.readAsDataURL(f);
                            }}
                            className="text-sm"
                            data-testid={`template-field-${key}-upload`}
                          />
                          {draftConfig[key] && (
                            <button
                              type="button"
                              onClick={() => setField(key, "")}
                              className="text-xs text-[var(--dojo-hinomaru)] underline"
                              data-testid={`template-field-${key}-clear`}
                            >Remove</button>
                          )}
                        </div>
                      ) : type === "offset" ? (
                        (() => {
                          const v = Number(draftConfig[key] ?? 0);
                          // Slider stays at ±50 for fine visual nudging;
                          // number input below accepts the full ±1500 range.
                          const sliderVal = Math.max(-50, Math.min(50, v));
                          return (
                            <div className="flex items-center gap-2">
                              <input
                                type="range" min="-50" max="50" step="0.5" value={sliderVal}
                                onChange={(e) => setField(key, Number(e.target.value))}
                                className="flex-1 accent-[var(--dojo-green)]"
                                data-testid={`template-field-${key}-slider`}
                              />
                              <input
                                type="number" min="-1500" max="1500" step="0.5" value={v}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  setField(key, Math.max(-1500, Math.min(1500, n)));
                                }}
                                className="input w-20 text-right font-mono-accent text-[11px]"
                                data-testid={`template-field-${key}-input`}
                              />
                            </div>
                          );
                        })()
                      ) : type === "opacity" ? (
                        (() => {
                          const pct = Math.round(Number(draftConfig[key] ?? 0.55) * 100);
                          return (
                            <div className="flex items-center gap-2">
                              <input
                                type="range" min="20" max="100" step="5" value={pct}
                                onChange={(e) => setField(key, Number(e.target.value) / 100)}
                                className="flex-1 accent-[var(--dojo-green)]"
                                data-testid={`template-field-${key}-slider`}
                              />
                              <span className="font-mono-accent text-[11px] w-12 text-right">{pct}%</span>
                            </div>
                          );
                        })()
                      ) : (
                        <input
                          className="input"
                          value={draftConfig[key] || ""}
                          onChange={(e) => setField(key, e.target.value)}
                          data-testid={`template-field-${key}-input`}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* RIGHT — live preview */}
          <section className="col-span-4 overflow-y-auto p-5 bg-[var(--dojo-paper-deep)]/40">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-3">Live preview</div>
            {selected ? (
              <div data-testid="template-live-preview" className="space-y-4">
                <IDCard user={previewUser} defaultOrientation="horizontal" previewMode />
                <p className="text-[11px] text-[var(--dojo-ink-soft)] leading-snug">
                  This is what every user assigned to this template will see — your per-user customisations still take priority over these defaults.
                </p>
              </div>
            ) : (
              <div className="text-sm text-[var(--dojo-ink-soft)] text-center py-12">Select a template to preview.</div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--dojo-border)] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="text-xs min-h-[1.25rem]" data-testid="template-editor-msg">{msg}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-outline">Close</button>
            <button onClick={save} disabled={busy || !dirty || !selected} className="btn-primary flex items-center gap-2" data-testid="template-editor-save">
              <Save size={14} /> {busy ? "Saving…" : dirty ? "Save Changes" : "Saved"}
            </button>
          </div>
        </div>
      </div>

      {newOpen && (
        <NewTemplateModal
          onCancel={() => setNewOpen(false)}
          onCreated={(t) => {
            setTemplates((ts) => [...ts, t].sort((a, b) => a.sort_order - b.sort_order));
            selectFresh(t);
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewTemplateModal({ onCancel, onCreated }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await api.post("/idcard-templates", {
        key: key.trim().toLowerCase(),
        label: label.trim() || key,
        description: "",
        config: {},
        sort_order: 100,
      });
      onCreated(r.data);
    } catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  // Auto-derive the key from the label as the user types.
  const onLabelChange = (v) => {
    setLabel(v);
    setKey(v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <form onSubmit={submit} className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} data-testid="new-template-modal">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Admin</div>
          <h3 className="font-serif text-xl">New Template</h3>
        </div>
        <Field label="Display name">
          <input className="input" value={label} onChange={(e) => onLabelChange(e.target.value)} placeholder="Black Belt Society" autoFocus data-testid="new-template-label-input" />
        </Field>
        <Field label="Key (slug)" hint="Lowercase letters, numbers, hyphens. Cannot be changed later.">
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="black-belt-society" data-testid="new-template-key-input" />
        </Field>
        {err && <div className="text-xs text-[var(--dojo-hinomaru)]">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-outline">Cancel</button>
          <button type="submit" disabled={busy || !key} className="btn-primary" data-testid="new-template-submit">{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, colSpan, children }) {
  return (
    <div className={colSpan === 2 ? "col-span-2" : ""}>
      <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-1">{hint}</div>}
    </div>
  );
}
