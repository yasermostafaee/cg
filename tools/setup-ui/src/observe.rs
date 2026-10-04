//! The progress bar's ONE source: the engine's real steps, observed — never a timer.
//!
//! - CG Bridge's engine logs every step it finishes to `install.log` as `[label] exit N` (its
//!   `RUN` macro), and ends with `==== done`. The step list below is keyed to those labels, and a
//!   test reads `tools/bridge-installer/cg-bridge.nsi` to prove each label is still there.
//! - The two apps' engine is Tauri's NSIS template, which logs nothing. Its steps are observed
//!   from what it does: the WebView2 runtime registering itself, the main program's bytes landing
//!   on disk, Installed apps naming the new version, and the engine exiting.
//!
//! Within a step the bar moves only where something measurable moves (bytes copied); every other
//! step moves it once, when it is done. The window then eases the DISPLAYED value toward this
//! number — the same doctrine as the splash's rail.

/// What the window shows while installing.
#[derive(Debug, Clone, PartialEq)]
pub struct Progress {
    /// 0..=1, the real amount done.
    pub fraction: f32,
    /// The step running now, 1-based.
    pub step: usize,
    pub of: usize,
    /// The step running now, in words.
    pub words: &'static str,
    /// The engine has started changing the machine: Cancel is no longer possible.
    pub engine_started: bool,
}

struct Step {
    words: &'static str,
    /// The `install.log` label whose line says this step is done (`None`: no line of its own).
    done_at: Option<&'static str>,
    weight: f32,
}

/// CG Bridge's steps, in `cg-bridge.nsi`'s order.
const BRIDGE: &[Step] = &[
    Step {
        words: "Preparing",
        done_at: None,
        weight: 4.0,
    },
    Step {
        words: "Stopping the service",
        done_at: Some("stopping the service (if it runs)"),
        weight: 4.0,
    },
    Step {
        words: "Copying files",
        done_at: None,
        weight: 38.0,
    },
    Step {
        words: "Writing the configuration",
        done_at: Some("writing the configuration"),
        weight: 8.0,
    },
    Step {
        words: "Registering the service",
        done_at: Some("service: a failed exit counts as a failure"),
        weight: 8.0,
    },
    Step {
        words: "Setting folder access",
        done_at: Some("data folder access (contents)"),
        weight: 4.0,
    },
    Step {
        words: "Importing an older state",
        done_at: Some("importing an older state (once)"),
        weight: 6.0,
    },
    Step {
        words: "Adding firewall rules",
        done_at: Some("firewall rules"),
        weight: 10.0,
    },
    Step {
        words: "Checking ports",
        done_at: Some("checking the ports"),
        weight: 4.0,
    },
    Step {
        words: "Starting the service",
        done_at: Some("starting the service"),
        weight: 12.0,
    },
    Step {
        words: "Finishing",
        done_at: None,
        weight: 2.0,
    },
];

/// Every label the progress reader keys on — the test proves the engine still logs each one.
pub const BRIDGE_LABELS: &[&str] = &[
    "stopping the service (if it runs)",
    "writing the configuration",
    "service: a failed exit counts as a failure",
    "data folder access (contents)",
    "importing an older state (once)",
    "firewall rules",
    "checking the ports",
    "starting the service",
];

/// One `[label] exit N` line of `install.log`.
fn logged_steps(log: &str) -> Vec<(&str, i64)> {
    log.lines()
        .filter_map(|l| {
            let l = l.trim_end();
            let rest = l.strip_prefix('[')?;
            let (label, tail) = rest.split_once("] exit ")?;
            Some((label, tail.trim().parse().ok()?))
        })
        .collect()
}

fn weigh(steps: &[Step], done: usize, within: f32) -> (f32, usize) {
    let total: f32 = steps.iter().map(|s| s.weight).sum();
    let finished: f32 = steps[..done.min(steps.len())]
        .iter()
        .map(|s| s.weight)
        .sum();
    let current = steps
        .get(done)
        .map(|s| s.weight * within.clamp(0.0, 0.98))
        .unwrap_or(0.0);
    ((finished + current) / total, done)
}

