import { useEffect, useMemo, useState } from 'react';
import type { ConnectionConfig, TemplateServeInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { isLoopbackHost } from '../../../shared/loopback.js';
import { useConnections } from '../../hooks/useConnections.js';
import { useStack } from '../../hooks/useStack.js';
import { OutputsSection } from '../connections/OutputsSection.js';
import { isOnAirStatus } from '@cg/shared-schema';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Modal, ModalAction, modalActionVariant, type ModalMessage } from '../../ui/Modal.js';
import { Notice } from '../../ui/Notice.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { CandidateLayersSection } from '../fixedLayers/CandidateLayersSection.js';
import { DelimitersSection } from '../inspector/DelimitersSection.js';
import { SourcesSection } from '../sources/SourcesSection.js';
import { ChannelRasterSection } from './ChannelRasterSection.js';
import { STATION_SETUP_SECTIONS, sectionSpec, type StationSetupSection } from './sections.js';
import { SetupSection } from './SetupSection.js';
import { StationLayersSection } from './StationLayersSection.js';

/**
 * `STATION-SETUP-02` — **ONE HOME FOR THE STATION'S SETTINGS.**
 *
 * This was `ServerSettingsPanel` — the Server connection dialog: hosts + ports with a real
 * Cancel / Apply, a working pinned refusal region, an on-air guard, and (since `B-223`)
 * the Outputs section. It was most of a settings home already, so it GREW rather than
 * being replaced: renamed, and given sections. What moved in:
 *
 *   - the live-source CATALOG (was its own `Live sources` dialog) — the status bar's
 *     SOURCES button opens this dialog AT that section, not a second surface;
 *   - the delimiter list (was `Text file delimiters`) — the Inspector's gear deep-links;
 *   - candidate-layer membership, aliases, visibility and bound templates (was the
 *     `Configure` dialog, and its unconfigured explainer) — the Layers panel deep-links;
 *   - the CHANNEL RASTER (`R-030`) — the first UI this control has ever had;
 *   - the reserved and live layers, read-only — they had a CLI flag and a file and no UI.
 *
 * ── SECTIONS, NOT TABS, AND ONE MESSAGE REGION ──────────────────────────────
 *
 * A tab bar would hide the section a refusal came from. Every section stays rendered; a
 * jump row scrolls; each section reports into the ONE pinned region the primitive owns,
 * prefixed with the section's name, so a refusal is visible without hunting for the
 * section that raised it — which is the whole reason the region is pinned (`runtime-
 * modal-message-region`).
 *
 * ── THE ON-AIR GUARD DID NOT WIDEN, AND THAT IS A DECISION ─────────────────
 *
 * `connections.set-config` is refused while anything is on air, and this dialog
 * pre-disables its APPLY for that reason. That guard covers the SERVERS section alone,
 * and the footer's action now SAYS so (`APPLY SERVERS`). Per section: Outputs and Station
 * layers are read-only; the raster's on-air refusal is the BRIDGE's own and is surfaced,
 * never re-derived; sources, delimiters and candidate layers are not air-critical and
 * were never gated — they commit from the body, immediately, and their legends say so.
 * The old delimiters dialog's stated reason for being separate — "a gate that is right for
 * a host change and wrong for choosing what a comma means" — is honoured by scoping the
 * gate, not by keeping the dialog.
 *
 * ── WIDE, under `runtime-modal-contract`'s criterion ────────────────────────
 *
 * The candidate-layer table (row · show · name · template) and the raster table (channel ·
 * width · height · what the server reports) both put several values per row that the
 * operator reads DOWN A COLUMN, comparing rows. That is the criterion, and this dialog
 * meets it twice over.
 *
 * ── WHAT DELIBERATELY DID NOT MOVE IN — six things, each with its reason ────
 *
 * The operator name (the Audit panel puts it beside the actor column ON PURPOSE, because
 * its "self-declared and unverified" caveat must sit beside what it qualifies — `B-143`);
 * the lock PIN (one press from the status bar, engaged while walking away from a live
 * desk); panel widths and the Inspector overlay (per operator, per screen, not bridge
 * config); per-plate audio, the per-row source override and the on-air position (reached
 * during a live interview, from the row); the plate→source ASSIGNMENTS (per template,
 * beside the fields they bind — the catalog here is the OTHER of the two shapes, §6); and
 * the stack, which is the work, not a setting. `stationSetupScope.dom.test.ts` proves each
 * is still reachable where it was and acquired no second control here.
 *
 * Apply keeps its `AsyncButton` — it owns its busy/error rendering — and resolves its
 * variant from the shared role table (`modalActionVariant`): a documented exception to the
 * `ModalAction` rule, not drift.
 */

