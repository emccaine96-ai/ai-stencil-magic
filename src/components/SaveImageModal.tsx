import { useEffect } from "react";
import { X } from "lucide-react";

/** Last-resort save: shows the image large so the phone's own "press and hold to save" menu can be used. */
export function SaveImageModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);
  if (!url) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Save your stencil" className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 gap-3">
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white">
        <X size={20} />
      </button>
      <p className="text-white text-sm font-semibold text-center">Press and hold the image to save</p>
      <img src={url} alt="Your stencil" className="max-h-[80vh] max-w-full object-contain bg-white rounded-lg" />
    </div>
  );
}