/// CG Bridge's progress. `log` is what the engine appended to `install.log` since this run started;
/// `prepared` is the setup's own unpacking (1.0 once done); `copied`/`expected` are the program
/// files' bytes.
pub fn bridge(
    log: &str,
    prepared: f32,
    copied: u64,
    expected: u64,
    engine_started: bool,
) -> Progress {
    let lines = logged_steps(log);
    let has = |label: &str| lines.iter().any(|(l, _)| *l == label);
    let mut done = 0usize;
    let mut within = 0.0f32;
    if prepared >= 1.0 && engine_started {
        done = 1;
        for (i, step) in BRIDGE.iter().enumerate().skip(1) {
            let complete = match step.done_at {
                Some(label) => has(label),
                // Copying is done once the configuration step (the next one) has logged, or the
                // bytes are all there; Finishing once the log says `==== done`.
                None if step.words == "Copying files" => {
                    has("writing the configuration") || (expected > 0 && copied >= expected)
                }
                None => log.contains("==== done"),
            };
            if complete {
                done = i + 1;
            } else {
                break;
            }
        }
        if BRIDGE.get(done).map(|s| s.words) == Some("Copying files") && expected > 0 {
            within = copied as f32 / expected as f32;
        }
    } else {
        within = prepared;
    }
    let (fraction, done) = weigh(BRIDGE, done, within);
    let step = (done + 1).min(BRIDGE.len());
    Progress {
        fraction,
        step,
        of: BRIDGE.len(),
        words: BRIDGE[step - 1].words,
        engine_started,
    }
}

/// Why CG Bridge's engine stopped, in words, from its log: the step that failed, or `None`.
pub fn bridge_failure(log: &str) -> Option<&'static str> {
    let failed = |label: &str| {
        logged_steps(log)
            .iter()
            .any(|(l, code)| *l == label && *code != 0)
    };
    if failed("writing the configuration") {
        Some("Writing the configuration failed.")
    } else if failed("registering the service") {
        Some("Registering the service failed.")
    } else {
        None
    }
}

/// The first warning CG Bridge's engine wrote under `WARNINGS:`, as one line.
pub fn bridge_warning(log: &str) -> Option<String> {
    let block = log.split("WARNINGS:").nth(1)?;
    let line = block.lines().map(str::trim).find(|l| l.starts_with("- "))?;
    let text = line.trim_start_matches("- ").trim();
    let text = text
        .strip_suffix(':')
        .map(|t| format!("{t}."))
        .unwrap_or_else(|| text.to_string());
    (!text.is_empty()).then_some(text)
}

/// What the app installers' engine has visibly done.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct AppSignals {
    /// The setup's own unpacking, 0..=1.
    pub prepared: f32,
    pub engine_started: bool,
    /// The WebView2 runtime was missing when the install started.
    pub webview2_needed: bool,
    /// …and has registered itself since.
    pub webview2_present: bool,
    /// Bytes of the main program written since the engine started, and how many it has.
    pub main_copied: u64,
    pub main_expected: u64,
    /// Installed apps names the new version.
    pub registered: bool,
}

const APP_WITH_WEBVIEW2: &[Step] = &[
    Step {
        words: "Preparing",
        done_at: None,
        weight: 4.0,
    },
    Step {
        words: "Installing the WebView2 runtime",
        done_at: None,
        weight: 46.0,
    },
    Step {
        words: "Copying files",
        done_at: None,
        weight: 38.0,
    },
    Step {
        words: "Registering",
        done_at: None,
        weight: 6.0,
    },
    Step {
        words: "Creating shortcuts",
        done_at: None,
        weight: 6.0,
    },
];
const APP: &[Step] = &[
    Step {
        words: "Preparing",
        done_at: None,
        weight: 5.0,
    },
    Step {
        words: "Copying files",
        done_at: None,
        weight: 80.0,
    },
    Step {
        words: "Registering",
        done_at: None,
        weight: 8.0,
    },
    Step {
        words: "Creating shortcuts",
        done_at: None,
        weight: 7.0,
    },
];

