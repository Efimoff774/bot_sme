"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PreviewableImageProps = {
  src: string;
  alt: string;
  gallery: Array<{ src: string; alt: string }>;
  initialIndex: number;
  className?: string;
};

export default function PreviewableImage({
  src,
  alt,
  gallery,
  initialIndex,
  className,
}: PreviewableImageProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [lowResMatte, setLowResMatte] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateLowResMatte = useCallback(() => {
    const btn = triggerRef.current;
    const img = btn?.querySelector("img");
    if (!btn || !img || !(img instanceof HTMLImageElement)) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const cw = btn.clientWidth;
    const ch = btn.clientHeight;
    if (cw < 2 || ch < 2) return;
    const scaleToFit = Math.min(cw / nw, ch / nh);
    const scale = Math.min(1, scaleToFit);
    const dispW = nw * scale;
    const dispH = nh * scale;
    setLowResMatte(dispW < cw - 1.5 || dispH < ch - 1.5);
  }, []);

  useLayoutEffect(() => {
    setLowResMatte(false);
  }, [src]);

  useLayoutEffect(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    updateLowResMatte();
    const ro = new ResizeObserver(() => updateLowResMatte());
    ro.observe(btn);
    return () => ro.disconnect();
  }, [src, updateLowResMatte]);

  const canNavigate = gallery.length > 1;
  const current = gallery[activeIndex] ?? { src, alt };

  const goPrev = useCallback(
    () => setActiveIndex((prev) => (prev - 1 + gallery.length) % gallery.length),
    [gallery.length],
  );
  const goNext = useCallback(
    () => setActiveIndex((prev) => (prev + 1) % gallery.length),
    [gallery.length],
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft" && canNavigate) goPrev();
      if (event.key === "ArrowRight" && canNavigate) goNext();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, canNavigate, goPrev, goNext]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`preview-trigger${lowResMatte ? " preview-trigger--lowres-matte" : ""}${className ? ` ${className}` : ""}`}
        onClick={() => {
          setActiveIndex(initialIndex);
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} onLoad={updateLowResMatte} />
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="preview-overlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setOpen(false)}
            >
              <div className="preview-backdrop" aria-hidden />
              <div
                className={`preview-image-stage${canNavigate ? " preview-image-stage--gallery" : ""}`}
              >
                <img src={current.src} alt={current.alt} className="preview-original-image" />
              </div>
              <button
                type="button"
                className="preview-close"
                aria-label="Закрыть превью"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
              {canNavigate ? (
                <>
                  <button
                    type="button"
                    className="preview-nav prev"
                    onClick={(e) => {
                      e.stopPropagation();
                      goPrev();
                    }}
                    aria-label="Предыдущее фото"
                  >
                    <svg className="preview-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M14 6L8 12l6 6"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="preview-nav next"
                    onClick={(e) => {
                      e.stopPropagation();
                      goNext();
                    }}
                    aria-label="Следующее фото"
                  >
                    <svg className="preview-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M10 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <div className="preview-footer">
                    <p className="preview-counter">
                      {activeIndex + 1} / {gallery.length}
                    </p>
                    <div className="preview-thumbs" role="tablist" aria-label="Миниатюры фото">
                      {gallery.map((item, idx) => (
                        <button
                          key={`${item.src}-${idx}`}
                          type="button"
                          className={`preview-thumb${idx === activeIndex ? " is-active" : ""}`}
                          role="tab"
                          aria-selected={idx === activeIndex}
                          aria-label={`Открыть фото ${idx + 1}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveIndex(idx);
                          }}
                        >
                          <img src={item.src} alt={item.alt} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
