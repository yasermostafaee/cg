import logo from '../../../brand/apasai-logo.svg?raw';

/**
 * 🔴 `R-082` (`CONSOLE-POLISH-01` §7) — **THE APASAI MARK, AS THE SPLASH SHOWS IT**, for the sign-in
 * surfaces, so start, splash and sign-in read as one product.
 *
 * The artwork is `brand/apasai-logo.svg` ITSELF, inlined as text — never a copy of its path data (a
 * second copy of a brand mark is a second thing to keep in step), and never an `<img>`, which could
 * not be relit: its bars are near-black and its swoosh mid-grey, both of which vanish on the dark
 * ground. `controls.css` relights the bars and the swoosh on the file's own class hooks, from the
 * `--r-splash-logo-*` tokens the splash mirrors; THE ARC IS NOT TOUCHED (APASAI's brand blue is not
 * ours to alter — the splash's rule). The file's `fill` attributes lose to those rules, as any SVG
 * presentation attribute loses to a stylesheet.
 *
 * `aria-hidden`: the product name follows it as text.
 */
export function ApasaiMark(): JSX.Element {
  return (
    <span
      className="cg-apasai-mark"
      aria-hidden="true"
      data-apasai-mark=""
      // Our own artwork, from this repository, at build time — not data from anywhere else.
      dangerouslySetInnerHTML={{ __html: logo }}
    />
  );
}
