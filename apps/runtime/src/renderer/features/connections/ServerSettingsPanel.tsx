import { useEffect, useMemo, useState } from 'react';
import type { ConnectionConfig, TemplateServeInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { isLoopbackHost } from '../../../shared/loopback.js';
import { useStack } from '../../hooks/useStack.js';
import { isOnAirOrUnsettled } from '../stack/onAir.js';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Modal, ModalAction, modalActionVariant, type ModalMessage } from '../../ui/Modal.js';
import { Notice } from '../../ui/Notice.js';
import { NumericInput } from '../../ui/NumericInput.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

/*
  NO `scrim`, `modal`, `header`, `title` OR `footer` HERE ANY MORE.

  This panel hand-rolled all five, which is how it came to be the one dialog with a
  `Close` BUTTON in its header instead of the ✕ every other dialog uses, the one with
  a SHOUTING title, and the one whose action row sat in its own footer element. All of
  that now comes from `ui/Modal`. What is left below is this dialog's CONTENT styling
  and nothing else — if a chrome style reappears here, the primitive is being bypassed
  again.
*/
const styles = {
  section: {
    border: `1px solid ${colors.border}`,
    borderRadius: '0.25rem',
    padding: '0.6rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  sectionTitle: {
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
  /*
    THREE MESSAGE SPELLINGS ARE GONE FROM HERE — `warning`, `blocked` and `error`.

    This panel had FOUR treatments for what is one thing: a sentence explaining
    the state of the form or the fate of Apply. `blocked` was a red-tinted box,
    `error` was bare `colors.error` text (2.13:1 on this dialog — the illegible
    one), `warning` was a hand-copied duplicate of `Candidate layers`' amber box,
    and `status` was a muted line. The ROLE decides the treatment now, and
    `ui/Notice` is the only place it is written down.

    `status` survives ONLY as body text for a structural fact about the form ("no
    backup declared"), which is not a message about an action at all.
  */
  status: { fontSize: '0.8rem', color: colors.textMuted },
  /*
    `C-024` — THE MASKING TREATMENT, AND WHY IT IS NOT GREY.

    Grey is this app's DISABLED signal. Spending it here would say "you cannot change this",
    which is false and is the opposite of what the operator needs to know: the stored value is
    exactly what takes over at the next boot without the flag, so it must stay editable and must
    stay legible. What is wrong with it is not that it cannot be edited — it is that it is NOT IN
    FORCE RIGHT NOW, and a strike-through says precisely that while keeping the text readable.
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
 * R-010 — the on-air predicate the panel mirrors (the bridge is the authority).
 *
 * `B-213` — it DELEGATES to the one renderer-side spelling in `stack/onAir.ts`, which
 * the header's tally reads too. The status list used to live here as a second copy.
 */
export function anyOnAirOrUnsettled(items: readonly StackItemState[]): number {
  return items.filter(isOnAirOrUnsettled).length;
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

/**
 * R-010 — server connection settings: edit the primary (and optional backup)
 * CasparCG endpoints, strategy, and auto-failover, and APPLY them to the
 * running bridge. Apply is pre-disabled while anything is on air or unsettled
 * (the bridge's gate is authoritative — a refusal reason from a race is
 * surfaced too), and a non-loopback host shows the LAN-exposure warning
 * (template serve + OSC go routable; control stays loopback).
 */
export function ServerSettingsPanel({ open, onClose }: Props): JSX.Element | null {
  const items = useStack();
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
    `C-024` — THE STORED SERVE ADDRESS, AS DRAFT STRINGS.

    Strings rather than `string | undefined` / `number | undefined` because this is a form: the
    empty field is a real state the operator can reach by clearing it, and it MEANS "derive it".
    The absent-vs-empty distinction the schema keeps is resolved by the bridge's one normalizer,
    not re-decided here — a second place deciding what empty means is how the two come to disagree.
  */
  const [serveHost, setServeHost] = useState('');
  const [servePort, setServePort] = useState('');
  /** What is actually IN FORCE, and why — the read that makes the masking possible. */
  const [serveInfo, setServeInfo] = useState<TemplateServeInfo | null>(null);
  const [strategy, setStrategy] = useState<ConnectionConfig['strategy']>('mirror-sync');
  const [autoFailover, setAutoFailover] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

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
      `C-024` — READ WHAT IS IN FORCE ON OPEN, not only after an Apply.

      A panel that could learn about a mask only by CHANGING something would show a wrong value
      for as long as the operator merely looked at it — which is most of the time, and is exactly
      when a wrong readout does its damage.
    */
    void window.cg.connections
      .templateServe()
      .then((info) => {
        if (!cancelled) setServeInfo(info);
      })
      /*
        An OLDER bridge does not know this channel, and a rejected read must not become an
        unhandled rejection that takes the dialog with it. `serveInfo` stays null, so the panel
        makes NO CLAIM about masking rather than asserting "nothing is masked" — the honest shape
        for an answer it could not obtain. Bridge skew itself already has an owner
        (`BridgeSkewBanner`); this is only about not failing loudly in its place.
      */
      .catch(() => undefined);
    const unsubscribe = window.cg.connections.onConfigChanged(applyConfig);
    return () => {
      cancelled = true;
      unsubscribe();
    };
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

      They are spelled differently on purpose and it is not an inconsistency. The host field must
      be CLEARABLE, and a cleared field has to round-trip through the store as `''` or the clear
      cannot be persisted at all — so `''` is sent, and the bridge's normalizer resolves it. The
      port has no such problem: it is a number or it is not there, and `0` already means something
      specific (an explicit ephemeral bind), so an empty port field is simply omitted.
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
    `C-024` — THE MASK COMES FROM THE BRIDGE, NEVER FROM COMPARING VALUES.

    The temptation is to infer "a flag must be set" from `serveInfo.serveHost !== serveHost`. That
    is wrong every time the stored value is empty and the derivation produced something — which is
    the DEFAULT state — so it would show a phantom override on a fresh install. The bridge reports
    the flag layer directly because only the bridge can see a command line.
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
      {/*
        EVERY FIELD HERE CARRIES `cg-field`, and all four were missing it.

        Owner's report: "the bg of inputs in the servers modal are different than
        the others on the App". They were — `.cg-field` is what paints an input as a
        WELL sunk into the panel (`--r-field-bg`), and a bare `<input>` falls back to
        the browser's own white box. `NumericInput` passes `className` STRAIGHT
        THROUGH and deliberately adds nothing (see its note), so a caller that omits
        it gets an unstyled control — which is what these were, ports included.

        `style` still carries only the WIDTH. The look belongs to the one shared
        rule; a local background here would be the second surface that drifts at the
        next change.
      */}
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
    §3 — THE DIALOG'S MESSAGES GO TO THE PRIMITIVE'S PINNED REGION.

    All four of them are the CONSEQUENCE of pressing Apply, or the reason it is
    refused, so all four belong beside the action row rather than at the end of a
    body the operator may have scrolled. Ordered worst-first: a validation error and
    a bridge refusal are why nothing happened; the on-air block is why the button is
    disabled; the status line is what happened when it worked.

    None of the WORDING changes; what changes is that four private treatments
    become two roles, and the illegible red goes.
  */
  const messages: readonly ModalMessage[] = [
    // WHY APPLY WILL NOT HAPPEN is a REFUSAL, not a second red. It wore a
    // red-tinted box of its own; red in this palette means error or destructive
    // intent, and a gate holding a save until the output is clear is neither. It
    // is the ATTENTION case — the same amber `OCCUPIED` and `UNKNOWN` carry.
    ...(onAirCount > 0
      ? [
          {
            role: 'refusal' as const,
            text: `Apply is blocked: ${String(onAirCount)} item(s) are on air or unsettled. Use Remove All (or Out each item) first.`,
          },
        ]
      : []),
    ...(validationError !== null ? [{ role: 'refusal' as const, text: validationError }] : []),
    ...(refusal !== null ? [{ role: 'refusal' as const, text: refusal }] : []),
    // The OUTCOME of a successful Apply. Never amber: dressing a success as a
    // warning drains the warning everywhere it is real.
    ...(status !== null ? [{ role: 'notice' as const, text: status }] : []),
  ];

  return (
    <Modal
      /*
        §1 — SENTENCE CASE, brought to what the majority of dialogs already use.
        It was `SERVER CONNECTION`, the only shouting title besides the audit log's,
        and inventing a third treatment for it was never on offer. The WORDS are
        unchanged; only the case is.
      */
      title="Server connection"
      ariaLabel="Server connection settings"
      size="wide"
      onClose={onClose}
      {...(messages.length > 0 ? { message: messages } : {})}
      footer={
        <>
          {/*
            CANCEL (owner). This dialog had no way out but the ✕ — and it is the one
            dialog in the app where that matters most, because it is a FORM: the
            operator edits hosts and ports into a draft, and until Apply lands none
            of it has been sent. Leaving without applying is a real, deliberate
            choice, and it needs a control that says so rather than a glyph shared
            with "I am finished reading".

            It routes to the same `onClose` as the ✕, Escape and the backdrop — one
            safe path, four ways to reach it. Nothing is sent; the draft is simply
            dropped, and the next open re-reads the live config from the bridge.

            First in DOM order, so Apply keeps the corner every other dialog's
            primary action sits in.
          */}
          <ModalAction actionRole="cancel" onClick={onClose}>
            Cancel
          </ModalAction>
          {/*
            §2 — APPLY IS `primary`, NOT THE AMBER IT WORE.

            It was `caution` — the colour that means THIS WILL INTERRUPT SOMETHING —
            on a button that saves a configuration. A destructive signal spent on a
            non-destructive action drains it everywhere it is real, and this dialog
            is in fact the one that REFUSES to act while anything is on air.
          */}
          <AsyncButton
            variant={modalActionVariant('primary')}
            data-modal-role="primary"
            aria-label="Apply server settings"
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
                🔴 B-162 — THE APPLY THAT SUCCEEDS AND STILL COSTS A SERVER ITS
                GRAPHICS.

                The bridge's own verdict (`unreachable`) is read FIRST, ahead of
                both existing sentences, because it is the only one of the three
                that reports a fault — and the case it reports used to land on
                "Applied. All listeners remain loopback-only.", which is TRUE and
                completely misleading. A loopback template server with a remote
                CasparCG configured means that server fetches ITSELF, gets
                nothing, and shows live sources with no graphic over them, while
                `CG ADD` reports success and health stays green. This message is
                the only place an operator can learn that, so it is a REFUSAL
                (attention), not the success notice.

                It is the bridge's verdict, never re-derived here: the panel
                knows the hosts and could compute it, and a second spelling of
                "who can reach us" is how the two answers come to disagree
                (golden rule 6, B-100/P-012).
              */
              /*
                `C-024` — RE-READ WHAT IS IN FORCE. The apply just changed it, and the readout
                above must not go on describing the previous state. It is a fresh read rather than
                a local patch from the response for the reason the mask itself exists: the panel
                must never compute what is in force: it asks.
              */
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
            APPLY
          </AsyncButton>
        </>
      }
    >
      <section style={styles.section} aria-label="Primary server">
        <span style={styles.sectionTitle}>PRIMARY (A)</span>
        {endpointRows(primary, setPrimary, 'Primary')}
      </section>

      <section style={styles.section} aria-label="Backup server">
        <span style={styles.sectionTitle}>
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
        `C-024` — BESIDE THE SERVER HOSTS, NOT IN A SECTION OF ITS OWN.

        This is a fact ABOUT the two servers above — the address they fetch templates from — so it
        sits with them rather than becoming a "template serving" feature elsewhere in the dialog.
        The operator reaches it in the same visit where they set the hosts it depends on, which is
        also the visit where getting it wrong starts costing graphics.

        🔴 The bridge is NOT restarted, and nothing here offers to. Apply goes through
        `connections.set-config`, which already tears down and rebuilds template serving on the
        running process. The bridge's lifetime stays outside this console.
      */}
      <section style={styles.section} aria-label="Template serve address">
        <span style={styles.sectionTitle}>HOW THOSE SERVERS REACH THIS MACHINE</span>
        {/*
          ⚠ THIS COPY DELIBERATELY DOES NOT SAY "NO TEMPLATE".

          That phrase is the ALARM — the sentence an operator sees only when a configured server
          genuinely cannot fetch the address, and `serverSettingsPanel.dom.test.ts` asserts it is
          ABSENT on a healthy apply. Spending it here as ambient body copy would put it on screen
          permanently and drain it exactly where it is real, which is the same failure as spending
          a destructive colour on a safe action. Describe the consequence; leave the alarm to the
          alarm.
        */}
        <span style={styles.status}>
          The address CasparCG fetches templates from. Leave it empty to derive it. Get it wrong and
          those servers show live sources with no graphic over them, while CG ADD still reports
          success.
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
            {/*
              ⚠ CANDIDATES, NEVER A VERDICT. The bridge enumerates this machine's interfaces; it
              cannot know which one the plant routes to, and on a box with Hyper-V / WSL / VPN /
              Docker adapters the first is routinely wrong. Choosing wrongly is exactly
              `guessLanHost()`'s failure, so this list must not read as an answer.
            */}
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

      <section style={styles.section} aria-label="Redundancy options">
        <div style={styles.row}>
          <span style={styles.label}>Strategy</span>
          {/* Same omission as the inputs above — the audit log's filter select
              already carries `cg-field`, and this one is the odd one out. */}
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

      {/* The remote-host note stays in the BODY: it describes the configuration
          being edited, not the outcome of pressing Apply. The message region is for
          "why that did or did not happen".

          Its TREATMENT is no longer local, though — the amber box here was a
          hand-copied duplicate of the one `Candidate layers` used, i.e. the second
          spelling that makes a shared rule stop being a rule. Placement is this
          dialog's call; what a message LOOKS like is not. `role="note"` keeps it out
          of the alert channel: it is a standing property of the draft, not something
          to announce. */}
      {remoteHosts.length > 0 && (
        <Notice
          noticeRole="refusal"
          aria="note"
          text={`Remote server (${remoteHosts.join(', ')}): the template server and OSC listener will use a LAN address so CasparCG can reach this machine. The control connection stays on 127.0.0.1.`}
        />
      )}
    </Modal>
  );
}
