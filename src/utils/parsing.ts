// Shared DD.MM.YYYY <-> Date conversion and voice-input number normalization.
// Split out of EntryForm.tsx so non-component code isn't exported from a
// component module (breaks Fast Refresh) and so MoodForm can reuse it.

export function ddmmyyyyToDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(d.getTime()) ? null : d;
}

export function dateToDdmmyyyy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

const WORD_TO_DIGIT: Record<string, string> = {
  'ноль': '0', 'нуль': '0',
  'один': '1', 'одна': '1', 'раз': '1',
  'два': '2', 'две': '2',
  'три': '3', 'четыре': '4', 'пять': '5',
  'шесть': '6', 'семь': '7', 'восемь': '8',
  'девять': '9', 'десять': '10',
};

export function normalizeNumericText(text: string): string {
  const trimmed = text.trim().toLowerCase();
  let digits: string | null = null;
  if (WORD_TO_DIGIT[trimmed]) digits = WORD_TO_DIGIT[trimmed];
  else {
    const match = trimmed.match(/\d+/);
    if (match) digits = match[0];
  }
  if (digits === null) return text.trim();
  // Ratings are 0–10; keep only an in-range value so the picker stays consistent.
  const n = Number(digits);
  return n >= 0 && n <= 10 ? String(n) : '';
}
