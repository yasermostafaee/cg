//! 🔴 `CENTRAL-BRIDGE-01` rule 8 (D8) — **THE CONSOLE'S D1 AND D2, FROM THE NATIVE SIDE, WITH NO
//! `Origin`.**
//!
//! A console signs in to the Playout directly, never through CG Bridge: the Playout locks an account
//! out per IP and user name, so a proxy would let one operator's typos lock everyone. A browser's
//! `fetch` always sends `Origin`, which the Playout reads as a page to be CORS-checked; this sends
//! none, so CG Control needs no CORS entry at all.
//!
//! ONE command, and it is not a general HTTP client for the page: it POSTs a JSON body to the
//! Playout's two auth routes and nothing else. The request is written byte by byte — no proxy, no
//! header we did not write — as HTTP/1.0, so the answer is never chunked. It says which of three
//! things happened, because a refresh token's fate depends on it (`2.9.2` §8): the Playout
//! ANSWERED; the request was NOT SENT (no route, refused, no answer to the connect) — its token
//! never left; or it was sent and the answer was LOST — its token may have been used.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

use serde::Serialize;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const ANSWER_TIMEOUT: Duration = Duration::from_secs(15);
/// The Playout's D1 and D2 — the only paths this command will POST to.
const AUTH_PATHS: [&str; 2] = ["/api/cg/auth/token", "/api/cg/auth/refresh"];
/// A D1/D2 answer is a few kilobytes; anything past this is not one.
const MAX_ANSWER_BYTES: u64 = 1 << 20;

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PlayoutAnswer {
    /// The Playout answered: its status and body, as they came.
    Answered { status: u16, body: String },
    /// Never reached the Playout: a refresh token it carried never left, and may be sent again.
    NotSent { reason: String },
    /// Sent, and the answer was lost: a refresh token it carried may have been used.
    Lost { reason: String },
}

/// `http://host[:port]/path` → (host, port, path). Only `http:`: consoles sign in on the Playout's
/// HTTP port, as its own clients do.
fn split_url(url: &str) -> Result<(String, u16, String), String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| format!("CG Control signs in over http:// only, not {url}"))?;
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let path = path.split(['?', '#']).next().unwrap_or("/").to_string();
    let (host, port) = if let Some(bracketed) = authority.strip_prefix('[') {
        let end = bracketed.find(']').ok_or("an IPv6 address needs its closing ]")?;
        let host = &bracketed[..end];
        let port = bracketed[end + 1..].strip_prefix(':').unwrap_or("80");
        (host.to_string(), port)
    } else {
        match authority.rsplit_once(':') {
            Some((h, p)) => (h.to_string(), p),
            None => (authority.to_string(), "80"),
        }
    };
    if host.is_empty() {
        return Err(format!("{url} names no host"));
    }
    let port: u16 = port.parse().map_err(|_| format!("{url} has no valid port"))?;
    Ok((host, port, path))
}

/// Split an HTTP answer into its status and body. `None` when it is not one.
fn parse_answer(raw: &[u8]) -> Option<(u16, String)> {
    let text = String::from_utf8_lossy(raw);
    let (head, body) = text.split_once("\r\n\r\n")?;
    let status_line = head.lines().next()?;
    let mut parts = status_line.split_whitespace();
    let version = parts.next()?;
    if !version.starts_with("HTTP/") {
        return None;
    }
    let status: u16 = parts.next()?.parse().ok()?;
    Some((status, body.to_string()))
}

/// POST `body` to `url` — one of the Playout's auth routes — and say what happened.
pub fn post(url: &str, body: &str) -> PlayoutAnswer {
    let (host, port, path) = match split_url(url) {
        Ok(parts) => parts,
        Err(reason) => return PlayoutAnswer::NotSent { reason },
    };
    if !AUTH_PATHS.contains(&path.as_str()) {
        return PlayoutAnswer::NotSent {
            reason: format!("{path} is not the Playout's sign-in or refresh"),
        };
    }
    let addrs: Vec<SocketAddr> = match (host.as_str(), port).to_socket_addrs() {
        Ok(addrs) => addrs.collect(),
        Err(err) => return PlayoutAnswer::NotSent { reason: format!("{host}: {err}") },
    };
    // IPv4 first: the Playout takes its own clients on IPv4, and a name that also resolves to IPv6
    // must not send the sign-in somewhere the Playout does not listen.
    let mut ordered: Vec<SocketAddr> = addrs.iter().copied().filter(SocketAddr::is_ipv4).collect();
    ordered.extend(addrs.iter().copied().filter(SocketAddr::is_ipv6));
    let mut last_error = format!("{host} has no address");
    let mut stream = None;
    for addr in ordered {
        match TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
            Ok(s) => {
                stream = Some(s);
                break;
            }
            Err(err) => last_error = format!("{addr}: {err}"),
        }
    }
    let Some(mut stream) = stream else {
        return PlayoutAnswer::NotSent { reason: last_error };
    };
    let _ = stream.set_read_timeout(Some(ANSWER_TIMEOUT));
    let _ = stream.set_write_timeout(Some(ANSWER_TIMEOUT));
    let host_header = if host.contains(':') { format!("[{host}]:{port}") } else { format!("{host}:{port}") };
    let request = format!(
        "POST {path} HTTP/1.0\r\nHost: {host_header}\r\nContent-Type: application/json; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    // From the first byte written, the Playout may have read the token: every failure after this
    // point is LOST, never NOT SENT.
    if let Err(err) = stream.write_all(request.as_bytes()) {
        return PlayoutAnswer::Lost { reason: format!("the request could not be written: {err}") };
    }
    let mut raw = Vec::new();
    if let Err(err) = stream.take(MAX_ANSWER_BYTES).read_to_end(&mut raw) {
        return PlayoutAnswer::Lost { reason: format!("no answer: {err}") };
    }
    match parse_answer(&raw) {
        Some((status, body)) => PlayoutAnswer::Answered { status, body },
        None => PlayoutAnswer::Lost { reason: "the answer was not HTTP".to_string() },
    }
}

