import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveImageToDevice } from "@/lib/save-file";
import { SaveImageModal } from "@/components/SaveImageModal";

/** Saves an image and reports honestly. Returns the function to call and a modal element to render once in the screen. */
export function useSaveImage(): { saveImage: (blob: Blob, filename: string) => Promise<void>; modal: ReactNode } {
  const [url, setUrl] = useState<string | null>(null);
  const saveImage = useCallback(async (blob: Blob, filename: string) => {
    const how = await saveImageToDevice(blob, filename);
    if (how === "shared") toast.success("Shared. If you chose Save Image, it is in your Photos.");
    else if (how === "downloaded") toast.success(`Download started: ${filename}. Check your Downloads folder.`);
    else if (how === "manual") setUrl(URL.createObjectURL(blob));
  }, []);
  const close = useCallback(() => {
    setUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
  }, []);
  return { saveImage, modal: <SaveImageModal url={url} onClose={close} /> };
}