/// CG Control's or CG Designer's progress.
pub fn app(s: AppSignals) -> Progress {
    let steps = if s.webview2_needed {
        APP_WITH_WEBVIEW2
    } else {
        APP
    };
    let copied_all = s.main_expected > 0 && s.main_copied >= s.main_expected;
    let mut done = 0usize;
    let mut within = s.prepared;
    if s.prepared >= 1.0 && s.engine_started {
        done = 1;
        within = 0.0;
        if s.webview2_needed {
            // The engine installs WebView2 first, then copies: bytes landing mean it is done.
            if s.webview2_present || s.main_copied > 0 {
                done = 2;
            }
        }
        let copy_index = if s.webview2_needed { 2 } else { 1 };
        if done == copy_index {
            if copied_all || s.registered {
                done = copy_index + 1;
            } else if s.main_expected > 0 {
                within = s.main_copied as f32 / s.main_expected as f32;
            }
        }
        if done == copy_index + 1 && s.registered {
            done = copy_index + 2;
        }
    }
    let (fraction, done) = weigh(steps, done, within);
    let step = (done + 1).min(steps.len());
    Progress {
        fraction,
        step,
        of: steps.len(),
        words: steps[step - 1].words,
        engine_started: s.engine_started,
    }
}

/// Why the apps' engine stopped, in words, from the step it was on.
pub fn app_failure(at: &Progress, product: &str) -> String {
    match at.words {
        "Installing the WebView2 runtime" => "The WebView2 runtime could not be installed.".into(),
        "Copying files" => format!("{product}'s files could not be written."),
        "Preparing" => "Setup could not start its installer.".into(),
        _ => format!("{product} could not be registered."),
    }
}

/// Compare two `major.minor.patch` versions; anything unreadable compares as 0.
pub fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parts = |v: &str| -> Vec<u64> {
        v.trim()
            .split(['.', '-', '+'])
            .take(3)
            .map(|p| p.parse().unwrap_or(0))
            .collect()
    };
    let (pa, pb) = (parts(a), parts(b));
    for i in 0..3 {
        let (x, y) = (
            pa.get(i).copied().unwrap_or(0),
            pb.get(i).copied().unwrap_or(0),
        );
        if x != y {
            return x.cmp(&y);
        }
    }
    std::cmp::Ordering::Equal
}

#[cfg(test)]
mod tests {
    use super::*;

    const NSI: &str = include_str!("../../bridge-installer/cg-bridge.nsi");

    #[test]
    fn every_label_the_reader_keys_on_is_still_logged_by_the_engine() {
        for label in BRIDGE_LABELS {
            assert!(
                NSI.contains(&format!("!insertmacro RUN \"{label}\"")),
                "cg-bridge.nsi no longer logs [{label}] — the progress bar would stall there"
            );
        }
        // And every step's label is one of them.
        for step in BRIDGE {
            if let Some(label) = step.done_at {
                assert!(BRIDGE_LABELS.contains(&label));
            }
        }
        assert!(NSI.contains("==== done"));
        assert!(NSI.contains("WARNINGS:"));
        assert!(NSI.contains("!insertmacro RUN \"registering the service\""));
    }

    const LOG: &str = "\r\n==== CG Bridge 0.10.0 setup /S\r\n\
[stopping the service (if it runs)] exit 0\r\n\r\n\
[writing the configuration] exit 0\r\n\r\n\
[registering the service] exit 0\r\n\r\n\
[service: automatic start, its own account] exit 0\r\n\r\n\
[service: description] exit 0\r\n\r\n\
[service: restart on failure] exit 0\r\n\r\n\
[service: a failed exit counts as a failure] exit 0\r\n\r\n";

