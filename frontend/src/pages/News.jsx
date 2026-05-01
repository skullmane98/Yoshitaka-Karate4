import { useEffect, useState } from "react";
import PublicLayout from "@/components/PublicLayout";
import RichContent from "@/components/RichContent";
import api from "@/lib/api";

export default function News() {
  const [page, setPage] = useState(null);
  useEffect(() => { api.get("/cms/pages/news").then((r) => setPage(r.data)).catch(() => {}); }, []);
  const posts = page?.content?.posts || [];

  return (
    <PublicLayout>
      <section className="max-w-5xl mx-auto px-6 lg:px-10 py-20 md:py-28" data-testid="news-page">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-ink-soft)] mb-4">News & Events</div>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[0.95] mb-16">From the dojo.</h1>
        <div className="space-y-0 border-t border-[var(--dojo-border)]">
          {posts.map((p, i) => (
            <article key={i} className="py-10 border-b border-[var(--dojo-border)] grid md:grid-cols-[180px_1fr] gap-6">
              <div className="font-mono-accent text-xs tracking-widest text-[var(--dojo-ink-soft)] pt-2">
                {new Date(p.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <div>
                <h2 className="font-serif text-3xl md:text-4xl mb-3 tracking-tight">{p.title}</h2>
                {/^\s*</.test(p.body || "") ? (
                  <RichContent html={p.body} className="text-[var(--dojo-ink-soft)] [&_p]:leading-relaxed" />
                ) : (
                  <p className="text-[var(--dojo-ink-soft)] leading-relaxed">{p.body}</p>
                )}
              </div>
            </article>
          ))}
          {posts.length === 0 && <div className="py-10 text-[var(--dojo-ink-soft)]">No news yet.</div>}
        </div>
      </section>
    </PublicLayout>
  );
}