/// The page's one door to D1/D2. Blocking I/O, so it runs off the main thread.
#[tauri::command]
pub async fn playout_post(url: String, body: String) -> Result<PlayoutAnswer, String> {
    tauri::async_runtime::spawn_blocking(move || post(&url, &body))
        .await
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_split_into_host_port_path() {
        assert_eq!(
            split_url("http://192.0.2.10:8080/api/cg/auth/token").unwrap(),
            ("192.0.2.10".to_string(), 8080, "/api/cg/auth/token".to_string())
        );
        assert_eq!(
            split_url("http://playout/api/cg/auth/refresh?x=1").unwrap(),
            ("playout".to_string(), 80, "/api/cg/auth/refresh".to_string())
        );
        assert_eq!(
            split_url("http://[::1]:8080/api/cg/auth/token").unwrap(),
            ("::1".to_string(), 8080, "/api/cg/auth/token".to_string())
        );
        assert!(split_url("https://playout:8443/api/cg/auth/token").is_err());
    }

    #[test]
    fn only_the_two_auth_routes() {
        assert!(matches!(
            post("http://127.0.0.1:1/api/cg/channels", "{}"),
            PlayoutAnswer::NotSent { .. }
        ));
    }

    #[test]
    fn answers_are_split() {
        let raw = b"HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\n\r\n{\"error\":\"cg_not_licensed\"}";
        assert_eq!(
            parse_answer(raw),
            Some((403, "{\"error\":\"cg_not_licensed\"}".to_string()))
        );
        assert_eq!(parse_answer(b"garbage"), None);
    }

    #[test]
    fn nothing_listening_is_not_sent() {
        // Port 1 on loopback: refused at once — the token never left.
        assert!(matches!(
            post("http://127.0.0.1:1/api/cg/auth/refresh", "{}"),
            PlayoutAnswer::NotSent { .. }
        ));
    }

    /// `CENTRAL-BRIDGE-01` 5.5 / rule 8 — the bytes CG Control writes to the Playout carry NO `Origin`
    /// and NO `X-Apasai-Mirrored`, read off a real socket; control: the instrument read the real
    /// request (the route, the host and the body are there).
    #[test]
    fn the_request_carries_no_origin_and_no_mirror_header() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::thread;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut seen: Vec<u8> = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = socket.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                seen.extend_from_slice(&buf[..n]);
                // The headers end at a blank line; the body is `Content-Length` bytes after it.
                if let Some(end) = seen.windows(4).position(|w| w == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&seen[..end]).to_string();
                    let mut length = 0usize;
                    for line in head.lines() {
                        if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                            length = v.trim().parse().unwrap_or(0);
                        }
                    }
                    if seen.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            socket
                .write_all(b"HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n{\"ok\":true}")
                .unwrap();
            String::from_utf8_lossy(&seen).to_string()
        });

        let answer = post(
            &format!("http://127.0.0.1:{port}/api/cg/auth/token"),
            "{\"username\":\"cg-admin\"}",
        );
        let request = server.join().unwrap();

        // Control: the real request — its route, its host, its body.
        assert!(request.starts_with("POST /api/cg/auth/token HTTP/1.0\r\n"), "{request}");
        assert!(request.contains(&format!("Host: 127.0.0.1:{port}\r\n")), "{request}");
        assert!(request.ends_with("{\"username\":\"cg-admin\"}"), "{request}");
        // The absences.
        let lower = request.to_ascii_lowercase();
        assert!(!lower.contains("\r\norigin:"), "{request}");
        assert!(!lower.contains("x-apasai-mirrored"), "{request}");
        assert!(matches!(answer, PlayoutAnswer::Answered { status: 200, .. }));
    }
}
