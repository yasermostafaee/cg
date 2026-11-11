//! `RELEASE-0111-01` Part A (`P-065`) — the CG Bridge Setup page for the Playout Engine, and
//! what that page hands the installer engine.
//!
//! The engine (CG Bridge's NSIS installer) takes everything a separate server needs on
//! its command line — `/PLAYOUT=`, `/AMCPHOST=`, `/BRIDGEADDRESS=`, `/TEXTSOURCEROOT=` — and writes them to
//! `%ProgramData%\CG Bridge\cg-bridge.json` through the bridge's own schema. Until now only a PowerShell
//! line could give them. This page gives EXACTLY those arguments, judged first by the engine's own rules
//! (`address.rs`) so a value the install would turn into a service that cannot start is refused here, in
//! words, beside its field.
//!
//! - **Unticked** (the default) the page passes nothing — today's install, byte for byte — unless the
//!   machine was set up as a separate server and the user unticks it: then it passes this machine's
//!   Playout (`http://127.0.0.1:8080`, AMCP `127.0.0.1`), the values a Playout machine takes.
//! - **Ticked** it passes all three, normalised.
//! - **On an upgrade** the checkbox and the fields start from the stored configuration (or from the
//!   command line, which wins, as it does for the engine); values left as they were are passed as they
//!   were, which keeps them.
//! - **Standalone** (`R-098`) comes from an explicit installer argument or an existing
//!   configuration. The page preserves and edits that station's AMCP endpoint.

use crate::address::{
    bare_host, host_of_address, is_loopback, normalise_playout_address, NOT_A_PLAYOUT_ADDRESS,
};
use crate::field::Field;

/// What the engine writes when it is given nothing on a Playout machine (`cg-bridge.nsi`'s
/// `DEFAULT_PLAYOUT`) — and what an unticked page passes to a machine that WAS a separate server.
pub const PLAYOUT_ON_THIS_MACHINE: &str = "http://127.0.0.1:8080";
pub const AMCP_ON_THIS_MACHINE: &str = "127.0.0.1";

/// The engine options this page owns, spelled as its `GetOptions` reads them.
pub const MODE_OPTION: &str = "/MODE=";
pub const AMCP_PORT_OPTION: &str = "/AMCPPORT=";
pub const OSC_PORT_OPTION: &str = "/OSCPORT=";
pub const OPTIONS: [&str; 4] = [
    "/PLAYOUT=",
    "/AMCPHOST=",
    "/BRIDGEADDRESS=",
    "/TEXTSOURCEROOT=",
];
const PLAYOUT_SWITCH_OPTIONS: [&str; 5] =
    [OPTIONS[0], OPTIONS[1], OPTIONS[2], OPTIONS[3], MODE_OPTION];
const STANDALONE_OPTIONS: [&str; 6] = [
    OPTIONS[0],
    OPTIONS[1],
    OPTIONS[3],
    MODE_OPTION,
    AMCP_PORT_OPTION,
    OSC_PORT_OPTION,
];

// ── The page's words. The checkbox's is the owner's own (RELEASE-0111-01 §A1). ────────────────
pub const PLAYOUT_ENGINE_NAME: &str = "APASAI Playout Engine";
pub const SEPARATE_LABEL: &str = "CG Bridge and APASAI Playout Engine run on separate servers";
pub const PLAYOUT_LABEL: &str = "APASAI Playout Engine address";
pub const PLAYOUT_AMCP_LABEL: &str = "APASAI Playout Engine (AMCP) host";
pub const STANDALONE_AMCP_LABEL: &str = "CasparCG (AMCP) host";
pub const AMCP_PORT_LABEL: &str = "AMCP port";
pub const OSC_PORT_LABEL: &str = "OSC port";
pub const AMCP_PORT_DEFAULT: &str = "5250";
pub const OSC_PORT_DEFAULT: &str = "6251";
pub const ADDRESS_LABEL: &str = "This server's address";
pub const TEXT_SOURCE_LABEL: &str = "Shared files folder";
pub const TEXT_SOURCE_PLACEHOLDER: &str = r"Optional · e.g. \\server\news-text";
pub const OTHER_LABEL: &str = "Other";
/// The Playout field's placeholder: what to type, in the form CG Control's first question takes.
pub const PLAYOUT_PLACEHOLDER: &str = "IP or name · :port if not 8080";

