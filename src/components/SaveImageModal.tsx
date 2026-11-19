import { useEffect } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

/**
 * Last-resort save: shows the image large with three tappable ways to get it onto the phone,
 * plus the phone's own "press and hold to save" menu on the image itself.
 */
export function SaveImageModal({
  url,
  onClose,
  blob,
  filename,
}: {
  url: string | null;
  onClose: () => void;
  blob?: Blob | null;
  filename?: string;
}) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);
  if (!url) return null;

  const name = filename || "stencil.png";
  const file = blob ? new File([blob], name, { type: blob.type || "image/png" }) : null;
  const canShare =
    !!file && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      toast.error(e instanceof Error && e.message ? `Could not share: ${e.message}` : "Could not open the share sheet.");
    }
  }

  const button = "rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white text-center";
  return (
    <div role="dialog" aria-modal="true" aria-label="Save your stencil" className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 gap-3">
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white">
        <X size={20} />
      </button>
      <img src={url} alt="Your stencil" className="max-h-[65vh] max-w-full object-contain bg-white rounded-lg" />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {canShare ? (
          <button type="button" onClick={share} className={button}>
            Share / Save to Photos
          </button>
        ) : null}
        <a href={url} download={name} className={button}>
          Download
        </a>
        <a href={url} target="_blank" rel="noopener noreferrer" className={button}>
          Open image
        </a>
      </div>
      <p className="text-white/70 text-xs text-center">Or press and hold the image to save</p>
    </div>
  );
}
