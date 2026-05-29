import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import IDCard, { FONT_SIZE_PRESETS } from "@/components/IDCard";
import { BELT_NAMES } from "@/lib/belts";
import { IDCARD_TEMPLATES, mergeTemplates } from "@/lib/idcardTemplates";
import { X, Save, KeyRound, RefreshCcw } from "lucide-react";

/**
 * Slide-out editor for a single user. 4 tabs:
 *   Profile · Information · ID Card · Security
 *
 * Admins can edit role-permitted fields; super_admins can edit everything.
 */
const TABS = [
  { id: "profile", label: "Profile" },
  { id: "info", label: "Information" },
  { id: "idcard", label: "ID Card" },
  { id: "security", label: "Security" },
];

export default function UserDrawer({ user, currentUser, onClose, onSaved }) {
  const isSuper = currentUser?.role === "super_admin";
  const isAdminLike = ["admin", "super_admin"].includes(currentUser?.role);
  const [tab, setTab] = useState("profile");
  const [draft, setDraft] = useState(user);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pw, setPw] = useState("");
  const [qrPng, setQrPng] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [liveTemplates, setLiveTemplates] = useState(() => mergeTemplates(null));

  useEffect(() => { setDraft(user); }, [user]);

  useEffect(() => {
    let active = true;
    api.get("/idcard-templates")
      .then((r) => {
        if (!active) return;
        // Convert list → keyed object so the existing merge helper still works.
        const keyed = {};
        for (const t of r.data || []) {
          keyed[t.key] = { label: t.label, description: t.description, config: t.config || {} };
        }
        setLiveTemplates(mergeTemplates(keyed));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const qrColor = (draft?.idcard_overrides || {}).qr_color || "#D7263D";
    api.get(`/users/${user.id}/qrcode`, { params: { color: qrColor } })
      .then((r) => { if (active) setQrPng(r.data?.qr_png || ""); })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.qr_code, draft?.idcard_overrides?.qr_color]);

  if (!user) return null;

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setOverride = (k, v) => setDraft((d) => ({
    ...d,
    idcard_overrides: { ...(d.idcard_overrides || {}), [k]: v },
  }));

  const onPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1.2 * 1024 * 1024) { alert("Photo must be under 1.2 MB"); return; }
    const r = new FileReader();
    r.onload = () => set("photo_url", r.result);
    r.readAsDataURL(f);
  };

  const onBackground = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { alert("Background image must be under 1.5 MB"); return; }
    const r = new FileReader();
    r.onload = () => setOverride("background_url", r.result);
    r.readAsDataURL(f);
  };

  const regenerateQR = async () => {
    if (!window.confirm("Generate a new QR code for this user? Their existing printed/screen card will stop working.")) return;
    setQrBusy(true);
    setMsg("");
    try {
      const { data } = await api.post(`/users/${user.id}/qr/regenerate`);
      setDraft((d) => ({ ...d, qr_code: data.qr_code }));
      onSaved?.(data);
      setMsg("QR code regenerated.");
    } catch (e) {
      setMsg(formatApiError(e));
    } finally {
      setQrBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { id, member_number, created_at, ...payload } = draft;
      // Only send fields that changed (keep request small)
      const diff = {};
      for (const k of Object.keys(payload)) {
        if (JSON.stringify(payload[k]) !== JSON.stringify(user[k])) diff[k] = payload[k];
      }
      if (Object.keys(diff).length === 0) {
        setMsg("Nothing to save.");
      } else {
        const { data } = await api.patch(`/users/${user.id}`, diff);
        onSaved?.(data);
        setDraft(data);
        setMsg("Saved.");
      }
    } catch (e) {
      setMsg(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (pw.length < 6) { setMsg("Password must be at least 6 chars."); return; }
    setBusy(true);
    setMsg("");
    try {
      await api.post(`/users/${user.id}/password`, { new_password: pw });
      setPw("");
      setMsg("Password updated.");
    } catch (e) {
      setMsg(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="user-drawer">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full bg-[var(--dojo-paper)] border-l border-[var(--dojo-border)] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[var(--dojo-paper)] border-b border-[var(--dojo-border)] flex items-center justify-between px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{user.member_number}</div>
            <div className="font-serif text-2xl">{draft.name}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:text-[var(--dojo-hinomaru)]" data-testid="user-drawer-close"><X size={18} /></button>
        </div>
        <div className="flex gap-1 px-6 pt-4 border-b border-[var(--dojo-border)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs uppercase tracking-[0.18em] border-b-2 ${tab === t.id ? "border-[var(--dojo-green)] text-[var(--dojo-ink)]" : "border-transparent text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]"}`}
              data-testid={`user-tab-${t.id}`}
            >{t.label}</button>
          ))}
        </div>
        <div className="p-6 space-y-6">
          {/* PROFILE */}
          {tab === "profile" && (
            <div className="space-y-4 max-w-2xl">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Full Name"><input className="input" value={draft.name || ""} onChange={(e) => set("name", e.target.value)} data-testid="user-name-input" /></Field>
                <Field label="Email" hint="Optional — used for password resets and notifications."><input className="input" type="email" value={draft.email || ""} onChange={(e) => set("email", e.target.value)} disabled={!isSuper} placeholder="(optional)" data-testid="user-email-input" /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Username *" hint="Required. The login they'll type at sign-in.">
                  <input
                    className="input"
                    required
                    value={draft.username || ""}
                    onChange={(e) => set("username", e.target.value.replace(/\s/g, "").toLowerCase())}
                    placeholder="e.g. johnsmith"
                    disabled={!isAdminLike && currentUser?.id !== user.id}
                    data-testid="user-username-input"
                  />
                </Field>
                <Field label="Phone"><input className="input" value={draft.phone || ""} onChange={(e) => set("phone", e.target.value)} /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Belt Rank">
                  <select className="input" value={draft.belt_rank || ""} onChange={(e) => set("belt_rank", e.target.value)} data-testid="user-belt-select">
                    <option value="">— None —</option>
                    {BELT_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                {isSuper ? (
                  <Field label="Role">
                    <select className="input" value={draft.role} onChange={(e) => set("role", e.target.value)} data-testid="user-role-select">
                      <option value="student">Student</option>
                      <option value="team_member">Team Member</option>
                      <option value="sensei">Sensei</option>
                      <option value="renshi">Renshi</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </Field>
                ) : <div />}
              </div>
              <Field label="Active">
                <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={!!draft.active} onChange={(e) => set("active", e.target.checked)} /> Account enabled</label>
              </Field>
              <Field label="Profile Photo" hint="Optional. JPG/PNG under 1.2 MB.">
                <div className="flex items-center gap-3">
                  {draft.photo_url && <img src={draft.photo_url} alt="" className="h-20 w-20 object-cover border border-[var(--dojo-border)]" />}
                  <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="text-sm" data-testid="user-profile-photo-upload" />
                  {draft.photo_url && <button type="button" onClick={() => set("photo_url", "")} className="text-xs text-[var(--dojo-hinomaru)] underline">Remove</button>}
                </div>
              </Field>
            </div>
          )}

          {/* INFORMATION */}
          {tab === "info" && (
            <div className="space-y-4 max-w-2xl">
              <Field label="Date of Birth"><input className="input" type="date" value={draft.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
              <Field label="Address"><textarea className="input min-h-[60px]" value={draft.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Emergency Contact Name"><input className="input" value={draft.emergency_contact_name || ""} onChange={(e) => set("emergency_contact_name", e.target.value)} /></Field>
                <Field label="Emergency Contact Phone"><input className="input" value={draft.emergency_contact_phone || ""} onChange={(e) => set("emergency_contact_phone", e.target.value)} /></Field>
              </div>
              <Field label="Medical Notes"><textarea className="input min-h-[80px]" value={draft.medical_notes || ""} onChange={(e) => set("medical_notes", e.target.value)} placeholder="Allergies, injuries, accommodations…" /></Field>
              <Field label="Internal Notes" hint="Only staff can see this."><textarea className="input min-h-[80px]" value={draft.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            </div>
          )}

          {/* ID CARD */}
          {tab === "idcard" && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Field label="Template" hint="Pick a starting design. Saves instantly — per-user overrides stack on top.">
                  <select
                    className="input"
                    value={draft.idcard_template || ""}
                    onChange={async (e) => {
                      const newKey = e.target.value || null;
                      set("idcard_template", newKey);
                      // Auto-save the template selection so the user's actual
                      // card (and student dashboard) updates immediately —
                      // admins shouldn't need an extra "Save Changes" click
                      // just to switch templates. Per-user override fields
                      // still need the normal Save flow.
                      if (user?.id) {
                        try {
                          await api.patch(`/users/${user.id}`, { idcard_template: newKey });
                          if (onSaved) onSaved({ ...user, idcard_template: newKey });
                        } catch (err) { setMsg(formatApiError(err)); }
                      }
                    }}
                    data-testid="idcard-template-select"
                  >
                    <option value="">— Default (CMS) —</option>
                    {Object.entries(liveTemplates).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.description}</option>)}
                  </select>
                </Field>
                <div className="border border-[var(--dojo-border)] p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Custom overrides (this user only)</div>
                  {[
                    ["dojo_name", "Dojo Name"],
                    ["certificate_title", "Member Title"],
                    ["kanji_top", "Kanji (top)"],
                    ["kanji_bottom", "Kanji (bottom)"],
                    ["issued_text", "Issued footer"],
                    ["scan_text", "Scan caption"],
                    ["name_label", "Name label"],
                    ["role_label", "Role label"],
                    ["rank_label", "Rank label"],
                    ["footer_label", "Member# label"],
                  ].map(([k, label]) => (
                    <Field key={k} label={label}>
                      <input
                        className="input"
                        value={(draft.idcard_overrides || {})[k] || ""}
                        onChange={(e) => setOverride(k, e.target.value)}
                        placeholder="Use template default"
                      />
                    </Field>
                  ))}
                  <Field label="Accent Color">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={(draft.idcard_overrides || {}).accent_color || "#D7263D"}
                        onChange={(e) => setOverride("accent_color", e.target.value)}
                        className="h-10 w-16 border border-[var(--dojo-border)]"
                      />
                      <input
                        className="input"
                        value={(draft.idcard_overrides || {}).accent_color || ""}
                        onChange={(e) => setOverride("accent_color", e.target.value)}
                        placeholder="#D7263D"
                      />
                    </div>
                  </Field>
                  <Field label="QR Code Color" hint="Stays solid + high-contrast against white for reliable scans.">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={(draft.idcard_overrides || {}).qr_color || "#D7263D"}
                        onChange={(e) => setOverride("qr_color", e.target.value)}
                        className="h-10 w-16 border border-[var(--dojo-border)]"
                        data-testid="user-qr-color-picker"
                      />
                      <input
                        className="input"
                        value={(draft.idcard_overrides || {}).qr_color || ""}
                        onChange={(e) => setOverride("qr_color", e.target.value)}
                        placeholder="#D7263D"
                        data-testid="user-qr-color-input"
                      />
                    </div>
                  </Field>
                  <Field label="Certificate Title Background" hint="Soft pill drawn behind the title so it stays readable on busy backgrounds. Leave blank for none.">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={(draft.idcard_overrides || {}).title_bg_color || "#FFF1D6"}
                        onChange={(e) => setOverride("title_bg_color", e.target.value)}
                        className="h-10 w-16 border border-[var(--dojo-border)]"
                        data-testid="user-title-bg-picker"
                      />
                      <input
                        className="input flex-1"
                        value={(draft.idcard_overrides || {}).title_bg_color || ""}
                        onChange={(e) => setOverride("title_bg_color", e.target.value)}
                        placeholder="#FFF1D6 (or blank for none)"
                        data-testid="user-title-bg-input"
                      />
                      <button
                        type="button"
                        onClick={() => setOverride("title_bg_color", "")}
                        className="text-[10px] uppercase tracking-[0.18em] px-2 py-1 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)]"
                        data-testid="user-title-bg-clear"
                      >Clear</button>
                    </div>
                  </Field>
                  <Field label="Member Title Text Color" hint="Color of the certificate title text itself.">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={(draft.idcard_overrides || {}).title_text_color || "#0F0F0F"}
                        onChange={(e) => setOverride("title_text_color", e.target.value)}
                        className="h-10 w-16 border border-[var(--dojo-border)]"
                        data-testid="user-title-text-picker"
                      />
                      <input
                        className="input flex-1"
                        value={(draft.idcard_overrides || {}).title_text_color || ""}
                        onChange={(e) => setOverride("title_text_color", e.target.value)}
                        placeholder="#0F0F0F"
                        data-testid="user-title-text-input"
                      />
                      <button
                        type="button"
                        onClick={() => setOverride("title_text_color", "")}
                        className="text-[10px] uppercase tracking-[0.18em] px-2 py-1 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)]"
                        data-testid="user-title-text-clear"
                      >Clear</button>
                    </div>
                  </Field>

                  {/* Photo + QR size sliders */}
                  <div className="border-t border-dashed border-[var(--dojo-border)] pt-3 mt-1 space-y-3" data-testid="user-idcard-sizes">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Photo & QR Size</div>
                    {[
                      ["photo_size", "Student Photo", 100, 300],
                      ["qr_size", "QR Code", 100, 200],
                      ["background_size", "Card Background", 100, 200],
                    ].map(([key, label, , maxPct]) => {
                      const cur = (draft.idcard_overrides || {})[key];
                      const pct = Math.round(((cur ?? 1)) * 100);
                      return (
                        <div key={key} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                          <label className="text-[11px] text-[var(--dojo-ink-soft)]">{label}</label>
                          <input
                            type="range"
                            min="25"
                            max={maxPct}
                            step="5"
                            value={pct}
                            onChange={(e) => setOverride(key, Number(e.target.value) / 100)}
                            className="w-44 accent-[var(--dojo-green)]"
                            data-testid={`user-idcard-${key}-slider`}
                          />
                          <span className="font-mono-accent text-[11px] w-12 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Font size editor */}
                  <div className="border-t border-dashed border-[var(--dojo-border)] pt-3 mt-1">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Font Sizes (px)</div>
                      <div className="flex items-center gap-1" data-testid="user-idcard-presets">
                        {[
                          ["compact", "Compact"],
                          ["standard", "Standard"],
                          ["large_print", "Large-print"],
                        ].map(([k, lbl]) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setOverride("font_sizes", FONT_SIZE_PRESETS[k].sizes)}
                            className="text-[10px] uppercase tracking-[0.18em] px-2 py-1 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)]"
                            data-testid={`user-idcard-preset-${k}`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5" data-testid="user-idcard-fontsizes">
                      {[
                        ["dojo_name", "Dojo name", 10, { kind: "label" }],
                        ["certificate_title", "Title", 20, { kind: "title" }],
                        ["kanji_top", "Kanji (top)", 24, { kind: "kanji" }],
                        ["member_name", "Member name", 20, { kind: "title" }],
                        ["role_value", "Role value", 12, { kind: "value" }],
                        ["rank_value", "Rank value", 12, { kind: "value" }],
                        ["member_number", "Member #", 14, { kind: "mono" }],
                        ["field_label", "Field labels", 10, { kind: "label" }],
                        ["scan_text", "Scan caption", 9, { kind: "label" }],
                        ["issued_text", "Issued footer", 10, { kind: "label" }],
                        ["kanji_bottom", "Kanji (bottom)", 16, { kind: "kanji" }],
                      ].map(([key, label, def, opts]) => {
                        const cur = ((draft.idcard_overrides || {}).font_sizes || {})[key];
                        const effective = cur ?? def;
                        // Inline preview style mirrors the actual card render.
                        const sampleStyle = (() => {
                          const base = { fontSize: `${effective}px`, lineHeight: 1.1 };
                          if (opts.kind === "kanji") return { ...base, fontFamily: "var(--font-kanji, serif)", color: "var(--dojo-hinomaru)" };
                          if (opts.kind === "title") return { ...base, fontFamily: "var(--font-serif, serif)", fontWeight: 500 };
                          if (opts.kind === "value") return { ...base, fontWeight: 500, textTransform: "capitalize" };
                          if (opts.kind === "mono") return { ...base, fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.1em" };
                          // label
                          return { ...base, textTransform: "uppercase", letterSpacing: "0.24em", color: "var(--dojo-ink-soft)" };
                        })();
                        return (
                          <div key={key} className="grid grid-cols-[110px_1fr_auto] gap-3 items-center" data-testid={`user-idcard-fs-row-${key}`}>
                            <label className="text-[11px] text-[var(--dojo-ink-soft)] truncate" title={label}>{label}</label>
                            <div className="overflow-hidden whitespace-nowrap" style={sampleStyle} data-testid={`user-idcard-fs-sample-${key}`}>
                              {label}
                            </div>
                            <input
                              type="number"
                              min={6}
                              max={64}
                              value={cur ?? ""}
                              placeholder={String(def)}
                              onChange={(e) => {
                                const v = e.target.value;
                                const fs = { ...((draft.idcard_overrides || {}).font_sizes || {}) };
                                if (v === "") delete fs[key];
                                else fs[key] = Math.min(64, Math.max(6, Number(v)));
                                setOverride("font_sizes", fs);
                              }}
                              className="input w-16 text-center"
                              data-testid={`user-idcard-fs-${key}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setOverride("font_sizes", {})}
                      className="text-[10px] text-[var(--dojo-hinomaru)] underline mt-2"
                    >Reset font sizes</button>
                  </div>
                  {isAdminLike && (
                    <Field label="Background Image" hint="JPG/PNG under 1.5 MB. Stacks behind the certificate as a faded watermark.">
                      <div className="flex items-center gap-3 flex-wrap">
                        {(draft.idcard_overrides || {}).background_url && (
                          <img
                            src={(draft.idcard_overrides || {}).background_url}
                            alt="Background preview"
                            className="h-16 w-24 object-cover border border-[var(--dojo-border)]"
                          />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={onBackground}
                          className="text-sm"
                          data-testid="user-idcard-bg-upload"
                        />
                        {(draft.idcard_overrides || {}).background_url && (
                          <button
                            type="button"
                            onClick={() => setOverride("background_url", "")}
                            className="text-xs text-[var(--dojo-hinomaru)] underline"
                          >Remove</button>
                        )}
                      </div>
                    </Field>
                  )}
                  <button
                    type="button"
                    onClick={() => set("idcard_overrides", {})}
                    className="text-xs text-[var(--dojo-hinomaru)] underline"
                    data-testid="idcard-clear-overrides"
                  >Clear all overrides</button>
                </div>

                {/* QR code management */}
                <div className="border border-[var(--dojo-border)] p-4 space-y-3">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">QR Code</div>
                  <div className="flex items-center gap-4">
                    {qrPng ? (
                      <img src={qrPng} alt="QR code" className="w-24 h-24 border border-[var(--dojo-border)]" data-testid="user-qr-preview" />
                    ) : (
                      <div className="w-24 h-24 border border-dashed border-[var(--dojo-border)] flex items-center justify-center text-[10px] text-[var(--dojo-ink-soft)]">Loading…</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Code</div>
                      <div className="font-mono-accent text-xs break-all" data-testid="user-qr-value">{draft.qr_code || "—"}</div>
                      <button
                        type="button"
                        onClick={regenerateQR}
                        disabled={qrBusy}
                        className="btn-outline mt-3 inline-flex items-center gap-2 text-xs"
                        data-testid="user-qr-regenerate"
                      >
                        <RefreshCcw size={12} className={qrBusy ? "animate-spin" : ""} />
                        {qrBusy ? "Rotating…" : "Regenerate QR"}
                      </button>
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--dojo-ink-soft)]">
                    Rotating the QR invalidates any previously printed cards for this user.
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-3">Live Preview · Horizontal</div>
                <IDCard user={draft} defaultOrientation="horizontal" />
                <div className="border border-[var(--dojo-border)] p-4 mt-4 space-y-2">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Member Photo on Card</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {draft.photo_url ? (
                      <img src={draft.photo_url} alt="" className="h-20 w-16 object-cover border border-[var(--dojo-border)]" data-testid="user-idcard-photo-preview" />
                    ) : (
                      <div className="h-20 w-16 border border-dashed border-[var(--dojo-border)] flex items-center justify-center text-[8px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)] text-center px-1">No photo</div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={onPhoto}
                      className="text-sm"
                      data-testid="user-idcard-photo-upload"
                    />
                    {draft.photo_url && (
                      <button
                        type="button"
                        onClick={() => set("photo_url", "")}
                        className="text-xs text-[var(--dojo-hinomaru)] underline"
                      >Remove</button>
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--dojo-ink-soft)]">
                    Photo appears on the card next to the QR. JPG/PNG under 1.2 MB.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY */}
          {tab === "security" && (
            <div className="max-w-md space-y-5">
              <div className="border border-[var(--dojo-border)] p-4">
                <h3 className="font-serif text-lg mb-3">Reset Password</h3>
                <Field label="New Password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} placeholder="At least 6 characters" data-testid="user-newpass-input" /></Field>
                <button onClick={changePassword} disabled={busy || pw.length < 6} className="btn-primary mt-3 flex items-center gap-2" data-testid="user-newpass-submit">
                  <KeyRound size={14} /> {busy ? "Saving…" : "Update Password"}
                </button>
                <div className="text-xs text-[var(--dojo-ink-soft)] mt-2">User will need to use this on next login.</div>
              </div>
            </div>
          )}

          {msg && <div className="text-sm pt-3 border-t border-[var(--dojo-border)]" data-testid="user-drawer-msg">{msg}</div>}
        </div>
        {tab !== "security" && (
          <div className="sticky bottom-0 bg-[var(--dojo-paper)] border-t border-[var(--dojo-border)] px-6 py-4 flex justify-end gap-3">
            <button onClick={onClose} className="btn-outline">Close</button>
            <button onClick={save} disabled={busy} className="btn-primary flex items-center gap-2" data-testid="user-drawer-save">
              <Save size={14} /> {busy ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-1">{hint}</div>}
    </div>
  );
}
