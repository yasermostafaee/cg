//! `RELEASE-0111-01` Part A (`P-065`) — **"CG Bridge runs on a separate server (not on the Playout
//! machine)"**: the page CG Bridge's setup asks it on, and what that page hands the engine.
//!
//! The engine (CG Bridge's NSIS installer, unchanged) already takes everything a separate server needs on
//! its command line — `/PLAYOUT=`, `/AMCPHOST=`, `/BRIDGEADDRESS=` — and writes them to
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

use crate::address::{
    bare_host, host_of_address, is_loopback, normalise_playout_address, NOT_A_PLAYOUT_ADDRESS,
};
use crate::field::Field;

/// What the engine writes when it is given nothing on a Playout machine (`cg-bridge.nsi`'s
/// `DEFAULT_PLAYOUT`) — and what an unticked page passes to a machine that WAS a separate server.
pub const PLAYOUT_ON_THIS_MACHINE: &str = "http://127.0.0.1:8080";
pub const AMCP_ON_THIS_MACHINE: &str = "127.0.0.1";

/// The engine's three options, spelled as its `GetOptions` reads them.
pub const OPTIONS: [&str; 3] = ["/PLAYOUT=", "/AMCPHOST=", "/BRIDGEADDRESS="];

// ── The page's words. The checkbox's is the owner's own (RELEASE-0111-01 §A1). ────────────────
pub const SEPARATE_LABEL: &str = "CG Bridge runs on a separate server (not on the Playout machine)";
pub const PLAYOUT_LABEL: &str = "Playout address";
pub const AMCP_LABEL: &str = "CasparCG (AMCP) host";
pub const ADDRESS_LABEL: &str = "This server's address";
pub const OTHER_LABEL: &str = "Other";
/// The Playout field's placeholder: what to type, in the form CG Control's first question takes.
pub const PLAYOUT_PLACEHOLDER: &str = "IP or name · :port if not 8080";

pub const TYPE_THE_PLAYOUT: &str = "Type the Playout's address.";
pub const NOT_THE_PLAYOUT: &str = "That is this server. Type the Playout machine's address.";
pub const TYPE_A_HOST: &str = "Type CasparCG's host.";
pub const NOT_A_HOST: &str = "That is not a host. Type an IPv4 address or a name, with no port.";
pub const CHOOSE_AN_ADDRESS: &str = "Choose this server's address.";
pub const NOT_AN_ADDRESS: &str = "That is not an address. Type an IPv4 address or a name.";
pub const NOT_LOOPBACK: &str = "The Playout cannot reach this server on a loopback address.";

/// `cg-bridge.json`'s three values, as an installed CG Bridge stores them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StoredBridge {
    pub playout: Option<String>,
    pub amcp_host: Option<String>,
    pub bridge_address: Option<String>,
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
            playout: s("playoutAddress"),
            amcp_host: s("amcpHost"),
            bridge_address: s("bridgeAddress"),
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
    pub address: Option<&'static str>,
}

impl Refusals {
    pub fn none(&self) -> bool {
        self.playout.is_none() && self.amcp.is_none() && self.address.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerSetup {
    pub separate: bool,
    pub playout: Field,
    pub amcp: Field,
    /// The AMCP host was typed by the user: it no longer follows the Playout's host.
    pub amcp_edited: bool,
    pub choice: AddressChoice,
    pub other: Field,
    /// This machine's IPv4 addresses, loopback never among them.
    pub addresses: Vec<String>,
    /// The machine was set up as a separate server (stored, or on the command line).
    pub was_separate: bool,
    /// The refusals the last Install press found; shown beside the fields until the value changes.
    pub shown: Refusals,
}

impl ServerSetup {
    /// The page as it opens: from the command line's three options when given, else from the stored
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
        let playout = pick(&given.playout, stored.map(|s| &s.playout));
        let amcp = pick(&given.amcp_host, stored.map(|s| &s.amcp_host));
        let address = pick(&given.bridge_address, stored.map(|s| &s.bridge_address));
        let effective = StoredBridge {
            playout: playout.clone(),
            amcp_host: amcp.clone(),
            bridge_address: address.clone(),
        };
        let was_separate = effective.is_separate();
        let mut setup = ServerSetup {
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
            addresses,
            was_separate,
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
        if !self.separate {
            return Refusals::default();
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
            Some(TYPE_A_HOST)
        } else {
            match bare_host(self.amcp.text()) {
                None => Some(NOT_A_HOST),
                Some(h) if is_loopback(&h) => Some(NOT_THE_PLAYOUT),
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
        }
    }

    /// The options the engine is given, as a command-line user would type them — `None`: none, the
    /// command line passes through as it was. Only called once `judge()` refuses nothing.
    pub fn engine_options(&self) -> Option<Vec<String>> {
        if self.separate {
            let playout = normalise_playout_address(self.playout.text())?;
            let amcp = bare_host(self.amcp.text())?;
            let address = bare_host(&self.bridge_address()?)?;
            return Some(vec![
                format!("{}{playout}", OPTIONS[0]),
                format!("{}{amcp}", OPTIONS[1]),
                format!("{}{address}", OPTIONS[2]),
            ]);
        }
        self.was_separate.then(|| {
            vec![
                format!("{}{PLAYOUT_ON_THIS_MACHINE}", OPTIONS[0]),
                format!("{}{AMCP_ON_THIS_MACHINE}", OPTIONS[1]),
            ]
        })
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
                amcp: Some(TYPE_A_HOST),
                address: Some(CHOOSE_AN_ADDRESS),
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
            }
        );
        s.playout.set("127.0.0.1:8080");
        s.amcp.set("localhost");
        assert_eq!(s.judge().playout, Some(NOT_THE_PLAYOUT));
        assert_eq!(s.judge().amcp, Some(NOT_THE_PLAYOUT));
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
        };
        let s = ServerSetup::new(Some(&stored), &given, ips());
        assert!(s.separate);
        assert_eq!(s.playout.text(), "http://192.0.2.30:8080");
        assert_eq!(s.choice, AddressChoice::Listed(0));
    }
}
