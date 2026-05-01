import { useEffect, useState } from "react";
import PublicLayout from "@/components/PublicLayout";
import api from "@/lib/api";

export default function Programs() {
  const [page, setPage] = useState(null);
  useEffect(() => { api.get("/cms/pages/programs").then((r) => setPage(r.data)).catch(() => {}); }, []);
  const programs = page?.content?.programs || [];

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-6 lg:px-10 py-20 md:py-28" data-testid="programs-page">
        <div className="text-[10px] uppercase tracking-[0.32em] text-[#4A4A4A] mb-4">Programs</div>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[0.95] mb-16 max-w-3xl">
          A curriculum shaped by patience.
        </h1>
        <div className="grid md:grid-cols-2 gap-0 border border-[#DCD9CF]">
          {programs.map((p, i) => (
            <div
              key={i}
              className={`p-10 ${i % 2 === 0 ? "md:border-r border-[#DCD9CF]" : ""} ${i >= 2 ? "border-t border-[#DCD9CF]" : ""} ${i > 0 && i % 2 === 1 ? "border-t md:border-t-0" : ""}`}
            >
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#1A7A3D] mb-3">Program · 0{i + 1}</div>
              <h3 className="font-serif text-3xl md:text-4xl mb-4 tracking-tight">{p.name}</h3>
              <p className="text-[#4A4A4A] leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