interface Props {
  open: boolean;
  /** The section the operator asked for — a deep link. Defaults to the first. */
  section?: StationSetupSection;
  /** Changes on every open request, so a repeat request while open still scrolls. */
  requestId?: number;
  onClose: () => void;
}

const styles = {
  nav: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.3rem',
    alignItems: 'center',
    fontSize: '0.78rem',
    color: colors.textMuted,
  },
  sub: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  subTitle: {
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: colors.textMuted,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' },
  label: { width: 92, color: colors.textMuted },
  host: { flex: 1, minWidth: 120 },
  port: { width: 88 },
  status: { fontSize: '0.8rem', color: colors.textMuted },
  /*
    `C-024` — THE MASKING TREATMENT, AND WHY IT IS NOT GREY.

    Grey is this app's DISABLED signal. Spending it here would say "you cannot change this",
    which is false: the stored value is exactly what takes over at the next boot without the
    flag, so it must stay editable and legible. A strike-through says "NOT IN FORCE RIGHT NOW"
    while keeping the text readable.
  */
  maskedNote: {
    fontSize: '0.78rem',
    color: colors.textMuted,
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.35rem',
    alignItems: 'baseline',
    paddingLeft: 92,
  },
  maskedStored: { textDecoration: 'line-through' },
  inForce: { color: colors.text, fontWeight: 700 },
  candidates: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.3rem',
    alignItems: 'center',
    paddingLeft: 92,
  },
} as const;

interface EndpointDraft {
  host: string;
  amcpPort: string;
  oscPort: string;
}

/**
 * R-010 — how many rows block APPLY SERVERS. A COUNT, not a predicate: the dialog says the
 * number in its refusal. Counted with `isOnAirStatus` from `@cg/shared-schema` — the same
 * function object the bridge's own `#onAirCount` filters on — so the pre-emptive message
 * and the bridge's refusal cannot disagree about which rows count.
 */
export function anyOnAirOrUnsettled(items: readonly StackItemState[]): number {
  return items.filter(isOnAirStatus).length;
}

function toDraft(ep: { host: string; amcpPort: number; oscPort: number }): EndpointDraft {
  return { host: ep.host, amcpPort: String(ep.amcpPort), oscPort: String(ep.oscPort) };
}

function parsePort(raw: string, min: number): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= min && n <= 65535 ? n : null;
}

function parseEndpoint(
  d: EndpointDraft,
): { host: string; amcpPort: number; oscPort: number } | string {
  const host = d.host.trim();
  if (host.length === 0) return 'Host must not be empty.';
  const amcpPort = parsePort(d.amcpPort, 1);
  if (amcpPort === null) return 'AMCP port must be an integer between 1 and 65535.';
  // OSC port 0 is a valid ephemeral-bind request (matches the schema).
  const oscPort = parsePort(d.oscPort, 0);
  if (oscPort === null) return 'OSC port must be an integer between 0 and 65535.';
  return { host, amcpPort, oscPort };
}

/** A section's message, prefixed with the section it came from — so the region never has to be hunted back to its source. */
function fromSection(id: StationSetupSection, message: ModalMessage): ModalMessage {
  return { ...message, text: `${sectionSpec(id).title}: ${message.text}` };
}

