import { useEffect, useMemo, useState } from 'react';
import { Layers, Monitor, Radio, Server, Type, type LucideIcon } from 'lucide-react';
import type { ConnectionConfig, TemplateServeInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { isLoopbackHost } from '../../../shared/loopback.js';
import { useConnections } from '../../hooks/useConnections.js';
import { useStack } from '../../hooks/useStack.js';
import { isOnAirStatus } from '@cg/shared-schema';
import { colors, cssVars } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Modal, ModalAction, modalActionVariant, type ModalMessage } from '../../ui/Modal.js';
import { Notice } from '../../ui/Notice.js';
import { NumericInput } from '../../ui/NumericInput.js';
import { Tabs, type TabSpec } from '../../ui/Tabs.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import { CandidateLayersSection } from '../fixedLayers/CandidateLayersSection.js';
import { DelimitersSection } from '../inspector/DelimitersSection.js';
import { SourcesSection } from '../sources/SourcesSection.js';
import { BackupServerDialog } from './BackupServerDialog.js';
import { ChannelSection } from './ChannelSection.js';
import {
  DEFAULT_STATION_SETUP_SECTION,
  STATION_SETUP_SECTIONS,
  sectionSpec,
  type StationSetupSection,
} from './sections.js';
import { SetupSection } from './SetupSection.js';

/**
 * `STATION-SETUP-02` / `STATION-CHROME-01` §2 — **ONE HOME FOR THE STATION'S SETTINGS, IN
 * TABS.**
 *
 * This was `ServerSettingsPanel` — the Server connection dialog — which GREW into the
 * settings home: the live-source catalogue, the delimiter list, candidate-layer membership,
 * and the channel. What it looks like is `STATION-CHROME-01`'s subject; what it stores is
 * unchanged, key for key.
 *
 * ── TABS, AND THE ARGUMENT AGAINST THEM, ANSWERED ───────────────────────────
 *
 * The full argument is written once, at the head of `sections.ts`, and not repeated here.
 * The short of it: the previous build's reason for a scroll — "a tab hides the section a
 * refusal came from" — was sound, and the scroll did not deliver it. It put
 * `Apply is blocked for Servers…` in front of an operator editing DELIMITERS. What replaces
 * it keeps the protection and drops the assumption:
 *
 *   · **the active section's messages, and only those, reach the pinned region** — so a
 *     refusal is rendered by the section that raised it, above that section's own footer,
 *     and never in front of another section's work;
 *   · **every blocked section marks itself in the RAIL** with an amber dot, and every
 *     section with unapplied changes marks itself with a sky one — so nothing is hidden,
 *     and one press lands on the sentence that says why.
 *
 * ── EACH SECTION OWNS ITS FOOTER ────────────────────────────────────────────
 *
 * Read-only sections carry no commit action at all and say there is nothing to apply.
 * Sections that commit as they go say so and offer a quiet Close, which dismisses and
 * commits nothing. Only the two draft sections carry an APPLY, and each one's APPLY names
 * its own scope. `CandidateLayersSection` renders its Apply/Revert straight INTO this
 * footer through `footerSlot` — that is what the tabs bought it: its own note recorded that
 * the buttons sat in the body only because "the dialog's footer belongs to Servers", and
 * that is no longer true.
 *
 * ── THE ON-AIR GUARD DID NOT WIDEN ──────────────────────────────────────────
 *
 * `connections.set-config` is refused while anything is on air, and this dialog pre-disables
 * APPLY SERVERS for that reason. That guard covers the SERVERS section alone, exactly as it
 * did. Its refusal keeps the sentence saying every other section stays editable — and now it
 * also lives where it belongs, in front of Servers and nowhere else.
 *
 * ── WHAT DELIBERATELY DID NOT MOVE IN ───────────────────────────────────────
 *
 * The operator name (`B-143`); the lock PIN (one press from the status bar, engaged while
 * walking away from a live desk — `STATION-CHROME-01` §7 re-confirmed this); panel widths
 * and the Inspector overlay; per-plate audio, the per-row source override and the on-air
 * position; the plate→source ASSIGNMENTS; and the stack, which is the work, not a setting.
 * `stationSetupScope.dom.test.ts` proves each is still reachable where it was.
 *
 * ⭐ **AND STATION LAYERS MOVED OUT** (§3). It is in front of the operator, in the panel it
 * already has, not behind a door. The live-layer LEDGER — which was reachable only from the
 * settings copy — moved to that panel rather than disappearing with the section.
 */

