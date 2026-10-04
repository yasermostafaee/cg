//! `RELEASE-0111-01` Part A — the addresses CG Bridge's separate-server page takes, judged by the
//! ENGINE'S own rules, so the page refuses on Next what the install would otherwise refuse later.
//!
//! The engine is the NSIS installer appended behind this program; it writes the configuration through
//! the bridge's own schema, and the service reads the Playout address with `@cg/shared-ipc`'s
//! `normalisePlayoutAddress` when it starts. Neither can be called from here (the bridge is inside the
//! engine's compressed payload), so the two rules are PORTED, and both sides read one table —
//! `packages/shared-ipc/tests/fixtures/playout-addresses.json` — the TypeScript test proving it is what
//! the engine answers, this file's tests proving the port answers the same. The table's `stricter` list
//! names what the page refuses on purpose although the engine accepts it (a host that is not four
//! numbers, a value with a space the engine's command line would cut, an address with no host).
//!
//! One more rule is the PAGE's, because it is what its checkbox means: on a separate server, a
//! loopback address names that server itself — never the Playout, and never what the Playout's
//! CasparCG can reach CG Bridge at.

/// `@cg/shared-ipc`'s `PLAYOUT_API_PORT`: an `http://` Playout address with no port has it.
pub const PLAYOUT_API_PORT: u16 = 8080;

/// `@cg/shared-ipc`'s `NOT_A_PLAYOUT_ADDRESS` — CG Control's first question refuses with the same words.
pub const NOT_A_PLAYOUT_ADDRESS: &str = "That is not a Playout address.";

/// The Playout address the engine is given (`/PLAYOUT=`) for what was typed, or `None`.
///
/// `normalisePlayoutAddress`, ported: no scheme → `http://`; `http://` with no port → `:8080`; an
/// explicit port kept byte for byte; trailing slashes go; anything that is not an `http(s)` address
/// with a host is `None` — and so is anything in the table's `stricter` list.
pub fn normalise_playout_address(typed: &str) -> Option<String> {
    let trimmed = typed.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    let schemed = if has_scheme(trimmed) {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let slashes = schemed.find("//")? + 2;
    let with_scheme = format!(
        "{}{}",
        &schemed[..slashes],
        schemed[slashes..].trim_end_matches('/')
    );
    let scheme_end = with_scheme.find("://")?;
    let scheme = with_scheme[..scheme_end].to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let start = scheme_end + 3;
    let after = &with_scheme[start..];
    let authority_len = after.find(['/', '?', '#']).unwrap_or(after.len());
    let authority = &after[..authority_len];
    let host_and_port = authority.rsplit('@').next().unwrap_or(authority);
    let (host, port) = split_authority(host_and_port)?;
    if !valid_url_host(host) {
        return None;
    }
    match port {
        Some(digits) if !digits.is_empty() => {
            if !digits.chars().all(|c| c.is_ascii_digit()) || digits.parse::<u32>().ok()? > 65535 {
                return None;
            }
            return Some(with_scheme);
        }
        _ => {}
    }
    if scheme != "http" {
        return Some(with_scheme);
    }
    // `http://host` or `http://host:` — the API port goes in right after the host.
    let host_end = start + authority_len - usize::from(port == Some(""));
    Some(format!(
        "{}:{PLAYOUT_API_PORT}{}",
        &with_scheme[..host_end],
        &with_scheme[start + authority_len..]
    ))
}

/// The host of a Playout address `normalise_playout_address` returned.
pub fn host_of_address(address: &str) -> Option<&str> {
    let start = address.find("://")? + 3;
    let after = &address[start..];
    let authority = &after[..after.find(['/', '?', '#']).unwrap_or(after.len())];
    let host_and_port = authority.rsplit('@').next().unwrap_or(authority);
    split_authority(host_and_port).map(|(host, _)| host)
}

/// A bare host — an IPv4 address or a name, no port, no scheme — as `splitHostPort` reads one with no
/// port, or `None`. A bracketed IPv6 address is refused here (the table's `stricter`): CasparCG and CG
/// Bridge are reached over IPv4.
pub fn bare_host(typed: &str) -> Option<String> {
    let trimmed = typed.trim();
    if trimmed.is_empty()
        || trimmed.contains(|c: char| c.is_whitespace() || "/?#@:[]".contains(c))
        || !valid_url_host(trimmed)
    {
        return None;
    }
    Some(trimmed.to_string())
}

/// Loopback — this machine itself: `127.x.x.x`, `localhost`, `0.0.0.0`, `::1`.
pub fn is_loopback(host: &str) -> bool {
    let h = host.trim().trim_start_matches('[').trim_end_matches(']');
    if h.eq_ignore_ascii_case("localhost") || h.to_ascii_lowercase().ends_with(".localhost") {
        return true;
    }
    if let Ok(ip) = h.parse::<std::net::Ipv4Addr>() {
        return ip.is_loopback() || ip.is_unspecified();
    }
    if let Ok(ip) = h.parse::<std::net::Ipv6Addr>() {
        return ip.is_loopback() || ip.is_unspecified();
    }
    false
}

fn has_scheme(s: &str) -> bool {
    let Some(i) = s.find("://") else {
        return false;
    };
    let scheme = &s[..i];
    let mut chars = scheme.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
}

/// `host` and what follows it: `None` — no port part; `Some("")` — a bare `:`; `Some("8080")`.
fn split_authority(host_and_port: &str) -> Option<(&str, Option<&str>)> {
    if host_and_port.starts_with('[') {
        let close = host_and_port.find(']')?;
        let rest = &host_and_port[close + 1..];
        return match rest.strip_prefix(':') {
            Some(port) => Some((&host_and_port[..=close], Some(port))),
            None if rest.is_empty() => Some((&host_and_port[..=close], None)),
            None => None,
        };
    }
    Some(match host_and_port.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (host_and_port, None),
    })
}