pub const TYPE_THE_PLAYOUT: &str = "Type the APASAI Playout Engine address.";
pub const NOT_THE_PLAYOUT: &str = "That is this server. Type the APASAI Playout Engine address.";
pub const TYPE_PLAYOUT_AMCP_HOST: &str = "Type the APASAI Playout Engine AMCP host.";
pub const NOT_PLAYOUT_AMCP_HOST: &str =
    "That is this server. Type the APASAI Playout Engine AMCP host.";
pub const NOT_A_HOST: &str = "That is not a host. Type an IPv4 address or a name, with no port.";
pub const CHOOSE_AN_ADDRESS: &str = "Choose this server's address.";
pub const NOT_AN_ADDRESS: &str = "That is not an address. Type an IPv4 address or a name.";
pub const NOT_LOOPBACK: &str =
    "APASAI Playout Engine cannot reach this server on a loopback address.";
pub const NOT_A_TEXT_SOURCE: &str = "Choose an existing folder this server can read.";
pub const NOT_A_PORT: &str = "Enter a port from 1 to 65535.";
pub const RESERVED_OSC_PORT: &str = "6250 is reserved. Choose another OSC port.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BridgeMode {
    Playout,
    Standalone,
}

impl BridgeMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "playout" => Some(Self::Playout),
            "standalone" => Some(Self::Standalone),
            _ => None,
        }
    }
}

fn raw_port(field: &Field, default: &str) -> Option<u16> {
    let value = field.text().trim();
    let value = if value.is_empty() { default } else { value };
    value.parse::<u16>().ok().filter(|port| *port > 0)
}

/// The `cg-bridge.json` values this setup page owns.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StoredBridge {
    pub mode: Option<BridgeMode>,
    pub playout: Option<String>,
    pub amcp_host: Option<String>,
    pub amcp_port: Option<String>,
    pub osc_port: Option<String>,
    pub bridge_address: Option<String>,
    pub text_source_root: Option<String>,
}

impl StoredBridge {
    /// Read from the configuration file's JSON; `None` for anything that is not one.
    pub fn from_json(raw: &[u8]) -> Option<StoredBridge> {
        let text = std::str::from_utf8(raw).ok()?;
        // Notepad's BOM is not the file's content (the bridge reads it the same way).
        let value: serde_json::Value =
            serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
        let s = |key: &str| {
            value
                .get(key)
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(String::from)
        };
        Some(StoredBridge {
            mode: s("mode").as_deref().and_then(BridgeMode::parse),
            playout: s("playoutAddress"),
            amcp_host: s("amcpHost"),
            amcp_port: value
                .get("amcpPort")
                .and_then(serde_json::Value::as_u64)
                .map(|p| p.to_string()),
            osc_port: value
                .get("oscPort")
                .and_then(serde_json::Value::as_u64)
                .map(|p| p.to_string()),
            bridge_address: s("bridgeAddress"),
            text_source_root: s("textSourceRoot"),
        })
    }

    /// The values only a separate server stores: an AMCP host that is not this machine, or an address
    /// CasparCG fetches templates from. (A Playout address alone decides nothing: a Playout machine may
    /// name its own Playout by its network address.)
    pub fn is_separate(&self) -> bool {
        self.amcp_host.as_deref().is_some_and(|h| !is_loopback(h)) || self.bridge_address.is_some()
    }
}

/// Which of this server's addresses CasparCG reaches it at.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressChoice {
    None,
    /// One of `ServerSetup::addresses`.
    Listed(usize),
    /// Typed in `ServerSetup::other`.
    Other,
}

/// Each field's refusal, in words; `None` — it may go to the engine.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Refusals {
    pub playout: Option<&'static str>,
    pub amcp: Option<&'static str>,
    pub amcp_port: Option<&'static str>,
    pub osc_port: Option<&'static str>,
    pub address: Option<&'static str>,
    pub text_source: Option<&'static str>,
}

