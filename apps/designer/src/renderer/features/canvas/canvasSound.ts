/**
 * `DELTA-RUN-NEXT-VERSION-01-G` — make the CANVAS page's sound output run, from inside the click (or
 * key press) that starts the timeline's playback.
 *
 * Chrome starts a page's audio output suspended until the user acts. The canvas page is a
 * same-origin `srcDoc` frame, so the call goes straight into it, synchronously, while the gesture
 * is still the one being handled; the page then plays each sound at its place as the playhead
 * reaches it (`runtime.auditionSounds`). A page that is mid-rebuild has nothing to resume yet: the
 * next scrub message plays the sounds once it is up.
 */
export function resumeCanvasSound(): void {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="cgpreview"]');
  const page = frame?.contentWindow as (Window & { cgResumeSound?: () => void }) | null | undefined;
  try {
    page?.cgResumeSound?.();
  } catch {
    /* the page is being rebuilt — nothing to resume yet */
  }
}
