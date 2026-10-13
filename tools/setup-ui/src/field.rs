//! `RELEASE-0111-01` Part A — one line of text the user types: its value, its caret, and a whole-value
//! selection. Pure, so the window, UI Automation and the tests drive the same thing.
//!
//! What it takes: printable characters (a pasted line too); Persian and Arabic-Indic digits arrive as
//! their ASCII digits and the Persian decimal separator as `.` — on a Persian keyboard layout the
//! number row types `۱۹۲`, and an address is ASCII; line breaks and tabs never enter a one-line field.

/// A one-line text field.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Field {
    text: String,
    /// In characters, `0..=len`.
    caret: usize,
    /// The whole value is selected: the next character replaces it.
    all: bool,
}

impl Field {
    pub fn new(text: &str) -> Field {
        let text = clean(text);
        let caret = text.chars().count();
        Field {
            text,
            caret,
            all: false,
        }
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn caret(&self) -> usize {
        self.caret
    }

    pub fn all_selected(&self) -> bool {
        self.all && !self.text.is_empty()
    }

    fn len(&self) -> usize {
        self.text.chars().count()
    }

    fn byte_at(&self, chars: usize) -> usize {
        self.text
            .char_indices()
            .nth(chars)
            .map_or(self.text.len(), |(i, _)| i)
    }

    /// Replace the whole value (UI Automation's `SetValue`, a pre-fill).
    pub fn set(&mut self, text: &str) {
        *self = Field::new(text);
    }

    /// Type (or paste) `input` at the caret, replacing a whole-value selection.
    pub fn insert(&mut self, input: &str) {
        let input = clean(input);
        if input.is_empty() {
            return;
        }
        if self.all_selected() {
            self.text.clear();
            self.caret = 0;
        }
        self.all = false;
        let at = self.byte_at(self.caret);
        self.text.insert_str(at, &input);
        self.caret += input.chars().count();
    }

    pub fn backspace(&mut self) {
        if self.all_selected() {
            self.set("");
            return;
        }
        self.all = false;
        if self.caret == 0 {
            return;
        }
        let (from, to) = (self.byte_at(self.caret - 1), self.byte_at(self.caret));
        self.text.replace_range(from..to, "");
        self.caret -= 1;
    }

    pub fn delete(&mut self) {
        if self.all_selected() {
            self.set("");
            return;
        }
        self.all = false;
        if self.caret >= self.len() {
            return;
        }
        let (from, to) = (self.byte_at(self.caret), self.byte_at(self.caret + 1));
        self.text.replace_range(from..to, "");
    }

    pub fn left(&mut self) {
        if self.all_selected() {
            self.caret = 0;
        } else {
            self.caret = self.caret.saturating_sub(1);
        }
        self.all = false;
    }

    pub fn right(&mut self) {
        if !self.all_selected() {
            self.caret = (self.caret + 1).min(self.len());
        }
        self.all = false;
        if self.caret > self.len() {
            self.caret = self.len();
        }
    }

    pub fn home(&mut self) {
        self.caret = 0;
        self.all = false;
    }

    pub fn end(&mut self) {
        self.caret = self.len();
        self.all = false;
    }

    pub fn select_all(&mut self) {
        self.all = true;
        self.caret = self.len();
    }

    /// The text before the caret — what the painter measures to place it.
    pub fn before_caret(&self) -> &str {
        &self.text[..self.byte_at(self.caret)]
    }
}

/// One line, its digits ASCII: what may enter a field.
fn clean(input: &str) -> String {
    input
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| match c {
            '\u{06F0}'..='\u{06F9}' => char::from(b'0' + (c as u32 - 0x06F0) as u8),
            '\u{0660}'..='\u{0669}' => char::from(b'0' + (c as u32 - 0x0660) as u8),
            '\u{066B}' => '.',
            _ => c,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typing_moves_the_caret_and_edits_in_place() {
        let mut f = Field::default();
        f.insert("192.0.2.1");
        f.insert("0");
        assert_eq!((f.text(), f.caret()), ("192.0.2.10", 10));
        f.left();
        f.left();
        f.left();
        f.backspace();
        assert_eq!((f.text(), f.caret()), ("192.0..10", 6));
        f.insert("2");
        f.home();
        f.delete();
        assert_eq!(f.text(), "92.0.2.10");
        f.end();
        f.right();
        assert_eq!(f.caret(), 9);
        assert_eq!(f.before_caret(), "92.0.2.10");
    }

    #[test]
    fn select_all_is_replaced_by_the_next_character_and_cleared_by_backspace() {
        let mut f = Field::new("127.0.0.1");
        f.select_all();
        assert!(f.all_selected());
        f.insert("1");
        assert_eq!(f.text(), "1");
        f.select_all();
        f.backspace();
        assert_eq!(f.text(), "");
        assert!(!f.all_selected(), "an empty field selects nothing");
    }

    #[test]
    fn a_persian_layout_types_ascii_digits_and_a_paste_is_one_line() {
        let mut f = Field::default();
        f.insert("۱۹۲٫۰٫۲٫۱۰");
        assert_eq!(f.text(), "192.0.2.10");
        let mut g = Field::default();
        g.insert("١٠\r\n.0\t");
        assert_eq!(g.text(), "10.0");
    }

    #[test]
    fn a_name_with_more_than_one_byte_per_character_edits_by_character() {
        let mut f = Field::new("پخش.local");
        assert_eq!(f.caret(), 9);
        f.home();
        f.right();
        f.delete();
        assert_eq!(f.text(), "پش.local");
    }
}
