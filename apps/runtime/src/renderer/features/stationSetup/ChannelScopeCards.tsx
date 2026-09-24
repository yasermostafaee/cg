import { useEffect, useState } from 'react';
import type { ConnectionConfig, StationStray } from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { IsolatedName } from '../../ui/OperatorNames.js';
import { useConfirm } from '../../ui/useDialog.js';
import { colors, cssVars } from '../../theme.js';
import { useFixedBanks } from '../../hooks/useFixedLayers.js';
import { ChannelStep } from '../firstRun/FirstRunScreen.js';
import { declareChannelSet, writeFirstRunConnection } from '../firstRun/firstRunStation.js';

/**
 * 🔴 `DESKTOP-APPS-01-D` — **THE TWO CHANNEL-SCOPE CONTROLS OF STATION SETUP**, a station-admin's
 * and nobody else's: the caller renders them only for one, so for anyone else they are ABSENT,
 * never greyed (golden rule 13).
 *
 * e — **Change channel…**: first-run's own channel list and its on-air warning, declaring the new
 *     channel through the same door. The bridge refuses while anything of ours is on air on the
 *     current channel, in one sentence, and that sentence is shown as it comes.
 *     ⭐ `MULTI-CHANNEL-01` §2 M — it is now the editor of the station's channel SET: the list opens
 *     on the channels the station declares, and a toggle adds, removes or replaces one. The refusal
 *     is kept: nothing of ours may be on air on a channel leaving the set (`declareChannelSet`).
 * j — **On air on another channel**: an item of ours on a channel this station does not declare,
 *     with its channel, layer and template, and ONE action — take it off air (STOP then CLEAR on
 *     that exact layer), after a one-line confirmation. Nothing here offers to load it again.
 */

const styles = {
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  fact: { fontSize: cssVars['--r-text-md'] },
  error: { fontSize: cssVars['--r-text-sm'], color: colors.errorText, lineHeight: 1.6 },
} as const;

/** e — Change channel…, reusing first-run's channel step with this station's own writes. */
export function ChangeChannelCard(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  // `MULTI-CHANNEL-01` §2 M — the station's set, read where it is edited.
  const banks = useFixedBanks();
  const channels = banks.map((b) => b.channel);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.cg.connections
      .config()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const currentHost = config?.servers.A.host ?? '';
  const serveHost = config?.templateServeHost ?? '';

  return (
    <section className="cg-card" aria-label="Change channel" data-change-channel="">
      <div className="cg-card__head">
        <span className="cg-card__title">Channel</span>
        <span className="cg-card__spacer" />
        {!open && (
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(true);
            }}
          >
            Change channel…
          </Button>
        )}
      </div>
      <div className="cg-card__body">
        <div style={styles.fact}>
          {channels.length === 0 ? '—' : channels.map((c) => `CH ${String(c)}`).join(' · ')}
        </div>
        {open && config !== null && (
          <ChannelStep
            playoutHost={currentHost}
            showServeAddress={false}
            fixedServeHost={serveHost}
            initial={channels.map((c) => ({ casparHost: currentHost, casparChannel: c }))}
            // Only a channel on ANOTHER CasparCG host moves the connection; on this host there is
            // nothing to put in force before the occupancy read.
            prepare={(choice) =>
              choice.casparHost === currentHost
                ? Promise.resolve(null)
                : writeFirstRunConnection(window.cg, { ...choice, serveHost })
            }
            declare={(choices) => declareChannelSet(window.cg, banks, choices)}
            onDone={() => {
              setOpen(false);
            }}
          />
        )}
      </div>
    </section>
  );
}

/** j — the strays, as the bridge lists them, kept current by its publish. */
export function useStrays(): readonly StationStray[] {
  const [strays, setStrays] = useState<readonly StationStray[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.cg.strays
      .list()
      .then((list) => {
        if (!cancelled) setStrays(list);
      })
      .catch(() => undefined);
    const off = window.cg.strays.onChanged((list) => {
      if (!cancelled) setStrays(list);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);
  return strays;
}

/** j — On air on another channel. Absent when there is none. */
export function StraysCard(): JSX.Element | null {
  const strays = useStrays();
  const { confirm, confirmDialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (strays.length === 0) return null;

  const takeOff = async (stray: StationStray): Promise<void> => {
    const name = stray.templateName ?? stray.templateId;
    const ok = await confirm({
      title: `Take “${name}” off air on channel ${String(stray.casparChannel)}, layer ${String(stray.layer)}?`,
      layer: 'sub',
      destructive: true,
      body: `Nothing else on channel ${String(stray.casparChannel)} is touched.`,
      confirmLabel: 'Take off air',
    });
    if (!ok) return;
    const key = `${String(stray.casparChannel)}-${String(stray.layer)}`;
    setBusy(key);
    setError(null);
    try {
      const res = await window.cg.strays.takeOffAir({
        casparChannel: stray.casparChannel,
        layer: stray.layer,
      });
      if (!res.ok) setError(res.message ?? 'It was not taken off air.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="cg-card" aria-label="On air on another channel" data-strays="">
      <div className="cg-card__head">
        <span className="cg-card__title">On air on another channel</span>
      </div>
      <div className="cg-card__body">
        {strays.map((stray) => {
          const key = `${String(stray.casparChannel)}-${String(stray.layer)}`;
          return (
            <div key={key} style={styles.row} data-stray={key}>
              <div style={styles.grow}>
                <IsolatedName>{stray.templateName ?? stray.templateId}</IsolatedName>
                {` · CH ${String(stray.casparChannel)} · layer ${String(stray.layer)}`}
              </div>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void takeOff(stray)}
              >
                Take off air
              </Button>
            </div>
          );
        })}
        {error !== null && (
          <div style={styles.error} role="status">
            {error}
          </div>
        )}
      </div>
      {confirmDialog}
    </section>
  );
}
