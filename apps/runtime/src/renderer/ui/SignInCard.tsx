import type { ReactNode, Ref } from 'react';
import { APP_BUILD, APP_VERSION } from '../appVersion.js';
import { ApasaiMark } from './ApasaiMark.js';

/**
 * 🔴 `R-082` (`CONSOLE-POLISH-01` §7) — **ONE SIGN-IN LOOK.** The Playout sign-in, first-run and CG
 * Control's first question are each one centred card on the splash's dark ground, headed by the
 * APASAI mark and the product name and signed at the foot with this build's version — so start,
 * splash and sign-in look like one product. (CG Bridge's sign-in is a `Modal` over the working
 * console, by the modal contract; it carries {@link SignInBrand} and {@link AppVersionLine}.)
 *
 * The splash's visual language — its ground, its wordmark (`CG` heavy, the role light, letter-spaced)
 * and its mark — is `apps/runtime/index.html` and the `--r-splash-*` tokens; `@cg/splash-kit` holds
 * the splash's TIMING only. The card takes the look from those tokens, never from a literal.
 *
 * ── THE GROUND IS THE GATES' ONE SCRIM ────────────────────────────────────────────────────
 *
 * The sign-in gate and first-run are the two full-window gates the modal census allows
 * (`modalMessageRegion.dom.test.ts`): a gate with a way out is not a gate. Their scrim is declared
 * ONCE, here, as `.cg-signin-ground` in `controls.css`; CG Control's first question is a PAGE (it
 * renders instead of the app, there is nothing behind it to cover) and takes the same ground in the
 * page's own flow.
 *
 * No explanatory prose: the mark, the name, a title, labelled fields, one error line, one action,
 * the version.
 */
export type SignInGround = 'gate' | 'first-run' | 'page';

export interface SignInCardProps {
  /** The dialog's accessible name. */
  label: string;
  /** Which ground: the sign-in gate (above the lock), first-run (above that), or a page. */
  ground: SignInGround;
  /** The card's heading under the brand, when it has one. */
  title?: string | undefined;
  /** First-run's card is wider: it holds the check and the channel list. */
  wide?: boolean | undefined;
  /** The action row, under the body. */
  footer?: ReactNode;
  children: ReactNode;
  cardRef?: Ref<HTMLDivElement> | undefined;
  /** The card's finders (`data-*`), on the dialog element. */
  data?: Readonly<Record<`data-${string}`, string>> | undefined;
  /** The ground's finders (`data-*`). */
  groundData?: Readonly<Record<`data-${string}`, string>> | undefined;
}

export function SignInCard({
  label,
  ground,
  title,
  wide,
  footer,
  children,
  cardRef,
  data,
  groundData,
}: SignInCardProps): JSX.Element {
  return (
    <div {...(groundData ?? {})} className={`cg-signin-ground cg-signin-ground--${ground}`}>
      <div
        {...(data ?? {})}
        ref={cardRef}
        className={wide === true ? 'cg-signin-card cg-signin-card--wide' : 'cg-signin-card'}
        role="dialog"
        aria-label={label}
        aria-modal="true"
      >
        <div className="cg-signin-card__body">
          <SignInBrand />
          {title !== undefined && <h2 className="cg-signin-card__title">{title}</h2>}
          {children}
        </div>
        {footer !== undefined && <div className="cg-signin-card__foot">{footer}</div>}
        <AppVersionLine />
      </div>
    </div>
  );
}

/** The mark and the product name, as the splash composes them. */
export function SignInBrand(): JSX.Element {
  return (
    <div className="cg-signin-brand" data-signin-brand="">
      <ApasaiMark />
      {/* CG is the platform, Control the role this app plays in it — the splash's weight split. */}
      <span className="cg-signin-brand__product">
        <b>CG</b> Control
      </span>
    </div>
  );
}

/** This build's version, in small type — the exact build on its `title`. */
export function AppVersionLine(): JSX.Element {
  return (
    <div className="cg-signin-version" title={APP_BUILD} data-app-version="">
      Version {APP_VERSION}
    </div>
  );
}
