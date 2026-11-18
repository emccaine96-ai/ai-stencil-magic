import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CONSENT_VERSION, COST_PER_GENERATION } from "@/lib/ai-server/ai-config";

/**
 * Asks the user to agree to AI processing before the first cloud generation. Shown by useCloudGenerate.
 * Only display constants are imported from ai-config (plain numbers, no secrets).
 */
export function ConsentDialog({
  open,
  busy,
  onAgree,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  onAgree: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send your photo for AI processing?</DialogTitle>
          <DialogDescription>
            To make a stencil with cloud AI, your photo and style settings are sent to OpenRouter and to Google (the Gemini image model)
            for processing. Each cloud generation uses {COST_PER_GENERATION} credit.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Using your own API key instead? That path is unchanged and never needs this. Read the{" "}
          <Link to="/privacy" className="underline" target="_blank" rel="noreferrer">
            privacy notice
          </Link>{" "}
          (consent version {CONSENT_VERSION}).
        </p>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-md border border-border text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAgree}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Saving..." : "Agree and continue"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
