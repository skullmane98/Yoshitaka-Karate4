import { useEffect, useRef, useState } from "react";
import { Camera, Upload, RefreshCw, Check, X } from "lucide-react";

/**
 * Photo capture + crop modal used by Add User and User Drawer.
 *
 *   1. Source step  — admin picks Camera (live webcam) OR Upload (file picker).
 *   2. Crop step    — admin pans/zooms inside a fixed 4:5 portrait frame that
 *                     matches the ID-card photo placeholder. A `photo_size`
 *                     slider tunes how big the final image sits on the card,
 *                     with a live mini-preview to the right.
 *
 * On confirm we hand back `{ dataUrl, photoSize }` where:
 *   • dataUrl   — 480×600 JPEG (~4:5) of the cropped region
 *   • photoSize — 0.25–3.0 multiplier; the caller writes it to
 *                 `idcard_overrides.photo_size`
 */

// Crop frame size on screen, and output image dims. Aspect 4:5 matches
// both the DOM placeholder (110×138) and the PDF placeholder (13×17 mm).
const FRAME_W = 320;
const FRAME_H = 400;
const OUT_W = 480;
const OUT_H = 600;

export default function PhotoCaptureModal({ onClose, onConfirm, initialPhotoSize = 1 }) {
  const [step, setStep] = useState("source"); // 'source' | 'crop'
  const [mode, setMode] = useState("camera"); // 'camera' | 'upload'
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [sourceImg, setSourceImg] = useState(null); // HTMLImageElement
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [photoSize, setPhotoSize] = useState(initialPhotoSize || 1);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const dragRef = useRef(null);

  // Open the webcam stream when the user picks the Camera tab.
  useEffect(() => {
    if (step !== "source" || mode !== "camera") return;
    let cancelled = false;
    setCameraError("");
    setCameraReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setCameraReady(true);
        }
      } catch (e) {
        setCameraError(e?.message || "Could not access camera. Use Upload instead.");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  // Snapshot current video frame -> Image -> crop step.
  const takeSnapshot = () => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    // Mirror the snapshot horizontally so it matches what the user sees in the
    // preview (the preview is mirrored to feel like a mirror).
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    loadCrop(c.toDataURL("image/jpeg", 0.92));
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { alert("Please pick an image file."); return; }
    if (f.size > 8 * 1024 * 1024) { alert("Image must be under 8 MB"); return; }
    const r = new FileReader();
    r.onload = () => loadCrop(r.result);
    r.readAsDataURL(f);
  };

  const loadCrop = (dataUrl) => {
    const img = new Image();
    img.onload = () => {
      setSourceImg(img);
      // Auto-fit: scale so the shorter side covers the frame.
      const scaleW = FRAME_W / img.width;
      const scaleH = FRAME_H / img.height;
      setZoom(Math.max(scaleW, scaleH));
      setOffset({ x: 0, y: 0 });
      stopCamera();
      setStep("crop");
    };
    img.src = dataUrl;
  };

  // Drag-to-pan handlers on the crop frame.
  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  // Render the cropped region to an OUT_W × OUT_H canvas and emit a JPEG.
  const confirm = () => {
    if (!sourceImg) return;
    setBusy(true);
    const c = document.createElement("canvas");
    c.width = OUT_W;
    c.height = OUT_H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    // Frame is centred; image is drawn at (centreX + offset.x − w/2, centreY + offset.y − h/2).
    const drawW = sourceImg.width * zoom;
    const drawH = sourceImg.height * zoom;
    const frameLeft = (FRAME_W - drawW) / 2 + offset.x;
    const frameTop = (FRAME_H - drawH) / 2 + offset.y;
    // Scale the frame-space coords to output-space.
    const sx = OUT_W / FRAME_W;
    const sy = OUT_H / FRAME_H;
    ctx.drawImage(
      sourceImg,
      Math.round(frameLeft * sx),
      Math.round(frameTop * sy),
      Math.round(drawW * sx),
      Math.round(drawH * sy),
    );
    const dataUrl = c.toDataURL("image/jpeg", 0.88);
    onConfirm?.(dataUrl, photoSize);
    setBusy(false);
  };

  // Mini preview frame matching the ID-card DOM placeholder (110×138).
  const previewW = Math.round(110 * photoSize);
  const previewH = Math.round(138 * photoSize);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="photo-capture-modal">
      <div className="bg-[var(--dojo-paper)] border border-[var(--dojo-border)] w-full max-w-3xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--dojo-border)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)]">Member</div>
            <h2 className="font-serif text-xl">Take or Upload Photo</h2>
          </div>
          <button onClick={() => { stopCamera(); onClose?.(); }} className="p-2 hover:text-[var(--dojo-hinomaru)]" data-testid="photo-capture-close"><X size={18} /></button>
        </div>

        {step === "source" && (
          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="flex gap-2 border-b border-[var(--dojo-border)]">
              {[
                ["camera", "Camera", Camera],
                ["upload", "Upload", Upload],
              ].map(([k, l, Icon]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`px-4 py-2 text-[11px] uppercase tracking-[0.2em] border-b-2 flex items-center gap-2 ${mode === k ? "border-[var(--dojo-green)] text-[var(--dojo-ink)]" : "border-transparent text-[var(--dojo-ink-soft)] hover:text-[var(--dojo-ink)]"}`}
                  data-testid={`photo-source-${k}`}
                >
                  <Icon size={13} /> {l}
                </button>
              ))}
            </div>

            {mode === "camera" ? (
              <div className="space-y-3">
                <div className="relative bg-black aspect-[4/3] w-full overflow-hidden flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                    data-testid="photo-capture-video"
                  />
                  {!cameraReady && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">Starting camera…</div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm px-6 text-center">{cameraError}</div>
                  )}
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    disabled={!cameraReady}
                    className="btn-primary flex items-center gap-2"
                    data-testid="photo-capture-snap"
                  ><Camera size={14} /> Capture</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block border-2 border-dashed border-[var(--dojo-border)] p-10 text-center cursor-pointer hover:border-[var(--dojo-ink)]" data-testid="photo-capture-upload">
                  <Upload size={22} className="mx-auto mb-3 text-[var(--dojo-ink-soft)]" />
                  <div className="text-sm">Click to pick an image (JPG / PNG, up to 8 MB)</div>
                  <input type="file" accept="image/*" className="hidden" onChange={onFile} />
                </label>
              </div>
            )}
          </div>
        )}

        {step === "crop" && sourceImg && (
          <div className="p-6 grid md:grid-cols-[auto_1fr] gap-6 overflow-y-auto">
            <div className="space-y-3">
              <div
                className="relative bg-black/80 overflow-hidden select-none cursor-grab active:cursor-grabbing"
                style={{ width: FRAME_W, height: FRAME_H, touchAction: "none" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                data-testid="photo-crop-frame"
              >
                <img
                  src={sourceImg.src}
                  alt="Source"
                  draggable={false}
                  style={{
                    position: "absolute",
                    width: sourceImg.width * zoom,
                    height: sourceImg.height * zoom,
                    left: (FRAME_W - sourceImg.width * zoom) / 2 + offset.x,
                    top: (FRAME_H - sourceImg.height * zoom) / 2 + offset.y,
                    maxWidth: "none",
                  }}
                />
                {/* Centre crosshair so admins know the frame is the final crop. */}
                <div className="absolute inset-0 pointer-events-none border-2 border-white/30" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-1">Zoom</div>
                <input
                  type="range" min="0.25" max="3" step="0.05" value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-[var(--dojo-green)]"
                  data-testid="photo-crop-zoom"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-2">ID-card size preview</div>
                <div className="border border-[var(--dojo-border)] bg-[var(--dojo-paper-deep)]/50 p-4 flex items-center gap-4">
                  <div
                    className="border border-[var(--dojo-border)] bg-white overflow-hidden shrink-0"
                    style={{ width: previewW, height: previewH }}
                    data-testid="photo-card-preview"
                  >
                    <PreviewBox sourceImg={sourceImg} zoom={zoom} offset={offset} />
                  </div>
                  <div className="text-[11px] text-[var(--dojo-ink-soft)] space-y-1">
                    <div className="font-mono-accent text-[var(--dojo-ink)]">{Math.round(photoSize * 100)}%</div>
                    <div>How the photo will sit next to the QR on the ID card.</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--dojo-ink-soft)] mb-2">Photo size on card</div>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="25" max="300" step="5"
                    value={Math.round(photoSize * 100)}
                    onChange={(e) => setPhotoSize(Number(e.target.value) / 100)}
                    className="flex-1 accent-[var(--dojo-green)]"
                    data-testid="photo-card-size-slider"
                  />
                  <span className="font-mono-accent text-[11px] w-12 text-right">{Math.round(photoSize * 100)}%</span>
                </div>
                <div className="text-[10px] text-[var(--dojo-ink-soft)] mt-1">Sets <code>idcard_overrides.photo_size</code>. 100% matches the template default.</div>
              </div>

              <div className="text-[11px] text-[var(--dojo-ink-soft)] leading-snug">
                Drag to position, zoom to fit. The crop frame matches the ID-card photo placeholder.
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-[var(--dojo-border)] flex justify-end gap-3 shrink-0">
          {step === "crop" && (
            <button type="button" onClick={() => { setSourceImg(null); setStep("source"); }} className="btn-outline flex items-center gap-2" data-testid="photo-capture-retake">
              <RefreshCw size={13} /> Retake
            </button>
          )}
          <button type="button" onClick={() => { stopCamera(); onClose?.(); }} className="btn-outline">Cancel</button>
          {step === "crop" && (
            <button type="button" onClick={confirm} disabled={busy} className="btn-primary flex items-center gap-2" data-testid="photo-capture-confirm">
              <Check size={14} /> Use this photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Small mirror of the crop frame, scaled to the card-photo box.
function PreviewBox({ sourceImg, zoom, offset }) {
  const scale = 0.6; // shrink frame contents to fit the card-photo placeholder
  return (
    <div className="relative w-full h-full overflow-hidden">
      <img
        src={sourceImg.src}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          width: sourceImg.width * zoom * scale,
          height: sourceImg.height * zoom * scale,
          left: ((FRAME_W - sourceImg.width * zoom) / 2 + offset.x) * scale,
          top: ((FRAME_H - sourceImg.height * zoom) / 2 + offset.y) * scale,
          maxWidth: "none",
        }}
      />
    </div>
  );
}
