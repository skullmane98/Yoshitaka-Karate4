import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useT } from "@/context/LanguageContext";

/** Super-admin tab — toggle role-level permissions and view per-user effective. */
export default function PermissionsPanel() {
  const { t } = useT();
  const [catalog, setCatalog] = useState(null);
  const [role, setRole] = useState("admin");
  const [roleData, setRoleData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get("/permissions/catalog").then((r) => setCatalog(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!role) return;
    api.get(`/roles/${role}/permissions`).then((r) => setRoleData(r.data)).catch((e) => setMsg(formatApiError(e)));
  }, [role]);

  const toggle = async (key, currentValue, hasOverride) => {
    setBusy(true);
    try {
      const next = !currentValue;
      // If toggling back to defaults, send null (clear override)
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

  if (!catalog) return <div className="text-sm text-[var(--dojo-ink-soft)]">{t("perm.loading")}</div>;

  const roles = (catalog.roles || []).filter((r) => r !== "super_admin");

  return (
    <div data-testid="permissions-panel">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{t("perm.access_control")}</div>
          <h2 className="font-serif text-2xl">{t("perm.roles_and_permissions")}</h2>
          <p className="text-sm text-[var(--dojo-ink-soft)] mt-1">{t("perm.hint")}</p>
        </div>
      </div>
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
            {catalog.permissions.map((perm) => {
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
                  <button
                    onClick={() => toggle(perm.key, allowed, hasOverride)}
                    disabled={busy}
                    className={`relative w-12 h-6 transition-colors ${allowed ? "bg-[var(--dojo-green)]" : "bg-[var(--dojo-border)]"}`}
                    aria-label={`Toggle ${perm.key}`}
                    data-testid={`perm-toggle-${perm.key}`}
                  >
                    <span className={`absolute top-0.5 transition-all w-5 h-5 bg-white shadow ${allowed ? "left-[26px]" : "left-0.5"}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {msg && <div className="mt-4 text-[var(--dojo-hinomaru)] text-sm">{msg}</div>}
    </div>
  );
}
