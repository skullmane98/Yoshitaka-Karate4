import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Plus, Trash2, Pencil, Eye, EyeOff } from "lucide-react";
import { useT } from "@/context/LanguageContext";

/** Admin/super_admin tab — list, create, edit, delete blog posts. */
export default function BlogPanel() {
  const { t } = useT();
  const [posts, setPosts] = useState([]);
  const [editing, setEditing] = useState(null); // post or {} for new
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/blog", { params: { include_unpublished: true } });
      setPosts(data || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ title: "", body: "", excerpt: "", cover_image: "", published: true });

  const togglePublish = async (p) => {
    try {
      await api.patch(`/blog/${p.id}`, { published: !p.published });
      load();
    } catch (e) {
      setMsg(formatApiError(e));
    }
  };

  const del = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try {
      await api.delete(`/blog/${p.id}`);
      load();
    } catch (e) {
      setMsg(formatApiError(e));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      if (editing.id) {
        await api.patch(`/blog/${editing.id}`, editing);
      } else {
        await api.post("/blog", editing);
      }
      setEditing(null);
      load();
    } catch (e2) {
      setMsg(formatApiError(e2));
    } finally {
      setBusy(false);
    }
  };

  const onCover = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { alert("Image must be under 1.5 MB"); return; }
    const r = new FileReader();
    r.onload = () => setEditing((s) => ({ ...s, cover_image: r.result }));
    r.readAsDataURL(f);
  };

  return (
    <div data-testid="blog-panel">
      {!editing ? (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{t("blog.editorial")}</div>
              <h2 className="font-serif text-2xl">{t("blog.title")}</h2>
            </div>
            <button onClick={openNew} className="btn-primary flex items-center gap-2" data-testid="blog-new-btn"><Plus size={14} />{t("blog.new_post")}</button>
          </div>
          {posts.length === 0 ? (
            <div className="border border-dashed border-[var(--dojo-border)] p-10 text-center text-sm text-[var(--dojo-ink-soft)]">
              {t("blog.empty_hint")}
            </div>
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id} className="border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-4 flex items-start gap-4" data-testid={`blog-row-${p.slug}`}>
                  {p.cover_image && <img src={p.cover_image} alt="" className="w-20 h-20 object-cover border border-[var(--dojo-border)]" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] uppercase tracking-[0.24em] px-1.5 py-0.5 border ${p.published ? "text-[var(--dojo-green)] border-[var(--dojo-green)]" : "text-[var(--dojo-ink-soft)] border-[var(--dojo-border)]"}`}>
                        {p.published ? t("blog.published") : t("blog.draft")}
                      </span>
                      <span className="text-[10px] text-[var(--dojo-ink-soft)]">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="font-serif text-lg">{p.title}</div>
                    {p.excerpt && <div className="text-xs text-[var(--dojo-ink-soft)] mt-1 line-clamp-2">{p.excerpt}</div>}
                    <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-1">{t("blog.by")} {p.author_name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => togglePublish(p)} className="p-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)]" title={p.published ? t("blog.unpublish") : t("blog.publish")}>
                      {p.published ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button onClick={() => setEditing(p)} className="p-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-green)]" title={t("btn.edit")} data-testid={`blog-edit-${p.slug}`}><Pencil size={14} /></button>
                    <button onClick={() => del(p)} className="p-2 border border-[var(--dojo-border)] hover:border-[var(--dojo-hinomaru)] hover:text-[var(--dojo-hinomaru)]" title={t("btn.delete")}><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form onSubmit={save} className="max-w-3xl border border-[var(--dojo-border)] bg-[var(--dojo-paper)] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{editing.id ? t("blog.edit") : t("blog.new")}</div>
              <h2 className="font-serif text-2xl">{editing.id ? t("blog.update_post") : t("blog.create_post")}</h2>
            </div>
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]">{t("btn.cancel")}</button>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">{t("blog.col_title")}</label>
            <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required data-testid="blog-title-input" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">{t("blog.cover_image")}</label>
            <div className="flex items-center gap-3">
              {editing.cover_image && <img src={editing.cover_image} alt="" className="h-16 w-24 object-cover border border-[var(--dojo-border)]" />}
              <input type="file" accept="image/*" onChange={onCover} className="text-sm" data-testid="blog-cover-input" />
              {editing.cover_image && <button type="button" onClick={() => setEditing({ ...editing, cover_image: "" })} className="text-xs text-[var(--dojo-hinomaru)] underline">{t("btn.remove")}</button>}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">{t("blog.excerpt")}</label>
            <textarea className="input min-h-[60px]" value={editing.excerpt || ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} maxLength={300} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] block mb-2">{t("blog.body")}</label>
            <textarea className="input min-h-[260px]" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} required data-testid="blog-body-input" />
            <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-1">{t("blog.markdown_hint")}</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />
            {t("blog.published_visible")}
          </label>
          {msg && <div className="text-[var(--dojo-hinomaru)] text-sm">{msg}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="btn-outline">{t("btn.cancel")}</button>
            <button type="submit" disabled={busy} className="btn-primary" data-testid="blog-save-btn">{busy ? t("btn.saving") : t("btn.save")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
