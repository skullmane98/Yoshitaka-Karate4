import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Copy, Trash2, Plus, X, Mail } from "lucide-react";
import { toast } from "sonner";
import IDCard from "@/components/IDCard";
import { getEditorForSlug } from "@/components/CMSEditors";
import AttendancePanel from "@/components/AttendancePanel";
import { BELT_NAMES } from "@/lib/belts";

const ROLES_FOR = {
  admin: ["student"],
  super_admin: ["student", "admin"],
};

export default function AdminDashboard({ isSuper = false }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [codes, setCodes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [pages, setPages] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [editingPage, setEditingPage] = useState(null);

  const reload = async () => {
    const [u, c, p, s] = await Promise.all([
      api.get("/users").catch(() => ({ data: [] })),
      api.get("/access-codes").catch(() => ({ data: [] })),
      api.get("/payments").catch(() => ({ data: [] })),
      api.get("/stats").catch(() => ({ data: null })),
    ]);
    setUsers(u.data); setCodes(c.data); setPayments(p.data); setStats(s.data);
    if (isSuper) {
      const pg = await api.get("/cms/pages").catch(() => ({ data: [] }));
      setPages(pg.data);
    }
  };

  useEffect(() => { reload(); }, []);

  const TABS = isSuper
    ? [
        { id: "overview", label: "Overview" },
        { id: "users", label: "Users" },
        { id: "codes", label: "Access Codes" },
        { id: "payments", label: "Payments" },
        { id: "attendance", label: "Attendance" },
        { id: "cms", label: "CMS" },
      ]
    : [
        { id: "overview", label: "Overview" },
        { id: "students", label: "Students" },
        { id: "codes", label: "Access Codes" },
        { id: "payments", label: "Payments" },
        { id: "attendance", label: "Attendance" },
        { id: "idcard", label: "ID Card" },
      ];

  return (
    <DashboardLayout
      title={isSuper ? "Super Admin Control" : "Admin Portal"}
      subtitle={isSuper ? "Dojo Administration" : "Student Administration"}
    >
      <div className="flex gap-2 mb-8 border-b border-[var(--dojo-border)] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={`px-5 py-3 text-[11px] uppercase tracking-[0.2em] border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? "border-[var(--dojo-green)] text-[var(--dojo-ink)]" : "border-transparent text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 grid grid-cols-2 gap-4">
            <Stat label="Students" value={stats?.students ?? "—"} />
            {isSuper && <Stat label="Admins" value={stats?.admins ?? "—"} />}
            <Stat label="Payments Due" value={`$${(stats?.payments_due_total ?? 0).toFixed(2)}`} sub={`${stats?.payments_due_count ?? 0} open`} />
            <Stat label="Active Codes" value={codes.filter((c) => c.active).length} />
            <div className="col-span-2 border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-3">Latest Payments</div>
              <div className="divide-y divide-[var(--dojo-border)]">
                {payments.slice(0, 5).map((p) => (
                  <div key={p.id} className="py-2 flex justify-between text-sm">
                    <span>{p.user_name} · {p.description}</span>
                    <span className="font-mono-accent">${p.amount.toFixed(2)}</span>
                  </div>
                ))}
                {payments.length === 0 && <div className="text-sm text-[var(--dojo-ink-soft)]">No payments yet.</div>}
              </div>
            </div>
          </div>
          <div className="lg:col-span-5">
            <IDCard user={user} />
          </div>
        </div>
      )}

      {(tab === "users" || tab === "students") && (
        <UsersPanel
          users={users}
          onEdit={setEditingUser}
          onReload={reload}
          onBill={(u) => setPayFor(u)}
          isSuper={isSuper}
        />
      )}

      {tab === "codes" && (
        <CodesPanel codes={codes} allowedRoles={isSuper ? ROLES_FOR.super_admin : ROLES_FOR.admin} onReload={reload} />
      )}

      {tab === "payments" && (
        <PaymentsPanel payments={payments} onReload={reload} users={users} onNew={(u) => setPayFor(u)} />
      )}

      {tab === "attendance" && <AttendancePanel />}

      {tab === "cms" && isSuper && (
        <CMSPanel pages={pages} onEdit={setEditingPage} />
      )}

      {tab === "idcard" && !isSuper && (() => {
        const idcardPage = pages.find((p) => p.slug === "idcard") || {
          slug: "idcard",
          title: "Member ID Card",
          content: {},
          updated_at: new Date().toISOString(),
        };
        return (
          <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6 max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Customize</div>
                <h2 className="font-serif text-2xl">Member ID Card Design</h2>
              </div>
              <button onClick={() => setEditingPage(idcardPage)} className="btn-primary" data-testid="open-idcard-editor">Edit Design</button>
            </div>
            <p className="text-sm text-[var(--dojo-ink-soft)]">
              Edit the labels, kanji, accent color, dojo logo, and background image used on every member's certificate.
              Changes apply instantly to every student's dashboard.
            </p>
          </div>
        );
      })()}

      {editingUser && (
        <EditUserModal user={editingUser} isSuper={isSuper} onClose={() => setEditingUser(null)} onSaved={reload} />
      )}
      {payFor && (
        <NewPaymentModal user={payFor} onClose={() => setPayFor(null)} onSaved={reload} />
      )}
      {editingPage && (
        <EditPageModal page={editingPage} onClose={() => setEditingPage(null)} onSaved={() => { setEditingPage(null); reload(); }} />
      )}
    </DashboardLayout>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="border border-[var(--dojo-border)] p-6 bg-[var(--dojo-paper)]">
      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-2">{label}</div>
      <div className="font-serif text-4xl tracking-tight">{value}</div>
      {sub && <div className="text-xs text-[var(--dojo-ink-soft)] mt-1">{sub}</div>}
    </div>
  );
}

