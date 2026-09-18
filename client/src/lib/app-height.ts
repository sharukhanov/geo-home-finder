/**
 * Publishes the *actually visible* height of the page as `--app-h`.
 *
 * `100dvh` is supposed to do this, but on iOS Safari it lags behind the
 * toolbars: the bottom of a full-height layout can end up hidden underneath
 * them, which is how the sheet's footer button went missing on phones.
 * `visualViewport.height` is what the user can really see, so we lay out
 * against that instead and keep `dvh` only as a fallback.
 */
export function trackAppHeight() {
  const vv = window.visualViewport;

  const apply = () => {
    const h = vv?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  };

  apply();
  vv?.addEventListener("resize", apply);
  vv?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", () => {
    // The new size isn't readable until after the rotation settles.
    setTimeout(apply, 250);
  });
}
