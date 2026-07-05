//! Runtime-selected listen port for the optional pxpipe imaging sidecar.
//!
//! pxpipe's own default is `47821`. Unlike the Python backend port (6768, which
//! Apple's `rapportd` sometimes squats), 47821 is rarely contended, so this
//! module keeps the minimal shape: probe the default, else walk a small fallback
//! range for the first bindable port. The chosen port is stored in
//! [`PXPIPE_PORT`]; the sidecar spawn env and (later) the intercept upstream flip
//! read it through [`get`].
//!
//! See docs/plans/06-pxpipe-imaging.md.

use std::sync::atomic::{AtomicU16, Ordering};

pub const DEFAULT_PXPIPE_PORT: u16 = 47821;
pub const FALLBACK_RANGE_START: u16 = 47822;
pub const FALLBACK_RANGE_END: u16 = 47841;

static PXPIPE_PORT: AtomicU16 = AtomicU16::new(DEFAULT_PXPIPE_PORT);

pub fn get() -> u16 {
    PXPIPE_PORT.load(Ordering::Acquire)
}

pub fn set(port: u16) {
    PXPIPE_PORT.store(port, Ordering::Release);
}

/// Test-only: reset the atomic so mutating tests don't leak into siblings in the
/// same binary.
#[cfg(test)]
pub fn reset_for_tests() {
    PXPIPE_PORT.store(DEFAULT_PXPIPE_PORT, Ordering::Release);
}

/// Pick the first bindable port, trying [`DEFAULT_PXPIPE_PORT`] then the fallback
/// range. `try_bind` is called per candidate; the first `true` wins and is stored
/// via [`set`]. Returns `None` if the whole range is occupied.
pub fn select_available(try_bind: impl Fn(u16) -> bool) -> Option<u16> {
    for port in std::iter::once(DEFAULT_PXPIPE_PORT).chain(FALLBACK_RANGE_START..=FALLBACK_RANGE_END)
    {
        if try_bind(port) {
            set(port);
            return Some(port);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_port_is_47821() {
        reset_for_tests();
        assert_eq!(get(), DEFAULT_PXPIPE_PORT);
    }

    #[test]
    fn set_then_get_round_trips() {
        reset_for_tests();
        set(47830);
        assert_eq!(get(), 47830);
        reset_for_tests();
    }

    // These assert only on the returned value, not the shared PXPIPE_PORT atomic:
    // tests in a binary run in parallel, so asserting global state here would race
    // with set_then_get_round_trips.

    #[test]
    fn select_available_prefers_default_when_bindable() {
        assert_eq!(select_available(|_| true), Some(DEFAULT_PXPIPE_PORT));
    }

    #[test]
    fn select_available_falls_back_past_occupied_default() {
        // Default + first two fallbacks occupied; 47824 is the first free one.
        assert_eq!(select_available(|port| port >= 47824), Some(47824));
    }

    #[test]
    fn select_available_returns_none_when_all_occupied() {
        assert_eq!(select_available(|_| false), None);
    }
}