/// The WHATWG URL parser's host, for the hosts an operator types: not empty; a bracketed IPv6 that
/// parses; no forbidden code point; and a host that ends in a number is an IPv4 address — here, four
/// numbers 0–255 (the table's `stricter`: the URL parser also takes `1.2.3` and `999`).
fn valid_url_host(host: &str) -> bool {
    if host.is_empty() {
        return false;
    }
    if let Some(inner) = host.strip_prefix('[') {
        return inner
            .strip_suffix(']')
            .is_some_and(|ip| ip.parse::<std::net::Ipv6Addr>().is_ok());
    }
    const FORBIDDEN: &str = " #%/:<>?@[\\]^|";
    if host
        .chars()
        .any(|c| c.is_control() || c == '\u{7f}' || FORBIDDEN.contains(c))
    {
        return false;
    }
    let last = host.trim_end_matches('.').rsplit('.').next().unwrap_or("");
    let numeric = !last.is_empty()
        && (last.chars().all(|c| c.is_ascii_digit())
            || (last.len() > 2 && last[..2].eq_ignore_ascii_case("0x")));
    if numeric {
        return host.parse::<std::net::Ipv4Addr>().is_ok();
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    const TABLE: &str =
        include_str!("../../../packages/shared-ipc/tests/fixtures/playout-addresses.json");

    #[derive(Deserialize)]
    struct Table {
        playout: Vec<PlayoutRow>,
        host: Vec<HostRow>,
        stricter: Vec<StricterRow>,
    }
    #[derive(Deserialize)]
    struct PlayoutRow {
        typed: String,
        address: Option<String>,
    }
    #[derive(Deserialize)]
    struct HostRow {
        typed: String,
        host: Option<String>,
    }
    #[derive(Deserialize)]
    struct StricterRow {
        typed: String,
        rule: String,
    }

    fn table() -> Table {
        serde_json::from_str(TABLE).expect("the shared table parses")
    }

    #[test]
    fn every_playout_row_is_what_the_engine_answers() {
        let t = table();
        assert!(t.playout.len() >= 20, "the table is read");
        for row in t.playout {
            assert_eq!(
                normalise_playout_address(&row.typed),
                row.address,
                "{:?}",
                row.typed
            );
        }
    }

    #[test]
    fn every_host_row_is_what_the_engine_answers() {
        for row in table().host {
            assert_eq!(bare_host(&row.typed), row.host, "{:?}", row.typed);
        }
    }

    #[test]
    fn the_page_refuses_what_the_table_says_it_refuses_on_purpose() {
        let t = table();
        assert!(!t.stricter.is_empty());
        for row in t.stricter {
            let refused = match row.rule.as_str() {
                "playout" => normalise_playout_address(&row.typed).is_none(),
                _ => bare_host(&row.typed).is_none(),
            };
            assert!(refused, "the page accepts {:?}", row.typed);
        }
    }

    #[test]
    fn the_refusal_is_cg_controls_own_sentence() {
        let setup = include_str!("../../../packages/shared-ipc/src/channels/setup.ts");
        assert!(setup.contains(&format!(
            "export const NOT_A_PLAYOUT_ADDRESS = '{NOT_A_PLAYOUT_ADDRESS}';"
        )));
        assert!(setup.contains(&format!(
            "export const PLAYOUT_API_PORT = {PLAYOUT_API_PORT};"
        )));
    }

    #[test]
    fn hosts_and_loopback() {
        assert_eq!(
            host_of_address("http://192.0.2.10:8080/x"),
            Some("192.0.2.10")
        );
        assert_eq!(
            host_of_address("http://[2001:db8::1]:8080"),
            Some("[2001:db8::1]")
        );
        for l in [
            "127.0.0.1",
            "127.1.2.3",
            "localhost",
            "LocalHost",
            "0.0.0.0",
            "[::1]",
        ] {
            assert!(is_loopback(l), "{l}");
        }
        for n in ["192.0.2.10", "playout.example", "198.51.100.127"] {
            assert!(!is_loopback(n), "{n}");
        }
    }
}