function UsersPanel({ users, onEdit, onReload, onBill, isSuper }) {
  const del = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This removes their payments too.`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("User deleted"); onReload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)]" data-testid="users-panel">
      <div className="px-6 py-4 border-b border-[var(--dojo-border)] flex justify-between items-center">
        <h2 className="font-serif text-2xl">{isSuper ? "All Users" : "Students"}</h2>
        <span className="text-xs text-[var(--dojo-ink-soft)]">{users.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--dojo-paper-alt)] text-[10px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)]">
            <tr>
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Email</th>
              <th className="text-left px-6 py-3">Role</th>
              <th className="text-left px-6 py-3">Belt</th>
              <th className="text-left px-6 py-3">Member No.</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-right px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--dojo-border)]" data-testid={`user-row-${u.id}`}>
                <td className="px-6 py-3 font-medium">{u.name}</td>
                <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{u.email}</td>
                <td className="px-6 py-3 capitalize">{u.role.replace("_", " ")}</td>
                <td className="px-6 py-3">{u.belt_rank || "—"}</td>
                <td className="px-6 py-3 font-mono-accent text-xs">{u.member_number}</td>
                <td className="px-6 py-3">
                  <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                    u.active ? "border-[#2E4E3F] text-[#2E4E3F]" : "border-[var(--dojo-hinomaru)] text-[var(--dojo-hinomaru)]"
                  }`}>{u.active ? "Active" : "Disabled"}</span>
                </td>
                <td className="px-6 py-3 text-right whitespace-nowrap">
                  <button className="text-xs underline mr-3" onClick={() => onEdit(u)} data-testid={`edit-user-${u.id}`}>Edit</button>
                  {u.role === "student" && (
                    <button className="text-xs underline mr-3" onClick={() => onBill(u)} data-testid={`bill-user-${u.id}`}>Bill</button>
                  )}
                  {isSuper && (
                    <button className="text-xs text-[var(--dojo-hinomaru)] underline" onClick={() => del(u)} data-testid={`delete-user-${u.id}`}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]">No users.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodesPanel({ codes, allowedRoles, onReload }) {
  const [role, setRole] = useState(allowedRoles[0]);
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/access-codes", { role, max_uses: Number(maxUses), note: note || null });
      setNote(""); setMaxUses(1);
      toast.success("Access code created");
      onReload();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setCreating(false); }
  };
  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const deactivate = async (c) => {
    if (!window.confirm("Deactivate this access code?")) return;
    try { await api.delete(`/access-codes/${c.id}`); toast.success("Deactivated"); onReload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="codes-panel">
      <form onSubmit={create} className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6 grid md:grid-cols-[1fr_1fr_2fr_auto] gap-4 items-end">
        <div>
          <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-3 py-2" data-testid="code-role-select">
            {allowedRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Max Uses</label>
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-3 py-2" data-testid="code-maxuses-input" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-3 py-2" data-testid="code-note-input" />
        </div>
        <button className="btn-primary flex items-center gap-2" disabled={creating} data-testid="code-create-btn">
          <Plus size={14} /> {creating ? "…" : "Create"}
        </button>
      </form>

      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--dojo-paper-alt)] text-[10px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)]">
              <tr>
                <th className="text-left px-6 py-3">Code</th>
                <th className="text-left px-6 py-3">Role</th>
                <th className="text-left px-6 py-3">Usage</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Note</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-[var(--dojo-border)]" data-testid={`code-row-${c.id}`}>
                  <td className="px-6 py-3 font-mono-accent tracking-widest">{c.code}</td>
                  <td className="px-6 py-3 capitalize">{c.role}</td>
                  <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{c.used_count} / {c.max_uses}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                      c.active ? "border-[#2E4E3F] text-[#2E4E3F]" : "border-[var(--dojo-ink-soft)] text-[var(--dojo-ink-soft)]"
                    }`}>{c.active ? "Active" : "Inactive"}</span>
                  </td>
                  <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{c.note || "—"}</td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button className="text-xs inline-flex items-center gap-1 mr-3" onClick={() => copy(c.code)} data-testid={`copy-code-${c.id}`}><Copy size={12} /> Copy</button>
                    {c.active && <button className="text-xs text-[var(--dojo-hinomaru)] underline" onClick={() => deactivate(c)} data-testid={`deactivate-code-${c.id}`}>Deactivate</button>}
                  </td>
                </tr>
              ))}
              {codes.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]">No codes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PaymentsPanel({ payments, onReload, users, onNew }) {
  const [selectedUser, setSelectedUser] = useState("");

  const setStatus = async (p, status) => {
    try { await api.patch(`/payments/${p.id}`, { status }); toast.success("Updated"); onReload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (p) => {
    if (!window.confirm("Delete this payment record?")) return;
    try { await api.delete(`/payments/${p.id}`); toast.success("Deleted"); onReload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const sendReminder = async (p) => {
    try {
      const { data } = await api.post(`/payments/${p.id}/remind`);
      if (data.mode === "console") {
        toast.success(`Reminder logged (no SMTP configured) → ${data.to}`);
      } else {
        toast.success(`Reminder emailed to ${data.to}`);
      }
      onReload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const students = users.filter((u) => u.role === "student");

  return (
    <div className="space-y-6" data-testid="payments-panel">
      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6 flex gap-4 items-end">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">Bill Student</label>
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-full border border-[var(--dojo-border)] bg-[var(--dojo-input-bg)] px-3 py-2" data-testid="payment-user-select">
            <option value="">Select student…</option>
            {students.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
        <button
          className="btn-primary"
          disabled={!selectedUser}
          onClick={() => { const u = users.find((x) => x.id === selectedUser); if (u) onNew(u); }}
          data-testid="new-payment-btn"
        >New Invoice</button>
      </div>

      <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--dojo-paper-alt)] text-[10px] uppercase tracking-[0.2em] text-[var(--dojo-ink-soft)]">
              <tr>
                <th className="text-left px-6 py-3">Student</th>
                <th className="text-left px-6 py-3">Description</th>
                <th className="text-left px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Due</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-[var(--dojo-border)]" data-testid={`adm-payment-row-${p.id}`}>
                  <td className="px-6 py-3 font-medium">{p.user_name}</td>
                  <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{p.description}</td>
                  <td className="px-6 py-3 font-mono-accent">${p.amount.toFixed(2)}</td>
                  <td className="px-6 py-3 text-[var(--dojo-ink-soft)]">{p.due_date ? new Date(p.due_date).toLocaleDateString() : "—"}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                      p.status === "paid" ? "border-[#2E4E3F] text-[#2E4E3F]" :
                      p.status === "overdue" ? "border-[var(--dojo-hinomaru)] text-[var(--dojo-hinomaru)]" :
                      "border-[#B87F17] text-[#B87F17]"
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    {p.status !== "paid" && (
                      <button
                        className="text-xs underline mr-3 inline-flex items-center gap-1"
                        onClick={() => sendReminder(p)}
                        data-testid={`remind-payment-${p.id}`}
                        title="Send email reminder"
                      >
                        <Mail size={12} /> Remind
                      </button>
                    )}
                    {p.status !== "paid" && <button className="text-xs underline mr-3" onClick={() => setStatus(p, "paid")} data-testid={`mark-paid-${p.id}`}>Mark Paid</button>}
                    {p.status === "paid" && <button className="text-xs underline mr-3" onClick={() => setStatus(p, "due")} data-testid={`mark-due-${p.id}`}>Reopen</button>}
                    {p.status === "due" && <button className="text-xs underline mr-3" onClick={() => setStatus(p, "overdue")} data-testid={`mark-overdue-${p.id}`}>Overdue</button>}
                    <button className="text-xs text-[var(--dojo-hinomaru)] underline" onClick={() => del(p)} data-testid={`delete-payment-${p.id}`}><Trash2 size={12} className="inline" /></button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-[var(--dojo-ink-soft)]">No payments.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CMSPanel({ pages, onEdit }) {
  return (
    <div className="grid md:grid-cols-2 gap-4" data-testid="cms-panel">
      {pages.map((p) => (
        <div key={p.slug} className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6 flex flex-col" data-testid={`cms-page-${p.slug}`}>
          <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-2">/{p.slug}</div>
          <h3 className="font-serif text-2xl mb-2">{p.title}</h3>
          <div className="text-xs text-[var(--dojo-ink-soft)] mb-4">Last updated {new Date(p.updated_at).toLocaleString()}</div>
          <button className="btn-outline self-start" onClick={() => onEdit(p)} data-testid={`edit-page-${p.slug}`}>Edit Content</button>
        </div>
      ))}
    </div>
  );
}

function EditUserModal({ user, isSuper, onClose, onSaved }) {
  const { user: currentUser } = useAuth();
  const isSelf = currentUser?.id === user.id;
  const [form, setForm] = useState({
    name: user.name || "",
    phone: user.phone || "",
    belt_rank: user.belt_rank || "",
    email: user.email || "",
    role: user.role,
    active: user.active,
  });
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { name: form.name, phone: form.phone, belt_rank: form.belt_rank, active: form.active };
      if (isSuper) {
        payload.email = form.email;
        if (!isSelf && form.role !== user.role) payload.role = form.role;
      }
      await api.patch(`/users/${user.id}`, payload);
      if (newPw) await api.post(`/users/${user.id}/password`, { new_password: newPw });
      toast.success("User updated");
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit ${user.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" data-testid="edit-user-name" /></Field>
        <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" data-testid="edit-user-phone" /></Field>
        {isSuper && !isSelf && (
          <Field label="Role / Access Level">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="input"
              data-testid="edit-user-role"
            >
              <option value="student">Student</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            {form.role !== user.role && (
              <div className="text-[11px] text-[var(--dojo-hinomaru)] mt-1">
                Changing role from <strong>{user.role.replace("_", " ")}</strong> to <strong>{form.role.replace("_", " ")}</strong>.
              </div>
            )}
          </Field>
        )}
        {form.role === "student" && (
          <Field label="Belt Rank">
            <select value={form.belt_rank || ""} onChange={(e) => setForm({ ...form, belt_rank: e.target.value })} className="input" data-testid="edit-user-belt">
              <option value="">—</option>
              {BELT_NAMES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        )}
        {isSuper && <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" data-testid="edit-user-email" /></Field>}
        <Field label="Status">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} data-testid="edit-user-active" />
            Account active
          </label>
        </Field>
        <Field label="Reset Password (optional)">
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Leave blank to keep" className="input" data-testid="edit-user-newpw" />
        </Field>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary flex-1" disabled={busy} data-testid="edit-user-save">{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="btn-outline" onClick={onClose} data-testid="edit-user-cancel">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function NewPaymentModal({ user, onClose, onSaved }) {
  const [desc, setDesc] = useState("Monthly Tuition");
  const [amount, setAmount] = useState("120");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/payments", {
        user_id: user.id,
        description: desc,
        amount: Number(amount),
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status: "due",
      });
      toast.success("Invoice created");
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`New Invoice · ${user.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Description"><input value={desc} onChange={(e) => setDesc(e.target.value)} className="input" data-testid="new-pay-desc" /></Field>
        <Field label="Amount"><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="input" data-testid="new-pay-amount" /></Field>
        <Field label="Due Date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" data-testid="new-pay-due" /></Field>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary flex-1" disabled={busy} data-testid="new-pay-save">{busy ? "Saving…" : "Create"}</button>
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function EditPageModal({ page, onClose, onSaved }) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showJson, setShowJson] = useState(false);

  const Editor = getEditorForSlug(page.slug);

  const save = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await api.put(`/cms/pages/${page.slug}`, { title, content });
      toast.success("Page saved");
      onSaved();
    } catch (e) { setErr(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit /${page.slug}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5">
        {Editor ? (
          <Editor value={content} onChange={setContent} title={title} onTitleChange={setTitle} />
        ) : (
          <Field label="Content (JSON)">
            <textarea
              value={JSON.stringify(content, null, 2)}
              onChange={(e) => {
                try { setContent(JSON.parse(e.target.value)); setErr(""); }
                catch (pe) { setErr("Invalid JSON: " + pe.message); }
              }}
              rows={18}
              spellCheck={false}
              className="input font-mono-accent text-xs"
              data-testid="edit-page-json"
            />
          </Field>
        )}

        {Editor && (
          <details className="border-t border-[var(--dojo-border)] pt-3">
            <summary className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] cursor-pointer" onClick={() => setShowJson(!showJson)}>
              Advanced · View raw JSON
            </summary>
            <pre className="text-xs font-mono-accent bg-[var(--dojo-paper-alt)] p-3 mt-2 overflow-auto max-h-60">{JSON.stringify(content, null, 2)}</pre>
          </details>
        )}

        {err && <div className="text-[var(--dojo-hinomaru)] text-sm" data-testid="edit-page-error">{err}</div>}
        <div className="flex gap-3 sticky bottom-0 bg-[var(--dojo-paper)] pt-3 border-t border-[var(--dojo-border)]">
          <button type="submit" className="btn-primary flex-1" disabled={busy} data-testid="edit-page-save">{busy ? "Saving…" : "Save Page"}</button>
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose} data-testid="modal-overlay">
      <div
        className={`bg-[var(--dojo-paper)] border border-[var(--dojo-border)] w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-[var(--dojo-border)]">
          <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-1 hover:text-[var(--dojo-hinomaru)]" data-testid="modal-close"><X size={18} /></button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
