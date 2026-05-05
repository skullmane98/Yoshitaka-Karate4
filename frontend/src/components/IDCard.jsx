import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Loader2, Download } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const DEFAULTS = {
  dojo_name: "Yoshitaka Karate-Do",
  certificate_title: "Member Certificate",
  kanji_top: "空手道",
  kanji_bottom: "義孝",
  issued_text: "Issued · Yoshitaka Dojo",
  scan_text: "Scan to verify",
  footer_label: "Member No.",
  rank_label: "Rank",
  role_label: "Role",
  name_label: "Member",
  accent_color: "#D7263D",
  logo_url: "",
  background_url: "",
};

/**
 * Certificate-style ID card with QR + Barcode + Logo. Includes PDF export.
 * Reads design from the `idcard` CMS page so super_admin / admin can customize.
 */
export default function IDCard({ user }) {
  const [data, setData] = useState(null);
  const [design, setDesign] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [qr, idcardPage] = await Promise.allSettled([
          api.get(`/users/${user.id}/qrcode`),
          api.get(`/cms/pages/idcard`),
        ]);
        if (!active) return;
        if (qr.status === "fulfilled") setData(qr.value.data);
        if (idcardPage.status === "fulfilled") {
          setDesign({ ...DEFAULTS, ...(idcardPage.value.data?.content || {}) });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id]);

  const exportPDF = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: "#FFFFFF",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [120, 85] });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      let imgW = pdfW - 6;
      let imgH = imgW / ratio;
      if (imgH > pdfH - 6) {
        imgH = pdfH - 6;
        imgW = imgH * ratio;
      }
      const x = (pdfW - imgW) / 2;
      const y = (pdfH - imgH) / 2;
      pdf.addImage(imgData, "PNG", x, y, imgW, imgH);
      pdf.save(`yoshitaka-id-${user.member_number}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  if (!user) return null;

  const logoSrc = design.logo_url || LOGO_URL;
  const bgStyle = design.background_url
    ? {
        backgroundImage: `url(${design.background_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  return (
    <div className="space-y-4">
      <div ref={cardRef} className="id-card p-8 md:p-10 relative" data-testid="id-card">
        {/* Optional background watermark */}
        {design.background_url && (
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={bgStyle}
            aria-hidden
          />
        )}
        <div className="relative">
          <div className="flex items-start justify-between mb-6 gap-4">
            <div className="flex items-center gap-4">
              <img src={logoSrc} alt="" className="h-16 w-16 object-contain" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)] mb-1">
                  {design.dojo_name}
                </div>
                <div className="font-serif text-3xl md:text-4xl font-medium tracking-tight leading-none">
                  {design.certificate_title}
                </div>
              </div>
            </div>
            <span
              className="font-kanji text-4xl leading-none"
              style={{ color: design.accent_color }}
            >
              {design.kanji_top}
            </span>
          </div>

          <div className="brush-divider mb-6" />

          <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.name_label}</div>
                <div className="font-serif text-2xl font-medium" data-testid="idcard-name">{user.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.role_label}</div>
                  <div className="text-sm font-medium capitalize">{user.role.replace("_", " ")}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.rank_label}</div>
                  <div className="text-sm font-medium">{user.belt_rank || "—"}</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">{design.footer_label}</div>
                <div className="font-mono-accent text-base tracking-widest" data-testid="idcard-member-number">
                  {user.member_number}
                </div>
              </div>
              {data?.barcode_png && (
                <div className="pt-2">
                  <img
                    src={data.barcode_png}
                    alt="Member barcode"
                    className="h-14 w-auto"
                    data-testid="idcard-barcode"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-[var(--dojo-input-bg)] border border-[var(--dojo-border)]">
                {loading || !data ? (
                  <div className="w-36 h-36 flex items-center justify-center">
                    <Loader2 className="animate-spin text-[var(--dojo-ink-soft)]" />
                  </div>
                ) : (
                  <img src={data.qr_png} alt="QR code" className="w-36 h-36" data-testid="idcard-qr" />
                )}
              </div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--dojo-ink-soft)]">
                {design.scan_text}
              </div>
            </div>
          </div>

          <div className="brush-divider my-6" />
          <div className="flex justify-between items-end text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">
            <span>{design.issued_text}</span>
            <span className="font-kanji text-sm" style={{ color: design.accent_color }}>
              {design.kanji_bottom}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={exportPDF}
        disabled={exporting || loading}
        className="btn-outline w-full flex items-center justify-center gap-2"
        data-testid="idcard-pdf-btn"
      >
        <Download size={14} />
        {exporting ? "Generating PDF…" : "Download as PDF"}
      </button>
    </div>
  );
}
