//! 🔴 `D-162` (CG Designer) / `R-094` (CG Control) — **THE WINDOW'S CLOSE, HELD FOR THE PAGE TO
//! ANSWER**: what the shell decides when Windows asks the window to close.
//!
//! ONE decision, shared by both shells (CG Control includes this file with `#[path]`, as it does
//! `keyboard_language.rs`), and std-only on purpose, so it is tested without a window — `cargo
//! test`, or `rustc --edition 2021 --test` on this file alone. The Tauri half (the three commands
//! and the two builder hooks) is `close_window.rs`.
//!
//! - **Nothing holds the window until the page does.** The page holds the close (`close_guard`,
//!   armed) once it can answer one; until then every close goes straight through, so a page that
//!   never loaded — blank, or failed before it armed — can always be closed. A navigation lets go
//!   (`page_loading`): the next page holds again only when it can answer.
//! - **A held close is answered by the PAGE** (`close_request_seen`). A page that cannot answer —
//!   hung, its event loop stuck — would otherwise make the window impossible to close, so a close
//!   asked at least `UNANSWERED_AFTER` after an ask that was never answered goes straight through.
//!   Two closes in quick succession on a healthy page are two asks, never a close: the page answers
//!   each one, and its dialog does not stack.
//!
//! ⚠ Windows' shutdown and sign-out are NOT a close request: tao does not process
//! `WM_QUERYENDSESSION` and ends the event loop on `WM_ENDSESSION`, so nothing here is asked
//! (`openspec/changes/close-guard/design.md` §0.3).

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// How long an ask may go unanswered before the NEXT close stops waiting for the page.
pub const UNANSWERED_AFTER: Duration = Duration::from_secs(5);

/// What the shell does with one close request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// No page holds the window: it closes at once, as it always did.
    Close,
    /// The page holds the window: the close is prevented and the page is asked.
    AskPage,
    /// The page holds the window but never answered the last ask: it closes.
    CloseUnanswered,
}

/// The guard's one piece of state, shared by the commands and the window hook.
#[derive(Debug, Default)]
pub struct Guard {
    state: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    armed: bool,
    /// When the page was asked and has not answered yet.
    asked_at: Option<Instant>,
}

impl Guard {
    /// The page holds every close it can be asked about (`true`), or lets go (`false`).
    pub fn set_armed(&self, armed: bool) {
        let mut state = self.lock();
        state.armed = armed;
        state.asked_at = None;
    }

    /// A page started to load: whatever held the window is gone with the page that held it.
    pub fn page_loading(&self) {
        self.set_armed(false);
    }

    /// The page has the ask: it is alive and answering.
    pub fn answered(&self) {
        self.lock().asked_at = None;
    }

    /// Does a page hold the window's close? (Read by the tests; the shell only ever asks
    /// `close_requested`.)
    #[cfg(test)]
    pub fn armed(&self) -> bool {
        self.lock().armed
    }

    /// One close request, at `now`.
    pub fn close_requested(&self, now: Instant) -> Decision {
        let mut state = self.lock();
        if !state.armed {
            return Decision::Close;
        }
        match state.asked_at {
            Some(at) if now.saturating_duration_since(at) >= UNANSWERED_AFTER => {
                state.armed = false;
                state.asked_at = None;
                Decision::CloseUnanswered
            }
            // Still waiting on the first unanswered ask: ask again, and keep ITS time.
            Some(_) => Decision::AskPage,
            None => {
                state.asked_at = Some(now);
                Decision::AskPage
            }
        }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        // A poisoned lock still holds a usable flag; the guard must never panic a close.
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn armed() -> Guard {
        let guard = Guard::default();
        guard.set_armed(true);
        guard
    }

    #[test]
    fn a_window_no_page_holds_closes_at_once() {
        let guard = Guard::default();
        assert_eq!(guard.close_requested(Instant::now()), Decision::Close);
        assert!(!guard.armed());
    }

    #[test]
    fn a_held_window_asks_the_page_instead_of_closing() {
        let guard = armed();
        assert!(guard.armed());
        assert_eq!(guard.close_requested(Instant::now()), Decision::AskPage);
    }

    #[test]
    fn a_page_that_answers_is_asked_again_however_often_the_close_comes() {
        let guard = armed();
        let start = Instant::now();
        for step in 0..4u64 {
            let at = start + Duration::from_secs(step * 10);
            assert_eq!(guard.close_requested(at), Decision::AskPage, "ask {step}");
            guard.answered();
        }
    }

    #[test]
    fn closes_in_quick_succession_before_an_answer_are_asks_not_a_close() {
        let guard = armed();
        let start = Instant::now();
        assert_eq!(guard.close_requested(start), Decision::AskPage);
        assert_eq!(
            guard.close_requested(start + Duration::from_millis(300)),
            Decision::AskPage
        );
        assert_eq!(
            guard.close_requested(start + UNANSWERED_AFTER - Duration::from_millis(1)),
            Decision::AskPage
        );
    }

    #[test]
    fn a_page_that_never_answers_lets_the_next_close_through() {
        let guard = armed();
        let start = Instant::now();
        assert_eq!(guard.close_requested(start), Decision::AskPage);
        assert_eq!(
            guard.close_requested(start + UNANSWERED_AFTER),
            Decision::CloseUnanswered
        );
        // …and it let go: nothing holds the window any more.
        assert!(!guard.armed());
        assert_eq!(
            guard.close_requested(start + UNANSWERED_AFTER),
            Decision::Close
        );
    }

    #[test]
    fn an_answer_restarts_the_wait() {
        let guard = armed();
        let start = Instant::now();
        assert_eq!(guard.close_requested(start), Decision::AskPage);
        guard.answered();
        // Long after the first ask, but the first ask WAS answered: a fresh ask, never a close.
        let later = start + UNANSWERED_AFTER * 3;
        assert_eq!(guard.close_requested(later), Decision::AskPage);
        assert_eq!(
            guard.close_requested(later + UNANSWERED_AFTER),
            Decision::CloseUnanswered
        );
    }

    #[test]
    fn a_page_that_lets_go_is_closed_at_once() {
        let guard = armed();
        guard.set_armed(false);
        assert_eq!(guard.close_requested(Instant::now()), Decision::Close);
    }

    #[test]
    fn a_navigation_lets_go_so_a_page_that_never_arms_stays_closable() {
        let guard = armed();
        let start = Instant::now();
        assert_eq!(guard.close_requested(start), Decision::AskPage);
        guard.page_loading();
        assert!(!guard.armed());
        assert_eq!(guard.close_requested(start), Decision::Close);
    }

    #[test]
    fn arming_again_forgets_a_stale_ask() {
        let guard = armed();
        let start = Instant::now();
        assert_eq!(guard.close_requested(start), Decision::AskPage);
        guard.page_loading();
        guard.set_armed(true);
        // The ask belonged to the page that is gone: the new page is asked, not skipped.
        assert_eq!(
            guard.close_requested(start + UNANSWERED_AFTER * 2),
            Decision::AskPage
        );
    }
}