impl Refusals {
    pub fn none(&self) -> bool {
        self.playout.is_none()
            && self.amcp.is_none()
            && self.amcp_port.is_none()
            && self.osc_port.is_none()
            && self.address.is_none()
            && self.text_source.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerSetup {
    pub standalone: bool,
    pub standalone_host: Field,
    pub amcp_port: Field,
    pub osc_port: Field,
    pub separate: bool,
    pub playout: Field,
    pub amcp: Field,
    /// The AMCP host was typed by the user: it no longer follows the Playout's host.
    pub amcp_edited: bool,
    pub choice: AddressChoice,
    pub other: Field,
    /// The local or UNC folder from which every locked/fixed text file is read.
    pub text_source: Field,
    /// This machine's IPv4 addresses, loopback never among them.
    pub addresses: Vec<String>,
    /// The machine was set up as a separate server (stored, or on the command line).
    pub was_separate: bool,
    was_standalone: bool,
    /// The refusals the last Install press found; shown beside the fields until the value changes.
    pub shown: Refusals,
}

impl ServerSetup {
    /// The page as it opens: from the command line's options when given, else from the stored
    /// configuration, else empty and unticked.
    pub fn new(
        stored: Option<&StoredBridge>,
        given: &StoredBridge,
        mut addresses: Vec<String>,
    ) -> ServerSetup {
        let mut seen = std::collections::HashSet::new();
        addresses.retain(|a| !is_loopback(a) && seen.insert(a.clone()));
        let pick = |g: &Option<String>, s: Option<&Option<String>>| {
            g.clone().or_else(|| s.and_then(Clone::clone))
        };
        let mode = given.mode.or_else(|| stored.and_then(|s| s.mode));
        let standalone = mode == Some(BridgeMode::Standalone);
        let stored_standalone = stored.is_some_and(|s| s.mode == Some(BridgeMode::Standalone));
        let was_standalone = standalone || stored_standalone;
        // An explicit return to Playout starts from its own endpoints. The previously
        // installed standalone host does not identify a separate Playout Engine.
        let stored_endpoints = stored.filter(|_| standalone || !stored_standalone);
        let playout = pick(&given.playout, stored_endpoints.map(|s| &s.playout));
        let amcp = pick(&given.amcp_host, stored_endpoints.map(|s| &s.amcp_host));
        let amcp_port = pick(&given.amcp_port, stored.map(|s| &s.amcp_port));
        let osc_port = pick(&given.osc_port, stored.map(|s| &s.osc_port));
        let address = pick(
            &given.bridge_address,
            stored_endpoints.map(|s| &s.bridge_address),
        );
        let text_source = pick(&given.text_source_root, stored.map(|s| &s.text_source_root));
        let effective = StoredBridge {
            playout: playout.clone(),
            amcp_host: amcp.clone(),
            bridge_address: address.clone(),
            text_source_root: text_source.clone(),
            ..StoredBridge::default()
        };
        let was_separate = !standalone && effective.is_separate();
        let mut setup = ServerSetup {
            standalone,
            standalone_host: Field::new(amcp.as_deref().unwrap_or("")),
            amcp_port: Field::new(amcp_port.as_deref().unwrap_or("")),
            osc_port: Field::new(osc_port.as_deref().unwrap_or("")),
            separate: was_separate,
            playout: Field::new(if was_separate {
                playout.as_deref().unwrap_or("")
            } else {
                ""
            }),
            amcp: Field::default(),
            amcp_edited: false,
            choice: AddressChoice::None,
            other: Field::default(),
            text_source: Field::new(text_source.as_deref().unwrap_or("")),
            addresses,
            was_separate,
            was_standalone,
            shown: Refusals::default(),
        };
        let follows = setup.playout_host();
        match amcp.filter(|_| was_separate) {
            Some(h) => {
                setup.amcp_edited = follows.as_deref() != Some(h.as_str());
                setup.amcp.set(&h);
            }
            None => setup.amcp.set(follows.as_deref().unwrap_or("")),
        }
        setup.choice = match address.filter(|_| was_separate) {
            Some(a) => match setup.addresses.iter().position(|x| x == &a) {
                Some(i) => AddressChoice::Listed(i),
                None => {
                    setup.other.set(&a);
                    AddressChoice::Other
                }
            },
            None if setup.addresses.len() == 1 => AddressChoice::Listed(0),
            None => AddressChoice::None,
        };
        setup
    }

    /// The host the Playout field names, as far as it can be read — what the AMCP host follows.
    pub fn playout_host(&self) -> Option<String> {
        if let Some(address) = normalise_playout_address(self.playout.text()) {
            return host_of_address(&address).map(String::from);
        }
        let t = self.playout.text().trim();
        let t = t.split_once("://").map_or(t, |(_, rest)| rest);
        let t = t.split(['/', '?', '#']).next().unwrap_or("");
        let host = t.rsplit_once(':').map_or(t, |(h, _)| h);
        (!host.is_empty()).then(|| host.to_string())
    }

    /// The Playout field changed: the AMCP host follows it until the user types one of its own.
    pub fn playout_changed(&mut self) {
        if !self.amcp_edited {
            let host = self.playout_host().unwrap_or_default();
            self.amcp.set(&host);
        }
        self.shown.playout = None;
        if !self.amcp_edited {
            self.shown.amcp = None;
        }
    }

    pub fn amcp_changed(&mut self) {
        self.amcp_edited = true;
        self.shown.amcp = None;
    }

    pub fn address_changed(&mut self) {
        self.shown.address = None;
    }

    pub fn text_source_changed(&mut self) {
        self.shown.text_source = None;
    }

    pub fn toggle(&mut self) {
        self.separate = !self.separate;
        self.shown = Refusals::default();
    }

    /// This server's address as chosen or typed (trimmed), or `None`.
    pub fn bridge_address(&self) -> Option<String> {
        match self.choice {
            AddressChoice::Listed(i) => self.addresses.get(i).cloned(),
            AddressChoice::Other => {
                let t = self.other.text().trim();
                (!t.is_empty()).then(|| t.to_string())
            }
            AddressChoice::None => None,
        }
    }

    /// Each field, judged by the engine's rules and by what the checkbox means. Nothing when unticked.
    pub fn judge(&self) -> Refusals {
        let text_source = match self.text_source.text().trim() {
            "" => None,
            value if std::path::Path::new(value).is_dir() => None,
            _ => Some(NOT_A_TEXT_SOURCE),
        };
        if self.standalone {
            let host = self.standalone_host.text().trim();
            let amcp = (!host.is_empty() && bare_host(host).is_none()).then_some(NOT_A_HOST);
            let amcp_port = raw_port(&self.amcp_port, AMCP_PORT_DEFAULT)
                .is_none()
                .then_some(NOT_A_PORT);
            let osc_port = match raw_port(&self.osc_port, OSC_PORT_DEFAULT) {
                None => Some(NOT_A_PORT),
                Some(6250) => Some(RESERVED_OSC_PORT),
                _ => None,
            };
            return Refusals {
                amcp,
                amcp_port,
                osc_port,
                text_source,
                ..Refusals::default()
            };
        }
        if !self.separate {
            return Refusals {
                text_source,
                ..Refusals::default()
            };
        }
        let playout = if self.playout.text().trim().is_empty() {
            Some(TYPE_THE_PLAYOUT)
        } else {
            match normalise_playout_address(self.playout.text()) {
                None => Some(NOT_A_PLAYOUT_ADDRESS),
                Some(a) if host_of_address(&a).is_some_and(is_loopback) => Some(NOT_THE_PLAYOUT),
                Some(_) => None,
            }
        };
        let amcp = if self.amcp.text().trim().is_empty() {
            Some(TYPE_PLAYOUT_AMCP_HOST)
        } else {
            match bare_host(self.amcp.text()) {
                None => Some(NOT_A_HOST),
                Some(h) if is_loopback(&h) => Some(NOT_PLAYOUT_AMCP_HOST),
                Some(_) => None,
            }
        };
        let address = match self.bridge_address() {
            None => Some(CHOOSE_AN_ADDRESS),
            Some(a) => match bare_host(&a) {
                None => Some(NOT_AN_ADDRESS),
                Some(h) if is_loopback(&h) => Some(NOT_LOOPBACK),
                Some(_) => None,
            },
        };
        Refusals {
            playout,
            amcp,
            address,
            text_source,
            ..Refusals::default()
        }
    }

    /// A standalone page owns its raw AMCP/OSC fields. Playout keeps the legacy CLI port overrides
    /// and a standalone install leaves an explicit template host override in the command line.
    pub fn replaced_options(&self) -> &[&str] {
        if self.standalone {
            &STANDALONE_OPTIONS
        } else if self.was_standalone {
            &PLAYOUT_SWITCH_OPTIONS
        } else {
            &OPTIONS
        }
    }

    /// The options the engine is given, as a command-line user would type them — `None`: none, the
    /// command line passes through as it was. Only called once `judge()` refuses nothing.
    pub fn engine_options(&self) -> Option<Vec<String>> {
        let text_source = self.text_source.text().trim();
        let text_source_option = (!text_source.is_empty()).then(|| {
            let escaped = text_source.replace('"', "");
            format!("{}\"{escaped}\"", OPTIONS[3])
        });
        if self.standalone {
            let host = self.standalone_host.text().trim();
            let host = if host.is_empty() {
                AMCP_ON_THIS_MACHINE
            } else {
                host
            };
            let host = bare_host(host)?;
            let amcp = raw_port(&self.amcp_port, AMCP_PORT_DEFAULT)?;
            let osc = raw_port(&self.osc_port, OSC_PORT_DEFAULT)?;
            let mut options = vec![
                format!("{MODE_OPTION}standalone"),
                format!("{}{host}", OPTIONS[1]),
                format!("{AMCP_PORT_OPTION}{amcp}"),
                format!("{OSC_PORT_OPTION}{osc}"),
            ];
            options.extend(text_source_option);
            return Some(options);
        }
        if self.separate {
            let playout = normalise_playout_address(self.playout.text())?;
            let amcp = bare_host(self.amcp.text())?;
            let address = bare_host(&self.bridge_address()?)?;
            let mut options = vec![
                format!("{}{playout}", OPTIONS[0]),
                format!("{}{amcp}", OPTIONS[1]),
                format!("{}{address}", OPTIONS[2]),
            ];
            if self.was_standalone {
                options.push(format!("{MODE_OPTION}playout"));
            }
            options.extend(text_source_option);
            return Some(options);
        }
        if self.was_separate || self.was_standalone {
            let mut options = vec![
                format!("{}{PLAYOUT_ON_THIS_MACHINE}", OPTIONS[0]),
                format!("{}{AMCP_ON_THIS_MACHINE}", OPTIONS[1]),
            ];
            if self.was_standalone {
                options.push(format!("{MODE_OPTION}playout"));
            }
            options.extend(text_source_option);
            return Some(options);
        }
        text_source_option.map(|option| vec![option])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const IPS: [&str; 2] = ["192.0.2.20", "198.51.100.7"];

    fn ips() -> Vec<String> {
        IPS.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn unticked_by_default_it_passes_nothing_and_judges_nothing() {
        let s = ServerSetup::new(None, &StoredBridge::default(), ips());
        assert!(!s.separate);
        assert_eq!(s.engine_options(), None, "today's install, byte for byte");
        assert!(s.judge().none());
        // Loopback is never offered.
        let t = ServerSetup::new(
            None,
            &StoredBridge::default(),
            vec!["127.0.0.1".into(), "192.0.2.20".into()],
        );
        assert_eq!(t.addresses, vec!["192.0.2.20".to_string()]);
        assert_eq!(
            t.choice,
            AddressChoice::Listed(0),
            "one address is chosen for you"
        );
    }

    #[test]
    fn ticked_and_filled_it_passes_exactly_what_a_command_line_user_types() {
        let mut s = ServerSetup::new(None, &StoredBridge::default(), ips());
        s.toggle();
        s.playout.set("192.0.2.10");
        s.playout_changed();
        assert_eq!(
            s.amcp.text(),
            "192.0.2.10",
            "the AMCP host follows the Playout's"
        );
        s.choice = AddressChoice::Listed(0);
        assert!(s.judge().none());
        assert_eq!(
            s.engine_options().unwrap(),
            vec![
                "/PLAYOUT=http://192.0.2.10:8080",
                "/AMCPHOST=192.0.2.10",
                "/BRIDGEADDRESS=192.0.2.20",
            ]
        );
        // An AMCP host typed by the user stops following.
        s.amcp.set("192.0.2.11");
        s.amcp_changed();
        s.playout.set("http://192.0.2.12:8081");
        s.playout_changed();
        assert_eq!(s.amcp.text(), "192.0.2.11");
    }

    #[test]
    fn each_refusal_is_said_beside_its_field() {
        let mut s = ServerSetup::new(None, &StoredBridge::default(), ips());
        s.toggle();
        assert_eq!(
            s.judge(),
            Refusals {
                playout: Some(TYPE_THE_PLAYOUT),
                amcp: Some(TYPE_PLAYOUT_AMCP_HOST),
                address: Some(CHOOSE_AN_ADDRESS),
                ..Refusals::default()
            }
        );
        s.playout.set("ftp://192.0.2.10");
        s.amcp.set("192.0.2.10:5250");
        s.choice = AddressChoice::Other;
        s.other.set("127.0.0.1");
        assert_eq!(
            s.judge(),
            Refusals {
                playout: Some(NOT_A_PLAYOUT_ADDRESS),
                amcp: Some(NOT_A_HOST),
                address: Some(NOT_LOOPBACK),
                ..Refusals::default()
            }
        );
        s.playout.set("127.0.0.1:8080");
        s.amcp.set("localhost");
        assert_eq!(s.judge().playout, Some(NOT_THE_PLAYOUT));
        assert_eq!(s.judge().amcp, Some(NOT_PLAYOUT_AMCP_HOST));
    }

    #[test]
    fn an_upgrade_opens_on_what_the_server_stores_and_keeps_it() {
        let stored = StoredBridge::from_json(
            br#"{"playoutAddress":"http://192.0.2.10:8080","amcpHost":"192.0.2.10","bridgeAddress":"198.51.100.7","oscPort":6251}"#,
        )
        .unwrap();
        assert!(stored.is_separate());
        let s = ServerSetup::new(Some(&stored), &StoredBridge::default(), ips());
        assert!(s.separate && s.was_separate);
        assert_eq!(s.playout.text(), "http://192.0.2.10:8080");
        assert_eq!(s.amcp.text(), "192.0.2.10");
        assert!(
            !s.amcp_edited,
            "it equals the Playout's host, so it follows it"
        );
        assert_eq!(s.choice, AddressChoice::Listed(1));
        assert_eq!(
            s.engine_options().unwrap(),
            vec![
                "/PLAYOUT=http://192.0.2.10:8080",
                "/AMCPHOST=192.0.2.10",
                "/BRIDGEADDRESS=198.51.100.7",
            ],
            "unchanged values are passed as they were, so they are kept"
        );
        // An address no longer on this machine is offered as typed.
        let moved = StoredBridge {
            bridge_address: Some("203.0.113.5".into()),
            ..stored.clone()
        };
        let m = ServerSetup::new(Some(&moved), &StoredBridge::default(), ips());
        assert_eq!(
            (m.choice, m.other.text()),
            (AddressChoice::Other, "203.0.113.5")
        );
    }

    #[test]
    fn unticking_a_separate_server_makes_it_a_playout_machine_and_a_playout_machine_stays_one() {
        let stored = StoredBridge {
            playout: Some("http://192.0.2.10:8080".into()),
            amcp_host: Some("192.0.2.10".into()),
            bridge_address: Some("192.0.2.20".into()),
            ..StoredBridge::default()
        };
        let mut s = ServerSetup::new(Some(&stored), &StoredBridge::default(), ips());
        s.toggle();
        assert_eq!(
            s.engine_options().unwrap(),
            vec!["/PLAYOUT=http://127.0.0.1:8080", "/AMCPHOST=127.0.0.1"]
        );
        let local = StoredBridge {
            playout: Some("http://127.0.0.1:8080".into()),
            ..StoredBridge::default()
        };
        let p = ServerSetup::new(Some(&local), &StoredBridge::default(), ips());
        assert!(!p.separate);
        assert_eq!(
            p.engine_options(),
            None,
            "a Playout machine's upgrade passes nothing"
        );
    }

    #[test]
    fn the_command_line_wins_over_what_is_stored() {
        let stored = StoredBridge {
            playout: Some("http://127.0.0.1:8080".into()),
            ..StoredBridge::default()
        };
        let given = StoredBridge {
            playout: Some("http://192.0.2.30:8080".into()),
            amcp_host: Some("192.0.2.30".into()),
            bridge_address: Some("192.0.2.20".into()),
            ..StoredBridge::default()
        };
        let s = ServerSetup::new(Some(&stored), &given, ips());
        assert!(s.separate);
        assert_eq!(s.playout.text(), "http://192.0.2.30:8080");
        assert_eq!(s.choice, AddressChoice::Listed(0));
    }

    #[test]
    fn a_shared_text_folder_is_per_server_and_quoted_for_the_engine() {
        let stored = StoredBridge::from_json(
            br#"{"playoutAddress":"http://127.0.0.1:8080","textSourceRoot":"\\\\PLAYOUT02\\share text"}"#,
        )
        .unwrap();
        let s = ServerSetup::new(Some(&stored), &StoredBridge::default(), ips());
        assert_eq!(s.text_source.text(), r"\\PLAYOUT02\share text");
        assert_eq!(
            s.engine_options(),
            Some(vec![
                r#"/TEXTSOURCEROOT="\\PLAYOUT02\share text""#.to_string()
            ])
        );
    }

    #[test]
    fn standalone_requires_an_explicit_mode_and_uses_local_caspar_defaults() {
        let s = ServerSetup::new(None, &StoredBridge::default(), ips());
        assert!(!s.standalone);
        assert_eq!(s.engine_options(), None);
        assert!(!s.replaced_options().contains(&MODE_OPTION));
        let given = StoredBridge {
            mode: Some(BridgeMode::Standalone),
            ..StoredBridge::default()
        };
        let s = ServerSetup::new(None, &given, ips());
        assert!(s.judge().none());
        assert_eq!(
            s.engine_options().unwrap(),
            vec![
                "/MODE=standalone",
                "/AMCPHOST=127.0.0.1",
                "/AMCPPORT=5250",
                "/OSCPORT=6251"
            ]
        );
        assert!(!s.replaced_options().contains(&"/BRIDGEADDRESS="));
    }

    #[test]
    fn standalone_setup_refuses_invalid_raw_host_ports_and_reserved_osc() {
        let given = StoredBridge {
            mode: Some(BridgeMode::Standalone),
            ..StoredBridge::default()
        };
        let mut s = ServerSetup::new(None, &given, ips());
        s.standalone_host.set("host.example:5250");
        s.amcp_port.set("65536");
        s.osc_port.set("6250");
        assert_eq!(
            s.judge(),
            Refusals {
                amcp: Some(NOT_A_HOST),
                amcp_port: Some(NOT_A_PORT),
                osc_port: Some(RESERVED_OSC_PORT),
                ..Refusals::default()
            }
        );
    }

    #[test]
    fn standalone_upgrade_restores_mode_and_ports_and_can_switch_back_explicitly() {
        let stored = StoredBridge::from_json(
            br#"{"mode":"standalone","amcpHost":"192.0.2.55","amcpPort":5260,"oscPort":6261}"#,
        )
        .unwrap();
        let s = ServerSetup::new(Some(&stored), &StoredBridge::default(), ips());
        assert!(s.standalone);
        assert_eq!(
            s.engine_options().unwrap(),
            vec![
                "/MODE=standalone",
                "/AMCPHOST=192.0.2.55",
                "/AMCPPORT=5260",
                "/OSCPORT=6261"
            ]
        );
        let given = StoredBridge {
            mode: Some(BridgeMode::Playout),
            ..StoredBridge::default()
        };
        let s = ServerSetup::new(Some(&stored), &given, ips());
        assert!(s.judge().none());
        assert_eq!(
            s.engine_options().unwrap(),
            vec![
                "/PLAYOUT=http://127.0.0.1:8080",
                "/AMCPHOST=127.0.0.1",
                "/MODE=playout"
            ]
        );
        assert!(!s.replaced_options().contains(&AMCP_PORT_OPTION));
        assert!(s.replaced_options().contains(&MODE_OPTION));
    }
}
