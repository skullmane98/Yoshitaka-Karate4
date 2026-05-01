import { useEffect, useState } from "react";
import PublicLayout from "@/components/PublicLayout";
import RichContent from "@/components/RichContent";
import api from "@/lib/api";

const IMG = "https://images.unsplash.com/photo-1514134584095-ddbbb1e87164?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHw0fHxrYXJhdGUlMjBzZW5zZWklMjBpbnN0cnVjdG9yJTIwcG9ydHJhaXR8ZW58MHx8fHwxNzc3NjExMzkxfDA&ixlib=rb-4.1.0&q=85";

export default function About() {
  const [page, setPage] = useState(null);
  useEffect(() => { api.get("/cms/pages/about").then((r) => setPage(r.data)).catch(() => {}); }, []);
  const c = page?.content || {};

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-28" data-testid="about-page">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[var(--dojo-ink-soft)] mb-4">About the Sensei</div>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[0.95] mb-12">{c.sensei_name || "Sensei Yoshitaka"}</h1>
        <div className="grid md:grid-cols-12 gap-10">
          <div className="md:col-span-5">
            <img src={IMG} alt="Sensei portrait" className="w-full aspect-[3/4] object-cover" />
            <div className="mt-4 flex justify-between items-center text-xs uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">
              <span>{c.rank || "7th Dan, Shotokan"}</span>
              <span className="font-kanji text-base text-[var(--dojo-green)]">義孝</span>
            </div>
          </div>
          <div className="md:col-span-7">
            {/^\s*</.test(c.sensei_bio || "") ? (
              <RichContent html={c.sensei_bio} className="text-lg md:text-xl text-[var(--dojo-ink)] mb-8 [&_p]:font-light [&_p]:mb-4" />
            ) : (
              <p className="text-lg md:text-xl leading-relaxed text-[var(--dojo-ink)] mb-8 font-light">
                {c.sensei_bio || ""}
              </p>
            )}
            <div className="brush-divider my-8" />
            <blockquote className="font-serif text-2xl md:text-3xl italic leading-snug text-[var(--dojo-ink)] max-w-2xl">
              “{c.philosophy || "Karate begins and ends with respect."}”
            </blockquote>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
