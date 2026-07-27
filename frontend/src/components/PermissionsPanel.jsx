import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { EyeOff, Eye, Plus, Trash2 } from "lucide-react";
import { useT } from "@/context/LanguageContext";

/**
 * Super-admin tab.
 *
 * Now split into three cards:
 *   1. Role permissions (built-in + custom, with per-role toggles)
 *   2. Auto-deactivation settings (days + metric + Run Now button)
 *   3. Permission catalog admin: hide built-in, add/delete custom tags
 */
export default function PermissionsPanel() {
  const { t } = useT();
  const [catalog, setCatalog] = useState(null);
  const [extras, setExtras] = useState([]); // PermissionCatalogEntry rows
  const [role, setRole] = useState("admin");
  const [roleData, setRoleData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // Auto-deactivation
  const [autoCfg, setAutoCfg] = useState({ days: 0, metric: "either" });
  const [autoBusy, setAutoBusy] = useState(false);
  // Custom tag form
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const reloadAll = async () => {
    const [c, x, s] = await Promise.all([
      api.get("/permissions/catalog").catch(() => null),
      api.get("/permission-catalog").catch(() => ({ data: [] })),
      api.get("/settings/auto-deactivate").catch(() => ({ data: { days: 0, metric: "either" } })),
    ]);
    if (c) setCatalog(c.data);
    setExtras(x.data || []);
    setAutoCfg(s.data || { days: 0, metric: "either" });
  };

  useEffect(() => { reloadAll(); }, []);

  useEffect(() => {
    if (!role) return;
    api.get(`/roles/${role}/permissions`).then((r) => setRoleData(r.data)).catch((e) => setMsg(formatApiError(e)));
  }, [role]);

  const toggle = async (key, currentValue) => {
    setBusy(true);
    try {
      const next = !currentValue;
      const defaults = new Set(roleData?.defaults || []);
      const wouldMatchDefault = next === defaults.has(key);
      const payload = { permission_key: key, allowed: wouldMatchDefault ? null : next };
      await api.put(`/roles/${role}/permissions`, payload);
      const { data } = await api.get(`/roles/${role}/permissions`);
      setRoleData(data);
    } catch (e) {
      setMsg(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  // Look up `hidden` + `custom` flags from the extras table.
  const extraByKey = Object.fromEntries((extras || []).map((r) => [r.key, r]));

  const hideBuiltin = async (key, hidden) => {
    try {
      await api.patch(`/permission-catalog/${encodeURIComponent(key)}`, { hidden });
      await reloadAll();
      toast.success(hidden ? t("perm.hidden_toast") : t("perm.shown_toast"));
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const addCustom = async (e) => {
    e.preventDefault();
    const key = newKey.trim();
    if (!key) return;
    try {
      await api.post("/permission-catalog", { key, description: newDesc.trim() || null });
      setNewKey(""); setNewDesc("");
      await reloadAll();
      toast.success(t("perm.added_toast"));
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const deleteCustom = async (key) => {
    if (!window.confirm(t("perm.delete_confirm").replace("{key}", key))) return;
    try {
      await api.delete(`/permission-catalog/${encodeURIComponent(key)}`);
      await reloadAll();
      toast.success(t("perm.deleted_toast"));
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const saveAutoCfg = async () => {
    setAutoBusy(true);
    try {
      await api.put("/settings/auto-deactivate", autoCfg);
      toast.success(t("perm.autodeact_saved"));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setAutoBusy(false); }
  };

  const runAutoNow = async () => {
    if (!window.confirm(t("perm.autodeact_run_confirm"))) return;
    setAutoBusy(true);
    try {
      const { data } = await api.post("/settings/auto-deactivate/run");
      toast.success(t("perm.autodeact_ran").replace("{n}", data.deactivated ?? 0));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setAutoBusy(false); }
  };

  if (!catalog) return <div className="text-sm text-[var(--dojo-ink-soft)]">{t("perm.loading")}</div>;

  const roles = (catalog.roles || []).filter((r) => r !== "super_admin");
  // Merge built-in + custom permissions. Built-ins get filtered out if hidden.
  const builtinKeys = new Set(catalog.permissions.map((p) => p.key));
  const visibleBuiltins = catalog.permissions.filter((p) => !extraByKey[p.key]?.hidden);
  const customTags = (extras || []).filter((r) => r.custom);

  return (
    <div className="space-y-8" data-testid="permissions-panel">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{t("perm.access_control")}</div>
        <h2 className="font-serif text-2xl">{t("perm.roles_and_permissions")}</h2>
        <p className="text-sm text-[var(--dojo-ink-soft)] mt-1">{t("perm.hint")}</p>
      </div>

      {/* Role permissions matrix */}
      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)]">
        <div className="flex gap-2 p-3 border-b border-[var(--dojo-border)] overflow-x-auto">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 text-xs uppercase tracking-[0.18em] border whitespace-nowrap ${role === r ? "bg-[var(--dojo-ink)] text-[var(--dojo-paper)] border-[var(--dojo-ink)]" : "border-[var(--dojo-border)]"}`}
              data-testid={`perm-role-${r}`}
            >
              {r.replace("_", " ")}
            </button>
          ))}
        </div>
        {!roleData ? (
          <div className="p-10 text-sm text-[var(--dojo-ink-soft)]">{t("perm.loading_short")}</div>
        ) : (
          <ul>
            {visibleBuiltins.map((perm) => {
              const allowed = !!roleData.effective?.[perm.key];
              const hasOverride = perm.key in (roleData.overrides || {});
              return (
                <li key={perm.key} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--dojo-border)] last:border-b-0" data-testid={`perm-row-${perm.key}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{perm.description}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--dojo-ink-soft)] mt-0.5">
                      {perm.key} {hasOverride && <span className="text-[var(--dojo-hinomaru)]">({t("perm.override")})</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => hideBuiltin(perm.key, true)}
                      className="p-1.5 border border-[var(--dojo-border)] hover:border-[var(--dojo-ink)] text-[var(--dojo-ink-soft)]"
                      title={t("perm.hide_from_ui")}
                      data-testid={`perm-hide-${perm.key}`}
                    ><EyeOff size={12} /></button>
                    <button
                      onClick={() => toggle(perm.key, allowed)}
                      disabled={busy}
                      className={`relative w-12 h-6 transition-colors ${allowed ? "bg-[var(--dojo-green)]" : "bg-[var(--dojo-border)]"}`}
                      aria-label={`Toggle ${perm.key}`}
                      data-testid={`perm-toggle-${perm.key}`}
                    >
                      <span className={`absolute top-0.5 transition-all w-5 h-5 bg-white shadow ${allowed ? "left-[26px]" : "left-0.5"}`} />
                    </button>
                  </div>
                </li>
              );
            })}
            {visibleBuiltins.length === 0 && (
              <li className="px-6 py-8 text-center text-sm text-[var(--dojo-ink-soft)]">{t("perm.all_hidden")}</li>
            )}
          </ul>
        )}
        {/* Hidden built-ins get a "restore" strip so a super-admin can unhide */}
        {catalog.permissions.filter((p) => extraByKey[p.key]?.hidden).length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--dojo-border)] bg-[var(--dojo-paper-alt)]" data-testid="perm-hidden-list">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-2">{t("perm.hidden_permissions")}</div>
            <div className="flex flex-wrap gap-2">
              {catalog.permissions.filter((p) => extraByKey[p.key]?.hidden).map((p) => (
                <button
                  key={p.key}
                  onClick={() => hideBuiltin(p.key, false)}
                  className="text-[11px] px-2 py-1 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)] flex items-center gap-1"
                  data-testid={`perm-unhide-${p.key}`}
                ><Eye size={12} /> {p.key}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Auto-deactivation card */}
      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6" data-testid="auto-deactivate-card">
        <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{t("perm.membership")}</div>
        <h3 className="font-serif text-xl mb-2">{t("perm.auto_deactivate_title")}</h3>
        <p className="text-xs text-[var(--dojo-ink-soft)] mb-4">{t("perm.auto_deactivate_hint")}</p>
        <div className="grid md:grid-cols-[auto_auto_1fr_auto_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-1">{t("perm.days")}</label>
            <input
              type="number" min={0} max={3650}
              value={autoCfg.days}
              onChange={(e) => setAutoCfg({ ...autoCfg, days: Math.max(0, Math.min(3650, Number(e.target.value) || 0)) })}
              className="input w-24"
              data-testid="auto-deactivate-days"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-1">{t("perm.metric")}</label>
            <select
              value={autoCfg.metric}
              onChange={(e) => setAutoCfg({ ...autoCfg, metric: e.target.value })}
              className="input"
              data-testid="auto-deactivate-metric"
            >
              <option value="scan">{t("perm.metric.scan")}</option>
              <option value="login">{t("perm.metric.login")}</option>
              <option value="either">{t("perm.metric.either")}</option>
            </select>
          </div>
          <div />
          <button
            type="button"
            onClick={saveAutoCfg}
            disabled={autoBusy}
            className="btn-outline"
            data-testid="auto-deactivate-save"
          >{t("btn.save")}</button>
          <button
            type="button"
            onClick={runAutoNow}
            disabled={autoBusy || (autoCfg.days || 0) === 0}
            className="btn-primary"
            data-testid="auto-deactivate-run"
          >{t("perm.run_now")}</button>
        </div>
        {(autoCfg.days || 0) === 0 && (
          <div className="text-[11px] text-[var(--dojo-ink-soft)] mt-3">{t("perm.disabled_note")}</div>
        )}
      </div>

      {/* Custom tags card */}
      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6" data-testid="custom-perms-card">
        <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{t("perm.record_keeping")}</div>
        <h3 className="font-serif text-xl mb-2">{t("perm.custom_tags")}</h3>
        <p className="text-xs text-[var(--dojo-ink-soft)] mb-4">{t("perm.custom_tags_hint")}</p>
        <form onSubmit={addCustom} className="grid md:grid-cols-[1fr_1fr_auto] gap-3 mb-4">
          <input
            className="input"
            placeholder={t("perm.custom_key_placeholder")}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.replace(/\s+/g, "_").toLowerCase())}
            data-testid="perm-custom-key-input"
            required
          />
          <input
            className="input"
            placeholder={t("perm.custom_description_placeholder")}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            data-testid="perm-custom-desc-input"
          />
          <button type="submit" className="btn-primary flex items-center gap-2" data-testid="perm-custom-add">
            <Plus size={13} /> {t("perm.add_tag")}
          </button>
        </form>
        {customTags.length === 0 ? (
          <div className="text-sm text-[var(--dojo-ink-soft)]">{t("perm.no_custom_tags")}</div>
        ) : (
          <ul className="divide-y divide-[var(--dojo-border)] border border-[var(--dojo-border)]">
            {customTags.map((tag) => (
              <li key={tag.key} className="flex items-center justify-between px-3 py-2" data-testid={`perm-custom-row-${tag.key}`}>
                <div className="min-w-0">
                  <div className="text-sm">{tag.description || tag.key}</div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--dojo-ink-soft)] font-mono-accent">{tag.key}</div>
                </div>
                <button
                  onClick={() => deleteCustom(tag.key)}
                  className="p-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-hinomaru)] hover:text-[var(--dojo-hinomaru)]"
                  data-testid={`perm-custom-delete-${tag.key}`}
                  title={t("btn.delete")}
                ><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <div className="mt-4 text-[var(--dojo-hinomaru)] text-sm">{msg}</div>}
      {/* Reserved for future use — keeps builtinKeys import from being flagged unused. */}
      <span data-builtin-count={builtinKeys.size} className="hidden" />
    </div>
  );
}