interface Props {
  open: boolean;
  /** The section the operator asked for — a deep link. Defaults to Channel. */
  section?: StationSetupSection;
  /** Changes on every open request, so a repeat request while open still switches tab. */
  requestId?: number;
  onClose: () => void;
}

/**
 * `RUNTIME-REDESIGN-01` Phase 7 — the rail's glyphs, the reference's five (`#i-monitor`,
 * `#i-server`, `#i-radio`, `#i-text`, `#i-layers`) as their lucide equivalents. Decorative — the
 * label is the name — and kept here rather than in `sections.ts`, which stays data.
 */
const SECTION_ICONS: Record<StationSetupSection, LucideIcon> = {
  channel: Monitor,
  servers: Server,
  sources: Radio,
  delimiters: Type,
  'candidate-layers': Layers,
};

const styles = {
  shell: { display: 'flex', flex: 1, minHeight: 0, gap: 0 },
  /**
   * `STATION-CHROME-02` §2 — THE ONE SCROLL CONTAINER. The frame is fixed, the rail and
   * the footer never move, and this is the only thing that scrolls; its scrollbar is
   * therefore inside the pane rather than against the dialog's edge.
   *
   * ⚠ `justifyContent` is deliberately NOT `stretch`, and no child is `flex: 1`: a short
   * section sits at the TOP with empty space below it. Growing Delimiters' card to fill a
   * 680px frame would be worse than the space it leaves.
   */
  pane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflowY: 'auto' as const,
    /* Phase 7 — the inset is the reference's `.panel-scroll` padding, from `.cg-setup-pane`. */
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  /**
   * The footer's standing sentence — what this section's commit contract is.
   *
   * ⚠ `STATION-CHROME-02` §2 — NO WIDTH CAP. It had `maxWidth: 58ch`, and §5's corrected
   * Live-sources sentence is longer than that: the note wrapped to two lines, the footer
   * grew, and its TOP EDGE MOVED on that one tab — the exact property §2 forbids and
   * `station-setup-frame.spec.ts` measures. The cap was protecting against a note running
   * the full width of a very wide dialog; the frame is 1000px and the note shares the row
   * with one button, so flex already does that job.
   */
  footNote: {
    marginInlineEnd: 'auto',
    minWidth: 0,
    /* Phase 7 — the reference's `.foot-message` is 13 px; `.cg-footer-contract` keeps the weight. */
    fontSize: cssVars['--r-setup-foot-text'],
    color: colors.textMuted,
    textAlign: 'start' as const,
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

/**
 * Do these two configs say the SAME thing? — the sky "unapplied changes" dot's whole basis.
 *
 * 🔴 NOT `JSON.stringify(a) !== JSON.stringify(b)`, and the first spelling of this was
 * exactly that and was wrong in a way that looked right: the form always emits
 * `templateServeHost` (`''` meaning "derive it"), while a stored config that has never had
 * one simply OMITS the key. Absent and empty MEAN THE SAME THING here — the bridge's own
 * normalizer says so — but they are different JSON, so every freshly-opened dialog claimed
 * an unapplied draft the operator had not typed. A dot that is on before anything is done
 * teaches the operator to ignore dots.
 *
 * So the comparison is on the NORMALISED fields, in one place, rather than on the shape.
 */
function sameServerConfig(a: ConnectionConfig, b: ConnectionConfig): boolean {
  const endpoint = (e?: { host: string; amcpPort: number; oscPort: number }): string =>
    e === undefined ? '' : `${e.host}|${String(e.amcpPort)}|${String(e.oscPort)}`;
  const key = (c: ConnectionConfig): string =>
    [
      endpoint(c.servers.A),
      endpoint(c.servers.B),
      c.strategy,
      String(c.autoFailoverEnabled),
      c.templateServeHost ?? '',
      c.templateServePort === undefined ? '' : String(c.templateServePort),
    ].join('');
  return key(a) === key(b);
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

export function StationSetupDialog({
  open,
  section = DEFAULT_STATION_SETUP_SECTION,
  requestId = 0,
  onClose,
}: Props): JSX.Element | null {
  const items = useStack();
  // B-223 — the output check's technical surface reads the same health the banner does.
  const health = useConnections();
  /*
    `RUNTIME-REDESIGN-01` Phase 7 — WHICH CHANNEL this dialog's per-channel tab reports: the
    same read the channel strip makes (`useSelectedChannel`), so the subtitle, the strip and
    the Channel tab cannot name three different channels. Station-wide tabs never read it.
  */
  const { selected: channel } = useSelectedChannel();
  const [active, setActive] = useState<StationSetupSection>(section);
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
  /**
   * What the bridge last told us is stored — the baseline the SKY "unapplied changes" dot
   * measures against. Without it the dot would have to guess, and a dot that is on when
   * nothing has been typed is worse than no dot.
   */
  const [loaded, setLoaded] = useState<ConnectionConfig | null>(null);
  /** One standing message per section — a refusal or an outcome, replaced by the next. */
  const [sectionMessages, setSectionMessages] = useState<
    Partial<Record<StationSetupSection, ModalMessage>>
  >({});
  /** Sections that hold an unapplied draft, as they report it themselves. */
  const [sectionDirty, setSectionDirty] = useState<Partial<Record<StationSetupSection, boolean>>>(
    {},
  );
  /**
   * The FOOTER SLOT. A section whose commit is its own — the bank — renders its Apply and
   * Revert into this element, so the buttons are physically in the footer rather than
   * duplicated there. Held in state rather than a ref because the portal target has to
   * exist before the section renders into it, and a ref does not re-render.
   */
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);
  /** §6 — the backup server's own small second dialog. */
  const [addingBackup, setAddingBackup] = useState(false);
  /** `B-240` — the question asked before an unapplied draft is dropped. */
  const { confirm: confirmDismiss, confirmDialog: dismissDialog } = useConfirm();

  /** Stable reporters, one per section, so a section's effect deps do not churn. */
  const reporters = useMemo(() => {
    const make =
      (id: StationSetupSection) =>
      (message: ModalMessage | null): void => {
        setSectionMessages((prev) => {
          const next = { ...prev };
          if (message === null) delete next[id];
          else next[id] = message;
          return next;
        });
      };
    return {
      sources: make('sources'),
      delimiters: make('delimiters'),
      candidateLayers: make('candidate-layers'),
    };
  }, []);

  const markDirty = useMemo(
    () =>
      (id: StationSetupSection) =>
      (dirty: boolean): void => {
        setSectionDirty((prev) => (prev[id] === dirty ? prev : { ...prev, [id]: dirty }));
      },
    [],
  );

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
      setLoaded(config);
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

  /*
    THE DEEP LINK LANDS ON THE TAB, not merely on the dialog. Keyed on `requestId` so a
    SECOND request while the dialog is already open — SOURCES pressed with Servers showing —
    still switches the tab; that repeat case is exactly what the id exists for.
  */
  useEffect(() => {
    if (open) setActive(section);
  }, [open, section, requestId]);

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

  /** Servers holds an unapplied draft when the typed config differs from what is stored. */
  const serversDirty =
    loaded !== null && typeof validated !== 'string' && !sameServerConfig(validated, loaded);

  /**
   * The Servers section's own refusals, worst-first. They live here rather than in a shared
   * list because they belong to ONE tab: the whole point of §2 is that they are never in
   * front of another section's work.
   */
  const serverMessages: readonly ModalMessage[] = [
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
    ...(validationError !== null ? [{ role: 'refusal' as const, text: validationError }] : []),
    ...(refusal !== null ? [{ role: 'refusal' as const, text: refusal }] : []),
    ...(status !== null ? [{ role: 'notice' as const, text: status }] : []),
  ];

  const messagesFor = (id: StationSetupSection): readonly ModalMessage[] => {
    if (id === 'servers') return serverMessages;
    const m = sectionMessages[id];
    return m === undefined ? [] : [m];
  };

  const isBlocked = (id: StationSetupSection): boolean =>
    messagesFor(id).some((m) => m.role === 'refusal');
  const isDirty = (id: StationSetupSection): boolean =>
    id === 'servers' ? serversDirty : (sectionDirty[id] ?? false);

  const tabs: readonly TabSpec[] = STATION_SETUP_SECTIONS.map((s) => ({
    id: s.id,
    label: s.title,
    group: s.group,
    icon: SECTION_ICONS[s.id],
    // BLOCKED beats EDITED: a section you cannot apply is the more urgent fact, and two
    // dots on one row would be a puzzle rather than a signal.
    ...(isBlocked(s.id)
      ? { badge: { tone: 'warn' as const, label: `${s.title} is blocked` } }
      : isDirty(s.id)
        ? { badge: { tone: 'edited' as const, label: `${s.title} has unapplied changes` } }
        : {}),
  }));

  const activeSpec = sectionSpec(active);
  const activeMessages = messagesFor(active);

  /**
   * 🔴 `B-240` — **DISMISSING WITH UNAPPLIED EDITS ASKS, AND NAMES WHAT WOULD BE LOST.**
   *
   * This is the thing the footer's three names were hiding. `Close` dismissed and discarded
   * nothing it warned about; `Cancel`, one tab along, dismissed AND dropped the Servers draft
   * while being named for the drop. Neither said what was about to be lost, and an operator
   * could not tell from the button which of the two he was pressing.
   *
   * With dismissal now living only in the ✕, Escape and the backdrop — one path, three
   * affordances, all routed here — the question is asked once, in one place.
   *
   * ⭐ **`isDirty` is the SAME read the rail's blue dot makes.** Not "the two agree": one
   * read, consulted twice. A second derivation of "does this section hold a draft" is the
   * `B-228` shape, and it would look right until the day either side gained a section.
   *
   * ⚠ It asks ONLY when there is something to lose. A confirmation an operator meets every
   * time he leaves a dialog is one he learns to dismiss without reading, which is how a real
   * warning stops working — the same argument `R-017` makes against confirming an on-air act.
   */
  const dirtySections = STATION_SETUP_SECTIONS.filter((s) => isDirty(s.id));

  /**
   * `B-240` — DISCARD THIS SECTION'S DRAFT, and nothing else. The Layers tab's `Revert` has
   * always meant exactly this; the Servers tab's control was called `Cancel` and dismissed the
   * whole dialog instead. Same name, same act, same scope, on both tabs now.
   *
   * It restores from `loaded` — what the bridge last told us is stored — which is the same
   * baseline `serversDirty` measures against, so pressing it necessarily clears the dot.
   */
  const revertServers = (): void => {
    if (loaded === null) return;
    setPrimary(toDraft(loaded.servers.A));
    setBackupEnabled(loaded.servers.B !== undefined);
    if (loaded.servers.B !== undefined) setBackup(toDraft(loaded.servers.B));
    setStrategy(loaded.strategy);
    setAutoFailover(loaded.autoFailoverEnabled);
    setServeHost(loaded.templateServeHost ?? '');
    setServePort(loaded.templateServePort === undefined ? '' : String(loaded.templateServePort));
    setRefusal(null);
    setStatus(null);
  };

  const dismiss = (): void => {
    if (dirtySections.length === 0) {
      onClose();
      return;
    }
    const names = dirtySections.map((s) => s.title).join(', ');
    void confirmDismiss({
      title: `Leave Station setup without applying ${names}?`,
      body:
        `${names} ${dirtySections.length === 1 ? 'holds' : 'hold'} changes that have not been ` +
        `applied, and leaving drops them. Nothing that saves as you go is affected — the ` +
        `catalogue and the delimiters are already stored.`,
      confirmLabel: 'Leave and discard',
    }).then((confirmed) => {
      if (confirmed) onClose();
    });
  };

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

  return (
    <Modal
      title="Station setup"
      /*
        `RUNTIME-REDESIGN-01` Phase 7 — the reference's `.settings-subtitle` (`Channel 1 · News ·
        Primary A`): the channel this dialog's per-channel tab reports, and which server is
        primary. No channel NAME — the bridge publishes none, and none is invented (A3).
      */
      subtitle={
        <>
          Channel {String(channel)}
          {health !== null && <> · Primary {health.currentPrimary}</>}
        </>
      }
      ariaLabel="Station setup"
      /*
        🔴 `STATION-CHROME-02` §2 — A FIXED FRAME, not a wide one. `wide` sized the dialog to
        its content, so the box moved every time the operator changed tab: Delimiters is five
        rows and Layers is thirty-four. See `Modal`'s `styles.dialogFixed`.
      */
      size="fixed"
      /*
        🔴 `B-240` — the ✕, Escape and the backdrop all route here, and all three now ask
        before dropping an unapplied draft. One path, so the guard cannot be reachable by one
        affordance and not another.
      */
      onClose={dismiss}
      {...(activeMessages.length > 0 ? { message: activeMessages } : {})}
      footer={
        <>
          {/*
            🔴 `B-239` — THIS IS A LABEL, AND IT NOW SAYS SO.

            The section's COMMIT CONTRACT — what pressing something here will do. It stays,
            and the first attempt to fix `B-239` by DELETING it was wrong: the section's own
            legend says the same thing fifteen lines up, and that legend SCROLLS AWAY while
            this is pinned.

            What was genuinely wrong is that it looked like a message. It was the same muted
            grey sentence in the same corner an event would arrive in, so the operator read it
            as a report and then ignored it as furniture. It now wears the app's existing
            "this is chrome, not content" treatment — small, tracked-out, uppercase, the same
            one a card title, a rail group and a table header wear — and declares its role, so
            a test can prove the distinction rather than assert it.

            ⚠ The EVENT never lands here. It lands in the pinned region ABOVE the footer, as an
            amber `Notice`. `data-modal-message` is conditional and absent at rest; this is
            unconditional and never changes. Two elements, two treatments, two lifetimes.
          */}
          <span
            style={styles.footNote}
            className="cg-footer-contract"
            data-section-footer={active}
            data-footer-role="contract"
          >
            {activeSpec.footerRest}
          </span>
          {/* The slot a section's own commit controls portal into (the bank's). */}
          <span ref={setFooterSlot} data-station-footer-slot="" />
          {active === 'servers' ? (
            <>
              {/*
                🔴 `B-240` — REVERT, NOT CANCEL, AND ONLY WHEN THERE IS A DRAFT.

                This was `Cancel`, and it routed to `onClose` — so it DISMISSED THE DIALOG
                while being named for discarding a draft. One tab along, `Revert` discarded a
                draft without dismissing. Two names for one act, and one of them silently did
                a second thing.

                Discard is SECTION-level and is called Revert everywhere. Dismissal is
                DIALOG-level and lives in the ✕, Escape and the backdrop — see the guard on
                `dismiss` below, which is what the two blurred names were hiding.

                `serversDirty` is the SAME read the rail's blue dot makes, so the button and
                the dot cannot disagree about whether there is anything to revert.
              */}
              {serversDirty && (
                <ModalAction
                  actionRole="cancel"
                  onClick={revertServers}
                  title="Puts the Servers fields back to what the bridge holds. Nothing is sent, and the dialog stays open."
                >
                  Revert
                </ModalAction>
              )}
              {/*
                Apply servers — `primary`, and named for its SCOPE. It commits the Servers
                section and nothing else; the bank, the catalogue and the delimiters each
                commit from their own tab.

                ⭐ `STATION-CHROME-02` §3 — SENTENCE CASE. It shipped as `APPLY SERVERS`, and
                the shout was a leftover from the dialog this grew out of: the modal contract
                already says a dialog's TITLE is sentence case and never shouting, and its
                buttons had simply never been brought to the same rule. `Apply layers`, one
                tab along, was already right — two spellings of one rule in one dialog.
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
                    setRefusal(result.message ?? 'The bridge refused the new configuration.');
                    return { accepted: false, errorCode: result.reason ?? 'refused' };
                  }
                  /*
                    🔴 B-162 — THE APPLY THAT SUCCEEDS AND STILL COSTS A SERVER ITS GRAPHICS.
                    The bridge's own verdict (`unreachable`) is read FIRST: a loopback template
                    server with a remote CasparCG configured means that server fetches ITSELF,
                    gets nothing, and shows live sources with no graphic over them while
                    `CG ADD` reports success. The bridge's verdict, never re-derived here.
                  */
                  // `C-024` — RE-READ WHAT IS IN FORCE: the panel never computes it, it asks.
                  void window.cg.connections.templateServe().then(setServeInfo);
                  const unreachable = result.templateServe?.unreachable ?? [];
                  if (unreachable.length > 0) {
                    setRefusal(
                      `Applied, but the template server is loopback-only and ${unreachable.join(', ')} ` +
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
                Apply servers
              </AsyncButton>
            </>
          ) : null}
          {/*
            🔴 `B-240` — AND EVERY OTHER TAB CARRIES NOTHING AT ALL.

            They used to carry a quiet `Close`. It was the THIRD answer to one job: the ✕,
            Escape and the backdrop already dismiss, on every tab, from the primitive — so a
            per-section `Close` made leaving the dialog look like a property of whichever tab
            the operator happened to be standing on, and only some tabs had it.

            ⭐ A footer holding only its message is not unfinished. A footer holding a button
            that does nothing its neighbours do not already do is.

            The bank's own `Revert` / `Apply layers` still portal into `footerSlot` above —
            those are that SECTION's actions, which is what a section footer is for.
          */}
        </>
      }
    >
      <div style={styles.shell}>
        <Tabs
          tabs={tabs}
          activeId={active}
          onSelect={(id) => setActive(id as StationSetupSection)}
          ariaLabel="Station setup sections"
          idPrefix="station"
          orientation="vertical"
        >
          {/*
            THE PANE IS THE SCROLL CONTAINER now, not the modal's body: the body holds the
            rail and the pane side by side and must not scroll them together, or the rail
            would slide away from the section it is naming. The message region is still
            OUTSIDE both, pinned above the footer — which is what `modal-message-in-viewport`
            measures, and why that spec now takes its overflow reading here.
          */}
          <div style={styles.pane} className="cg-setup-pane" data-station-pane="">
            {active === 'channel' && (
              <SetupSection id="channel">
                <ChannelSection health={health} />
              </SetupSection>
            )}

            {active === 'servers' && (
              <SetupSection id="servers">
                {/* `STATION-CHROME-02` §3 — the shared card rhythm, so this tab is built from
                    the same blocks as every other one. The heads used to SHOUT their titles
                    in hand-spelled uppercase; `.cg-card__title` is the one treatment. */}
                <section className="cg-card" aria-label="Primary server">
                  <div className="cg-card__head">
                    <span className="cg-card__title">Primary (A)</span>
                  </div>
                  <div className="cg-card__body">
                    {endpointRows(primary, setPrimary, 'Primary')}
                  </div>
                </section>

                <section className="cg-card" aria-label="Backup server">
                  <div className="cg-card__head">
                    <span className="cg-card__title">Backup (B)</span>
                    <span className="cg-card__spacer" />
                    {backupEnabled ? (
                      <Button aria-label="Remove backup" onClick={() => setBackupEnabled(false)}>
                        Remove backup
                      </Button>
                    ) : (
                      <Button
                        variant="add"
                        aria-label="Add backup"
                        onClick={() => setAddingBackup(true)}
                      >
                        Add backup
                      </Button>
                    )}
                  </div>
                  {backupEnabled ? (
                    <div className="cg-card__body">{endpointRows(backup, setBackup, 'Backup')}</div>
                  ) : (
                    <p className="cg-card__note">
                      No backup declared — single-server operation (B-046: quiet by design).
                    </p>
                  )}
                </section>

                {/*
                  `C-024` — BESIDE THE SERVER HOSTS: a fact ABOUT the two servers above — the
                  address they fetch templates from. 🔴 The bridge is NOT restarted, and nothing
                  here offers to: `connections.set-config` rebuilds template serving on the
                  running process.
                */}
                <section className="cg-card" aria-label="Template serve address">
                  <div className="cg-card__head">
                    <span className="cg-card__title">How those servers reach this machine</span>
                  </div>
                  <div className="cg-card__body">
                    {/* ⚠ This copy deliberately does not say "NO TEMPLATE" — that phrase is the
                        ALARM, asserted ABSENT on a healthy apply, and ambient copy would drain it. */}
                    <span style={styles.status}>
                      The address CasparCG fetches templates from. Leave it empty to derive it. Get
                      it wrong and those servers show live sources with no graphic over them, while
                      CG ADD still reports success.
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
                          not in force — overridden by --template-serve-host. It takes over at the
                          next start without the flag, so it stays editable.
                        </span>
                      </div>
                    )}
                    {serveCandidates.length === 0 ? null : (
                      <div style={styles.candidates}>
                        {/* ⚠ CANDIDATES, NEVER A VERDICT: the bridge enumerates this machine's
                          interfaces; it cannot know which one the plant routes to. */}
                        <span style={styles.status}>
                          Candidates — this machine&apos;s addresses, not a verdict about which one
                          those servers can reach:
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
                        Empty = ephemeral (today&apos;s default). Pin it to make a firewall rule
                        possible.
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
                  </div>
                </section>

                <section className="cg-card" aria-label="Redundancy options">
                  <div className="cg-card__head">
                    <span className="cg-card__title">Redundancy</span>
                  </div>
                  <div className="cg-card__body">
                    <div style={styles.row}>
                      <span style={styles.label}>Strategy</span>
                      <select
                        className="cg-field"
                        style={{ width: 'auto' }}
                        aria-label="Redundancy strategy"
                        value={strategy}
                        onChange={(e) =>
                          setStrategy(e.target.value as ConnectionConfig['strategy'])
                        }
                      >
                        <option value="mirror-sync">mirror-sync</option>
                        <option value="mirror-async">mirror-async</option>
                        <option value="journal-replay">journal-replay</option>
                      </select>
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <input
                          type="checkbox"
                          aria-label="Auto-failover enabled"
                          checked={autoFailover}
                          onChange={(e) => setAutoFailover(e.target.checked)}
                        />
                        auto-failover
                      </label>
                    </div>
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
            )}

            {active === 'sources' && (
              <SetupSection id="sources">
                <SourcesSection report={reporters.sources} />
              </SetupSection>
            )}

            {active === 'delimiters' && (
              <SetupSection id="delimiters">
                <DelimitersSection report={reporters.delimiters} />
              </SetupSection>
            )}

            {active === 'candidate-layers' && (
              <SetupSection id="candidate-layers">
                <CandidateLayersSection
                  report={reporters.candidateLayers}
                  onDirtyChange={markDirty('candidate-layers')}
                  footerSlot={footerSlot}
                />
              </SetupSection>
            )}
          </div>
        </Tabs>
      </div>

      {/*
        §6 — THE SAME SMALL SECOND DIALOG. It adds the record to the Servers DRAFT; APPLY
        SERVERS is still what reaches the bridge, and the dialog says so.
      */}
      {/* `B-240` — the dismissal question, portalled above this dialog like every other
          second-level one. */}
      {dismissDialog}
      {addingBackup && (
        <BackupServerDialog
          onCancel={() => setAddingBackup(false)}
          onAdd={(draft) => {
            setBackup(draft);
            setBackupEnabled(true);
            setAddingBackup(false);
          }}
        />
      )}
    </Modal>
  );
}
