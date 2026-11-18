import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateStencil } from "@/lib/generation.functions";
import { recordAiConsent } from "@/lib/credits.functions";
import { ConsentDialog } from "@/components/ConsentDialog";
import { RequestIdKeeper, dataUrlToImage, interpretResult, FALLBACK_MESSAGE, type ServerResult } from "@/lib/cloud-generate-logic";

export type CloudStyle = "hatching" | "solid" | "dotwork" | "hybrid";

export interface CloudGenerateArgs {
  photo: string; // data URL of the source photo
  style: CloudStyle;
  intensity: number;
  customPrompt?: string;
}

/**
 * Server-key generation with credits, used by create.tsx only when the user has no OpenRouter key of their own.
 * Resolves with a stencil data URL, or null when nothing was produced (the reason has already been shown to the user).
 * Render `dialog` once in the page.
 */
export function useCloudGenerate() {
  const navigate = useNavigate();
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const ids = useRef(new RequestIdKeeper());
  const pendingConsent = useRef<((agreed: boolean) => void) | null>(null);

  const askConsent = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pendingConsent.current = resolve;
        setConsentOpen(true);
      }),
    [],
  );

  const settleConsent = (agreed: boolean) => {
    const r = pendingConsent.current;
    pendingConsent.current = null;
    setConsentOpen(false);
    setConsentBusy(false);
    r?.(agreed);
  };

  const onAgree = async () => {
    setConsentBusy(true);
    try {
      const res = await recordAiConsent();
      if (!res.ok) {
        toast.error(res.error);
        settleConsent(false);
        return;
      }
      settleConsent(true);
    } catch (e) {
      console.error("[cloud-generate] consent failed", e);
      toast.error("Could not save your consent. Please try again.");
      settleConsent(false);
    }
  };

  /** One server call. Returns the interpreted outcome; never throws. */
  const callServer = useCallback(async (args: CloudGenerateArgs, image: { mimeType: string; data: string }) => {
    const requestId = ids.current.acquire();
    try {
      const result = (await generateStencil({
        data: { style: args.style, intensity: args.intensity, customNote: args.customPrompt?.trim() || undefined, images: [image], requestId },
      })) as ServerResult;
      return interpretResult(result);
    } catch (e) {
      console.error("[cloud-generate] server call failed", e);
      return { kind: "error" as const, message: FALLBACK_MESSAGE };
    } finally {
      // Every ended attempt (success, refund, failure) gets a fresh id next time. Only an in-flight double tap reuses it.
      ids.current.release();
    }
  }, []);

  const cloudGenerate = useCallback(
    async (args: CloudGenerateArgs): Promise<string | null> => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.info("Sign in to use cloud AI, or add your own OpenRouter key in Settings.");
        navigate({ to: "/auth", search: { next: "/create" } });
        return null;
      }
      const image = dataUrlToImage(args.photo);
      if (!image) {
        toast.error("This photo format is not supported for cloud AI. Use a PNG, JPEG or WebP photo.");
        return null;
      }

      let outcome = await callServer(args, image);
      if (outcome.kind === "needs_consent") {
        const agreed = await askConsent();
        if (!agreed) return null;
        outcome = await callServer(args, image);
      }
      if (outcome.kind === "image") return outcome.dataUrl;
      if (outcome.kind === "needs_consent") {
        toast.error("Please agree to AI processing to continue.");
        return null;
      }
      toast.error(outcome.message);
      return null;
    },
    [askConsent, callServer, navigate],
  );

  const dialog = <ConsentDialog open={consentOpen} busy={consentBusy} onAgree={onAgree} onCancel={() => settleConsent(false)} />;

  return { cloudGenerate, dialog };
}
