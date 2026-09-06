import { useState } from 'react';
import {
  MAX_RASTER_DIMENSION,
  rasterVerdict,
  type ChannelSettings,
  type ChannelSettingsState,
} from '@cg/shared-ipc';
import { useChannelSettings } from '../../hooks/useChannelSettings.js';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { channelSettingsReasonMessage } from '../../ui/channelSettingsReasonMessage.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { NumericInput } from '../../ui/NumericInput.js';

/**
 * `R-030` / `STATION-SETUP-02` §5 — **the channel raster's FIRST UI.**
 *
 * `channelSettings.set` has existed on the bridge, guarded and persisted, with ZERO
 * renderer call sites: the raster could be read (the mismatch banner) and never written
 * except by editing `channel-settings.json` by hand. This is the control. It is also the
 * control that would have made `B-116` live on the first press — the file it creates
 * lands beside the templates — which is why `B-116` was closed first, by a rule, in the
 * same change (`template-registry.ts`).
 *
 * ── ONE WRITER, AND IT IS THE BRIDGE ────────────────────────────────────────
 *
 * Every guard is bridge-side — `on-air-block` (changing the raster re-scales every graphic
 * on the channel) and `unknown-channel` — and this surface adds NO second writer and no
 * second guard: it sends what was typed and shows what came back, in the pinned message
 * region. Nothing is pre-disabled on the stack, deliberately: the bridge's refusal is the
 * one truth and it names its own count.
 *
 * ── WHAT THE OPERATOR COMPARES ──────────────────────────────────────────────
 *
 * Configured against OBSERVED, per channel, side by side — the two claims the store keeps
 * apart on purpose (`channel-settings-store.ts`). The verdict comes from the one canonical
 * `rasterVerdict`, never a local `w === w`.
 */

