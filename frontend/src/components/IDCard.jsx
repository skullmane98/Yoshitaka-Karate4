import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Loader2, Download } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Certificate-style ID card with QR + Barcode + Logo. Includes PDF export.
 */
export default function IDCard({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/users/${user.id}/qrcode`);
        if (active) setData(data);
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
      // Standard credit-card style: landscape, ~85.6mm × 54mm scaled up; we'll use a wider card-letter size
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

  return (
    <div className="space-y-4">
      <div ref={cardRef} className="id-card p-8 md:p-10" data-testid="id-card">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="" className="h-16 w-16 object-contain" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--dojo-ink-soft)] mb-1">Yoshitaka Karate-Do</div>
              <div className="font-serif text-3xl md:text-4xl font-medium tracking-tight leading-none">Member Certificate</div>
            </div>
          </div>
          <span className="font-kanji text-4xl text-[var(--dojo-hinomaru)] leading-none">空手道</span>
        </div>

        <div className="brush-divider mb-6" />

        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Member</div>
              <div className="font-serif text-2xl font-medium" data-testid="idcard-name">{user.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Role</div>
                <div className="text-sm font-medium capitalize">{user.role.replace("_", " ")}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Rank</div>
                <div className="text-sm font-medium">{user.belt_rank || "—"}</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Member No.</div>
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
            <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--dojo-ink-soft)]">Scan to verify</div>
          </div>
        </div>

        <div className="brush-divider my-6" />
        <div className="flex justify-between items-end text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">
          <span>Issued · Yoshitaka Dojo</span>
          <span className="font-kanji text-sm text-[var(--dojo-ink)]">義孝</span>
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