export function StationSetupDialog({
  open,
  section = 'servers',
  requestId = 0,
  onClose,
}: Props): JSX.Element | null {
  const items = useStack();
  // B-223 — the output check's technical surface reads the same health the banner does.
  const health = useConnections();
  const [primary, setPrimary] = useState<EndpointDraft>({
    host: '127.0.0.1',
    amcpPort: '5250',
    oscPort: '6250',
  });
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backup, setBackup] = useState<EndpointDraft>({
    host: '127.0.0.1',
    amcpPort: '5251',
    oscPort: '6251',
  });
  /*
    `C-024` — THE STORED SERVE ADDRESS, AS DRAFT STRINGS. Strings because this is a form: the
    empty field is a real state the operator can reach by clearing it, and it MEANS "derive it".
    The absent-vs-empty distinction the schema keeps is resolved by the bridge's one normalizer.
  */
  const [serveHost, setServeHost] = useState('');
  const [servePort, setServePort] = useState('');
  /** What is actually IN FORCE, and why — the read that makes the masking possible. */
  const [serveInfo, setServeInfo] = useState<TemplateServeInfo | null>(null);
  const [strategy, setStrategy] = useState<ConnectionConfig['strategy']>('mirror-sync');
  const [autoFailover, setAutoFailover] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** One standing message per section — a refusal or an outcome, replaced by the next. */
  const [sectionMessages, setSectionMessages] = useState<
    Partial<Record<StationSetupSection, ModalMessage>>
  >({});

  /** Stable reporters, one per section, so a section's effect deps do not churn. */
  const reporters = useMemo(() => {
    const make =
      (id: StationSetupSection) =>
      (message: ModalMessage | null): void => {
        setSectionMessages((prev) => {
          const next = { ...prev };
          if (message === null) delete next[id];
          else next[id] = fromSection(id, message);
          return next;
        });
      };
    return {
      raster: make('raster'),
      sources: make('sources'),
      delimiters: make('delimiters'),
      candidateLayers: make('candidate-layers'),
    };
  }, []);

  // Load the current config when opened; refresh when any client applies one.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const applyConfig = (config: ConnectionConfig): void => {
      if (cancelled) return;
      setPrimary(toDraft(config.servers.A));
      setBackupEnabled(config.servers.B !== undefined);
      if (config.servers.B !== undefined) setBackup(toDraft(config.servers.B));
      setStrategy(config.strategy);
      setAutoFailover(config.autoFailoverEnabled);
      setServeHost(config.templateServeHost ?? '');
      setServePort(config.templateServePort === undefined ? '' : String(config.templateServePort));
    };
    void window.cg.connections.config().then(applyConfig);
    /*
      `C-024` — READ WHAT IS IN FORCE ON OPEN, not only after an Apply. A panel that could
      learn about a mask only by CHANGING something would show a wrong value for as long as
      the operator merely looked at it.
    */
    void window.cg.connections
      .templateServe()
      .then((info) => {
        if (!cancelled) setServeInfo(info);
      })
      // An OLDER bridge does not know this channel; `serveInfo` stays null and the panel
      // makes NO CLAIM about masking. Skew has its own owner (`BridgeSkewBanner`).
      .catch(() => undefined);
    const unsubscribe = window.cg.connections.onConfigChanged(applyConfig);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [open]);

  // A closed dialog forgets its section messages: the next open starts clean.
  useEffect(() => {
    if (!open) setSectionMessages({});
  }, [open]);

  const onAirCount = anyOnAirOrUnsettled(items);

  const validated = useMemo((): ConnectionConfig | string => {
    const a = parseEndpoint(primary);
    if (typeof a === 'string') return `Primary: ${a}`;
    let b: { host: string; amcpPort: number; oscPort: number } | undefined;
    if (backupEnabled) {
      const parsed = parseEndpoint(backup);
      if (typeof parsed === 'string') return `Backup: ${parsed}`;
      b = parsed;
    }
    /*
      `C-024` — EMPTY PORT IS ABSENT; EMPTY HOST IS AN EMPTY STRING. Both mean "derive it".
      The host field must be CLEARABLE, and a cleared field has to round-trip through the
      store as `''`; the port has no such problem and `0` already means something specific.
    */
    const port = servePort.trim();
    if (port.length > 0) {
      if (!/^\d+$/.test(port)) return 'Template serve port must be an integer between 0 and 65535.';
      const n = Number(port);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        return 'Template serve port must be an integer between 0 and 65535.';
      }
    }
    return {
      servers: { A: a, ...(b !== undefined ? { B: b } : {}) },
      strategy,
      autoFailoverEnabled: autoFailover,
      templateServeHost: serveHost,
      ...(port.length > 0 ? { templateServePort: Number(port) } : {}),
    };
  }, [primary, backupEnabled, backup, strategy, autoFailover, serveHost, servePort]);

  const validationError = typeof validated === 'string' ? validated : null;
  const remoteHosts = [
    ...(primary.host.trim().length > 0 && !isLoopbackHost(primary.host) ? [primary.host] : []),
    ...(backupEnabled && backup.host.trim().length > 0 && !isLoopbackHost(backup.host)
      ? [backup.host]
      : []),
  ];

  /*
    `C-024` — THE MASK COMES FROM THE BRIDGE, NEVER FROM COMPARING VALUES. Inferring "a flag
    must be set" from `serveInfo.serveHost !== serveHost` fires on every fresh install.
  */
  const flagServeHost = serveInfo?.flagOverrides?.serveHost;
  const flagServePort = serveInfo?.flagOverrides?.port;
  const serveCandidates = serveInfo?.candidates ?? [];

  if (!open) return null;

  const endpointRows = (
    draft: EndpointDraft,
    set: (next: EndpointDraft) => void,
    prefix: string,
  ): JSX.Element => (
    <>
      <div style={styles.row}>
        <span style={styles.label}>Host</span>
        <input
          className="cg-field"
          style={styles.host}
          aria-label={`${prefix} host`}
          value={draft.host}
          onChange={(e) => set({ ...draft, host: e.target.value })}
        />
      </div>
      <div style={styles.row}>
        <span style={styles.label}>AMCP port</span>
        {/* R-020 — ports are integer-only NumericInputs: Persian/Arabic-Indic
            digits normalize to Latin BEFORE parsePort's /^\d+$/ sees them. */}
        <NumericInput
          className="cg-field"
          style={styles.port}
          aria-label={`${prefix} AMCP port`}
          value={draft.amcpPort}
          onValueChange={(v) => set({ ...draft, amcpPort: v })}
        />
        <span style={styles.label}>OSC port</span>
        <NumericInput
          className="cg-field"
          style={styles.port}
          aria-label={`${prefix} OSC port`}
          value={draft.oscPort}
          onValueChange={(v) => set({ ...draft, oscPort: v })}
        />
      </div>
    </>
  );

  /*
    THE DIALOG'S MESSAGES GO TO THE PRIMITIVE'S PINNED REGION. The Servers section's four
    (why APPLY will not happen, a validation error, a bridge refusal, the outcome) first and
    worst-first; then every other section's standing message, in section order.
  */
  const messages: readonly ModalMessage[] = [
    // WHY APPLY SERVERS WILL NOT HAPPEN is a REFUSAL — the attention case, never red — and
    // it names its SCOPE: the other sections are not gated and must not read as if they were.
    ...(onAirCount > 0
      ? [
          {
            role: 'refusal' as const,
            text: `Apply is blocked for Servers: ${String(onAirCount)} item(s) are on air or unsettled. Use Clear All — it takes them off air and keeps the rows. Every other section stays editable.`,
          },
        ]
      : []),
    ...(validationError !== null
      ? [{ role: 'refusal' as const, text: `Servers: ${validationError}` }]
      : []),
    ...(refusal !== null ? [{ role: 'refusal' as const, text: refusal }] : []),
    ...(status !== null ? [{ role: 'notice' as const, text: status }] : []),
    ...STATION_SETUP_SECTIONS.flatMap((s) => {
      const m = sectionMessages[s.id];
      return m === undefined ? [] : [m];
    }),
  ];

  const jumpTo = (id: StationSetupSection): void => {
    const el = document.querySelector<HTMLElement>(`[data-station-section="${id}"]`);
    if (el === null) return;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    el.focus({ preventScroll: true });
  };

  return (
    <Modal
      title="Station setup"
      ariaLabel="Station setup"
      size="wide"
      onClose={onClose}
      {...(messages.length > 0 ? { message: messages } : {})}
      footer={
        <>
          {/*
            CANCEL: the Servers draft is dropped and nothing is sent; the sections that save
            as they go are ALREADY saved, and the tooltip says so — the word "Cancel" must
            not be read as undoing them. Routes to the same `onClose` as the ✕, Escape and the
            backdrop. First in DOM order, so APPLY keeps the corner every dialog's primary has.
          */}
          <ModalAction
            actionRole="cancel"
            onClick={onClose}
            title="Leaves without applying the Servers draft. The sections that save as you go are already saved."
          >
            Cancel
          </ModalAction>
          {/*
            APPLY SERVERS — `primary`, and named for its SCOPE. It commits the Servers section
            and nothing else; the raster, the bank, the catalog and the delimiters each commit
            from their own section. An unscoped "APPLY" at the foot of a dialog with seven
            sections would claim more than it does.
          */}
          <AsyncButton
            variant={modalActionVariant('primary')}
            data-modal-role="primary"
            aria-label="Apply server settings"
            title="Applies the Servers section. Refused while anything is on air."
            disabled={onAirCount > 0 || validationError !== null}
            run={async () => {
              if (typeof validated === 'string') return { accepted: false };
              setRefusal(null);
              setStatus(null);
              const result = await window.cg.connections.setConfig(validated);
              if (!result.ok) {
                setRefusal(
                  `Servers: ${result.message ?? 'The bridge refused the new configuration.'}`,
                );
                return { accepted: false, errorCode: result.reason ?? 'refused' };
              }
              /*
                🔴 B-162 — THE APPLY THAT SUCCEEDS AND STILL COSTS A SERVER ITS GRAPHICS. The
                bridge's own verdict (`unreachable`) is read FIRST: a loopback template server
                with a remote CasparCG configured means that server fetches ITSELF, gets nothing,
                and shows live sources with no graphic over them while `CG ADD` reports success.
                The bridge's verdict, never re-derived here (golden rule 6).
              */
              // `C-024` — RE-READ WHAT IS IN FORCE: the panel never computes it, it asks.
              void window.cg.connections.templateServe().then(setServeInfo);
              const unreachable = result.templateServe?.unreachable ?? [];
              if (unreachable.length > 0) {
                setRefusal(
                  `Servers: applied, but the template server is loopback-only and ${unreachable.join(', ')} ` +
                    `cannot reach it. Those servers will show live sources with NO TEMPLATE — no ` +
                    `background, no text — and their CG ADD will still report success. Set Serve ` +
                    `host above to this machine's address as those servers see it, then Apply ` +
                    `again — the bridge does not need restarting.`,
                );
                return { accepted: true };
              }
              setStatus(
                result.templateServe?.exposed === true
                  ? `Applied. Template serve is LAN-exposed at ${result.templateServe.serveHost} (remote server); control stays on 127.0.0.1.`
                  : 'Applied. All listeners remain loopback-only.',
              );
              return { accepted: true };
            }}
          >
            APPLY SERVERS
          </AsyncButton>
        </>
      }
    >
      {/* The jump row — every section stays rendered; this only scrolls. */}
      <nav aria-label="Station setup sections" style={styles.nav}>
        <span>Go to</span>
        {STATION_SETUP_SECTIONS.map((s) => (
          <Button
            key={s.id}
            variant="ghost"
            aria-label={`Go to ${s.title}`}
            onClick={() => jumpTo(s.id)}
          >
            {s.title}
          </Button>
        ))}
      </nav>

      <SetupSection id="servers" requested={section === 'servers'} requestId={requestId}>
        <section style={styles.sub} aria-label="Primary server">
          <span style={styles.subTitle}>PRIMARY (A)</span>
          {endpointRows(primary, setPrimary, 'Primary')}
        </section>

        <section style={styles.sub} aria-label="Backup server">
          <span style={styles.subTitle}>
            BACKUP (B)
            {backupEnabled ? (
              <Button aria-label="Remove backup" onClick={() => setBackupEnabled(false)}>
                Remove backup
              </Button>
            ) : (
              <Button aria-label="Add backup" onClick={() => setBackupEnabled(true)}>
                Add backup
              </Button>
            )}
          </span>
          {backupEnabled ? (
            endpointRows(backup, setBackup, 'Backup')
          ) : (
            <span style={styles.status}>
              No backup declared — single-server operation (B-046: quiet by design).
            </span>
          )}
        </section>

        {/*
          `C-024` — BESIDE THE SERVER HOSTS: a fact ABOUT the two servers above — the address
          they fetch templates from. 🔴 The bridge is NOT restarted, and nothing here offers
          to: `connections.set-config` rebuilds template serving on the running process.
        */}
        <section style={styles.sub} aria-label="Template serve address">
          <span style={styles.subTitle}>HOW THOSE SERVERS REACH THIS MACHINE</span>
          {/* ⚠ This copy deliberately does not say "NO TEMPLATE" — that phrase is the ALARM,
              asserted ABSENT on a healthy apply, and ambient copy would drain it. */}
          <span style={styles.status}>
            The address CasparCG fetches templates from. Leave it empty to derive it. Get it wrong
            and those servers show live sources with no graphic over them, while CG ADD still
            reports success.
          </span>
          <div style={styles.row}>
            <span style={styles.label}>Serve host</span>
            <input
              className="cg-field"
              style={styles.host}
              aria-label="Template serve host"
              value={serveHost}
              onChange={(e) => setServeHost(e.target.value)}
            />
          </div>
          {flagServeHost === undefined ? null : (
            <div style={styles.maskedNote} data-testid="serve-host-masked">
              <span style={styles.inForce}>In force: {flagServeHost}</span>
              <span>(set by --template-serve-host)</span>
              <span style={styles.maskedStored}>
                {serveHost.trim().length === 0 ? 'empty (would derive)' : serveHost}
              </span>
              <span>
                not in force — overridden by --template-serve-host. It takes over at the next start
                without the flag, so it stays editable.
              </span>
            </div>
          )}
          {serveCandidates.length === 0 ? null : (
            <div style={styles.candidates}>
              {/* ⚠ CANDIDATES, NEVER A VERDICT: the bridge enumerates this machine's
                  interfaces; it cannot know which one the plant routes to. */}
              <span style={styles.status}>
                Candidates — this machine&apos;s addresses, not a verdict about which one those
                servers can reach:
              </span>
              {serveCandidates.map((candidate) => (
                <Button
                  key={candidate}
                  aria-label={`Use serve host ${candidate}`}
                  onClick={() => setServeHost(candidate)}
                >
                  {candidate}
                </Button>
              ))}
            </div>
          )}
          <div style={styles.row}>
            <span style={styles.label}>Serve port</span>
            <NumericInput
              className="cg-field"
              style={styles.port}
              aria-label="Template serve port"
              value={servePort}
              onValueChange={setServePort}
            />
            <span style={styles.status}>
              Empty = ephemeral (today&apos;s default). Pin it to make a firewall rule possible.
            </span>
          </div>
          {flagServePort === undefined ? null : (
            <div style={styles.maskedNote} data-testid="serve-port-masked">
              <span style={styles.inForce}>In force: {String(flagServePort)}</span>
              <span>(set by --template-serve-port)</span>
              <span style={styles.maskedStored}>
                {servePort.trim().length === 0 ? 'empty (ephemeral)' : servePort}
              </span>
              <span>not in force — overridden by --template-serve-port.</span>
            </div>
          )}
        </section>

        <section style={styles.sub} aria-label="Redundancy options">
          <div style={styles.row}>
            <span style={styles.label}>Strategy</span>
            <select
              className="cg-field"
              style={{ width: 'auto' }}
              aria-label="Redundancy strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as ConnectionConfig['strategy'])}
            >
              <option value="mirror-sync">mirror-sync</option>
              <option value="mirror-async">mirror-async</option>
              <option value="journal-replay">journal-replay</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                aria-label="Auto-failover enabled"
                checked={autoFailover}
                onChange={(e) => setAutoFailover(e.target.checked)}
              />
              auto-failover
            </label>
          </div>
        </section>

        {/* The remote-host note stays in the BODY: it describes the configuration being
            edited, not the outcome of pressing Apply. `role="note"` keeps it out of the
            alert channel. */}
        {remoteHosts.length > 0 && (
          <Notice
            noticeRole="refusal"
            aria="note"
            text={`Remote server (${remoteHosts.join(', ')}): the template server and OSC listener will use a LAN address so CasparCG can reach this machine. The control connection stays on 127.0.0.1.`}
          />
        )}
      </SetupSection>

      {/*
        `B-223` — THE OUTPUT CHECK'S ENGINEERING DETAIL, read-only. Nothing in it is a
        control, so it gates nothing and is gated by nothing. `OutputsSection` renders its own
        labelled region (`Program outputs`), which the banner's pointer names.
      */}
      <SetupSection id="outputs" requested={section === 'outputs'} requestId={requestId}>
        <OutputsSection health={health} />
      </SetupSection>

      <SetupSection id="raster" requested={section === 'raster'} requestId={requestId}>
        <ChannelRasterSection report={reporters.raster} />
      </SetupSection>

      <SetupSection id="sources" requested={section === 'sources'} requestId={requestId}>
        <SourcesSection report={reporters.sources} />
      </SetupSection>

      <SetupSection id="delimiters" requested={section === 'delimiters'} requestId={requestId}>
        <DelimitersSection report={reporters.delimiters} />
      </SetupSection>

      <SetupSection
        id="candidate-layers"
        requested={section === 'candidate-layers'}
        requestId={requestId}
      >
        <CandidateLayersSection report={reporters.candidateLayers} />
      </SetupSection>

      <SetupSection
        id="station-layers"
        requested={section === 'station-layers'}
        requestId={requestId}
      >
        <StationLayersSection />
      </SetupSection>
    </Modal>
  );
}