const styles = {
  intro: { fontSize: '0.8rem', color: colors.textMuted, margin: 0 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'auto 5.5rem auto 5.5rem minmax(10rem, 1fr) auto',
    alignItems: 'center',
    columnGap: '0.6rem',
    rowGap: '0.45rem',
  },
  head: {
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
    whiteSpace: 'nowrap' as const,
  },
  channel: { fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' as const },
  times: { color: colors.textMuted },
  observed: { fontSize: '0.78rem', color: colors.text },
  verdict: {
    match: { color: colors.text },
    mismatch: { color: colors.errorText, fontWeight: 700 },
    unreadable: { color: colors.textMuted },
    unconfigured: { color: colors.textMuted },
  },
  empty: { fontSize: '0.82rem', color: colors.textMuted },
} as const;

/** What the server said about this channel, in the operator's words. */
function observedLine(state: ChannelSettingsState, channel: number): string {
  const observed = state.observed.find((o) => o.channel === channel);
  if (observed === undefined) return 'Server mode not read yet.';
  if (observed.raster === null)
    return `Server reports ${observed.mode} — a mode this build cannot map.`;
  return `Server reports ${observed.mode} (${String(observed.raster.width)}×${String(observed.raster.height)}).`;
}

const VERDICT_TEXT = {
  match: 'agrees',
  mismatch: 'MISMATCH — every graphic on this channel is mis-placed',
  unreadable: 'cannot be checked',
  unconfigured: 'not configured',
} as const;

function parseDimension(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_RASTER_DIMENSION ? n : null;
}

export function ChannelRasterSection({
  report,
}: {
  report: (message: ModalMessage | null) => void;
}): JSX.Element {
  const state = useChannelSettings();
  // Drafts keyed by channel: what was TYPED, falling back to what is configured. A draft
  // is dropped once the bridge accepts it, so the row shows the value in force again.
  const [drafts, setDrafts] = useState<Record<string, { width: string; height: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const draftFor = (s: ChannelSettings): { width: string; height: string } =>
    drafts[String(s.channel)] ?? {
      width: String(s.raster.width),
      height: String(s.raster.height),
    };

  const edit = (channel: number, patch: Partial<{ width: string; height: string }>): void => {
    const current = state.settings.find((s) => s.channel === channel);
    if (current === undefined) return;
    setDrafts((prev) => ({ ...prev, [String(channel)]: { ...draftFor(current), ...patch } }));
  };

  const apply = async (s: ChannelSettings): Promise<void> => {
    const draft = draftFor(s);
    const width = parseDimension(draft.width);
    const height = parseDimension(draft.height);
    if (width === null || height === null) {
      report({
        role: 'refusal',
        text: `A raster is two whole numbers of pixels, 1 to ${String(MAX_RASTER_DIMENSION)} — e.g. 1920 and 1080.`,
      });
      return;
    }
    setBusy(s.channel);
    try {
      const res = await window.cg.channelSettings.set({
        channel: s.channel,
        raster: { width, height },
      });
      if (!res.ok) {
        report({
          role: 'refusal',
          text: channelSettingsReasonMessage(res.reason) ?? res.message ?? 'Not accepted.',
          ...(res.message !== undefined ? { detail: res.message } : {}),
        });
        return;
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[String(s.channel)];
        return next;
      });
      report({
        role: 'notice',
        text: `Channel ${String(s.channel)} raster set to ${String(width)}×${String(height)}.`,
      });
    } catch (err) {
      report({ role: 'refusal', text: err instanceof Error ? err.message : 'Request failed.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p style={styles.intro}>
        The pixel geometry placement assumes for each channel. It must agree with the channel’s
        video mode in casparcg.config, or every graphic on that channel lands in the wrong place —
        silently, and only on air.
      </p>
      {state.settings.length === 0 ? (
        <span style={styles.empty} role="status">
          No channel is declared yet, so there is no raster to set — the channels come from the
          bridge’s fixed-layers config at start.
        </span>
      ) : (
        <div style={styles.grid} data-raster-table="">
          <span style={styles.head}>Channel</span>
          <span style={styles.head}>Width</span>
          <span />
          <span style={styles.head}>Height</span>
          <span style={styles.head}>Server</span>
          <span />
          {state.settings.map((s) => {
            const draft = draftFor(s);
            const verdict = rasterVerdict(state, s.channel);
            return (
              // A FRAGMENT per row, cells straight into the one grid — the same discipline the
              // candidate-layer table keeps, so every column lines up across channels.
              <ChannelRow
                key={s.channel}
                settings={s}
                draft={draft}
                verdict={verdict}
                observed={observedLine(state, s.channel)}
                busy={busy === s.channel}
                onEdit={(patch) => edit(s.channel, patch)}
                onApply={() => void apply(s)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

function ChannelRow({
  settings,
  draft,
  verdict,
  observed,
  busy,
  onEdit,
  onApply,
}: {
  settings: ChannelSettings;
  draft: { width: string; height: string };
  verdict: keyof typeof VERDICT_TEXT;
  observed: string;
  busy: boolean;
  onEdit: (patch: Partial<{ width: string; height: string }>) => void;
  onApply: () => void;
}): JSX.Element {
  const channel = String(settings.channel);
  return (
    <>
      <span style={styles.channel} data-raster-channel={channel}>
        Channel {channel}
      </span>
      <NumericInput
        className="cg-field"
        aria-label={`Channel ${channel} raster width`}
        value={draft.width}
        onValueChange={(v) => onEdit({ width: v })}
      />
      <span style={styles.times}>×</span>
      <NumericInput
        className="cg-field"
        aria-label={`Channel ${channel} raster height`}
        value={draft.height}
        onValueChange={(v) => onEdit({ height: v })}
      />
      <span style={styles.observed}>
        {observed}{' '}
        <span style={styles.verdict[verdict]} data-raster-verdict={verdict}>
          {VERDICT_TEXT[verdict]}
        </span>
      </span>
      <Button
        variant="primary"
        aria-label={`Set channel ${channel} raster`}
        title="Sends this channel's raster to the bridge. Refused while anything is on air."
        disabled={busy}
        onClick={onApply}
      >
        Set raster
      </Button>
    </>
  );
}