    #[test]
    fn the_bridge_bar_follows_the_logged_steps() {
        let start = bridge("", 1.0, 0, 1000, true);
        assert_eq!((start.step, start.words), (2, "Stopping the service"));
        let stopped = bridge(
            "[stopping the service (if it runs)] exit 0\r\n",
            1.0,
            400,
            1000,
            true,
        );
        assert_eq!(stopped.words, "Copying files");
        let half = stopped.fraction;
        let more = bridge(
            "[stopping the service (if it runs)] exit 0\r\n",
            1.0,
            900,
            1000,
            true,
        );
        assert!(
            more.fraction > half,
            "bytes move the bar inside the copy step"
        );
        let later = bridge(LOG, 1.0, 1000, 1000, true);
        assert_eq!(later.words, "Setting folder access");
        assert!(later.fraction > more.fraction);
        let done = bridge(&format!("{LOG}[data folder access] exit 0\r\n[data folder access (contents)] exit 0\r\n[importing an older state (once)] exit 0\r\n[firewall rules] exit 0\r\n[checking the ports] exit 0\r\n[starting the service] exit 0\r\n==== done\r\n"), 1.0, 1000, 1000, true);
        assert_eq!(done.fraction, 1.0);
        assert_eq!(done.step, done.of);
    }

    #[test]
    fn preparing_is_the_setups_own_unpacking() {
        let p = bridge("", 0.5, 0, 1000, false);
        assert_eq!(p.words, "Preparing");
        assert!(p.fraction > 0.0 && p.fraction < 0.05);
        assert!(!p.engine_started);
    }

    #[test]
    fn a_failed_configuration_is_named() {
        let log = "[stopping the service (if it runs)] exit 0\r\n[writing the configuration] exit 1\r\nrefused\r\n";
        assert_eq!(
            bridge_failure(log),
            Some("Writing the configuration failed.")
        );
        assert_eq!(bridge_failure(LOG), None);
    }

    #[test]
    fn the_first_warning_is_one_line() {
        let log = "WARNINGS:\r\n- A firewall rule was not added: consoles on other machines may not reach CG Bridge.\r\n- The service did not start; see x.\r\n==== done\r\n";
        assert_eq!(
            bridge_warning(log).as_deref(),
            Some("A firewall rule was not added: consoles on other machines may not reach CG Bridge.")
        );
        let ports = "WARNINGS:\r\n- A port CG Bridge uses is reserved by Windows:\r\n5280 5280\r\n==== done";
        assert_eq!(
            bridge_warning(ports).as_deref(),
            Some("A port CG Bridge uses is reserved by Windows.")
        );
        assert_eq!(bridge_warning("==== done"), None);
    }

    #[test]
    fn the_app_bar_waits_on_webview2_then_follows_the_bytes() {
        let mut s = AppSignals {
            prepared: 1.0,
            engine_started: true,
            webview2_needed: true,
            main_expected: 100,
            ..AppSignals::default()
        };
        assert_eq!(app(s).words, "Installing the WebView2 runtime");
        let waiting = app(s).fraction;
        s.webview2_present = true;
        s.main_copied = 50;
        assert_eq!(app(s).words, "Copying files");
        assert!(app(s).fraction > waiting);
        s.main_copied = 100;
        assert_eq!(app(s).words, "Registering");
        s.registered = true;
        assert_eq!(app(s).words, "Creating shortcuts");
        assert!(
            app(s).fraction < 1.0,
            "the engine's exit, not a guess, ends the bar"
        );
    }

    #[test]
    fn without_webview2_there_are_four_steps() {
        let s = AppSignals {
            prepared: 1.0,
            engine_started: true,
            main_expected: 10,
            ..Default::default()
        };
        let p = app(s);
        assert_eq!((p.step, p.of, p.words), (2, 4, "Copying files"));
    }

    #[test]
    fn versions_compare_by_number() {
        use std::cmp::Ordering::*;
        assert_eq!(compare_versions("0.9.1", "0.10.0"), Less);
        assert_eq!(compare_versions("0.10.0", "0.10.0"), Equal);
        assert_eq!(compare_versions("1.0.0", "0.10.9"), Greater);
    }
}
