/**
 * Touch-Up Studio — Tattoo Mode session helper. Graceful fallback
 * everywhere: a missing Fullscreen or Wake Lock API must never break this,
 * it should just continue windowed / without a wake lock, silently.
 */
export async function enterTattooMode(el: HTMLElement): Promise<() => void> {
  try {
    await el.requestFullscreen?.();
  } catch {
    /* continue windowed, no error shown */
  }
  let wakeLock: { release?: () => Promise<void> } | null = null;
  try {
    wakeLock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<any> } }).wakeLock?.request("screen");
  } catch {
    /* no wake lock, continue normally */
  }
  return () => {
    wakeLock?.release?.();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}
