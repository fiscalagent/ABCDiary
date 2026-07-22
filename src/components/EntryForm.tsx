import { useState, useEffect, useCallback, useRef } from 'react';
import type { EntryData, EmotionData, TaskData, TaskStatus, SheetType, DiaryEntry } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ddmmyyyyToDate, dateToDdmmyyyy, normalizeNumericText } from '../utils/parsing';

interface FieldConfig {
  key: string;
  label: string;
  hint: string;
  autoFill?: () => string;
  rows?: number;
}

const EMOTION_FIELDS: FieldConfig[] = [
  {
    key: 'time',
    label: 'Время',
    hint: 'Например: «14:30», «девять тридцать десять» → 09:30–10:00',
    rows: 1,
  },
  {
    key: 'date',
    label: 'Дата',
    hint: 'Скажите «сегодня», «вчера» или дату',
    autoFill: () => dateToDdmmyyyy(new Date()),
    rows: 1,
  },
  { key: 'situation', label: 'Триггерная ситуация', hint: 'Опишите ситуацию, которая произошла' },
  { key: 'thoughts', label: 'Мысли', hint: 'Что вы думали в этот момент?' },
  { key: 'emotions', label: 'Эмоции', hint: 'Какие эмоции вы испытывали?' },
  { key: 'behavior', label: 'Поведение', hint: 'Как вы себя повели, что сделали?' },
];

// Tasks split into two phases:
//   plan      — entered at the start of the day (what / sphere / when / importance)
//   evaluate  — filled after doing the task (difficulty / enjoyment / satisfaction)
// The full task preview (used for editing & evaluate preview) is plan ∪ evaluate.
const TASK_PLAN_FIELDS: FieldConfig[] = [
  {
    key: 'date',
    label: 'Дата',
    hint: 'Скажите «сегодня», «вчера» или дату',
    autoFill: () => dateToDdmmyyyy(new Date()),
    rows: 1,
  },
  { key: 'activity', label: 'Занятие', hint: 'Что планируете сделать?' },
  {
    key: 'sphere',
    label: 'Сфера',
    hint: 'Сфера жизни: работа, здоровье, семья, хобби...',
    rows: 1,
  },
  {
    key: 'time',
    label: 'Когда (планируемое время)',
    hint: 'Например: «14:30», «девять тридцать десять» → 09:30–10:00',
    rows: 1,
  },
  {
    key: 'importance',
    label: 'Важность (0–10)',
    hint: 'Выберите число или назовите его голосом',
    rows: 1,
  },
  {
    key: 'urgency',
    label: 'Срочность (0–10)',
    hint: 'Насколько срочно? Выберите число или назовите голосом',
    rows: 1,
  },
];

const TASK_EVAL_FIELDS: FieldConfig[] = [
  {
    key: 'difficulty',
    label: 'Сложность (0–10)',
    hint: 'Насколько сложно было? Выберите или назовите число',
    rows: 1,
  },
  {
    key: 'enjoyment',
    label: 'Удовольствие во время (0–10)',
    hint: 'Сколько удовольствия получили? Выберите или назовите число',
    rows: 1,
  },
  {
    key: 'pleasure',
    label: 'Удовлетворение после (0–10)',
    hint: 'Насколько приятно итогом? Выберите или назовите число',
    rows: 1,
  },
];

const TASK_FULL_FIELDS: FieldConfig[] = [...TASK_PLAN_FIELDS, ...TASK_EVAL_FIELDS];

export type FormMode = 'plan' | 'evaluate' | 'edit';

function getRecordFields(type: SheetType, mode: FormMode): FieldConfig[] {
  if (type === 'emotions') return EMOTION_FIELDS;
  // Editing walks through every field (so the mic is available on each, just
  // like a new entry); plan = the 5 morning fields; evaluate = the 3 ratings.
  if (mode === 'edit') return TASK_FULL_FIELDS;
  return mode === 'evaluate' ? TASK_EVAL_FIELDS : TASK_PLAN_FIELDS;
}

function getPreviewFields(type: SheetType, mode: FormMode): FieldConfig[] {
  if (type === 'emotions') return EMOTION_FIELDS;
  // Plan preview hides eval fields (no scores yet); evaluate & edit show everything.
  return mode === 'plan' ? TASK_PLAN_FIELDS : TASK_FULL_FIELDS;
}

const NUMERIC_FIELDS = new Set(['importance', 'urgency', 'difficulty', 'pleasure', 'enjoyment']);
const TIME_FIELDS = new Set(['time']);
const DATE_FIELDS = new Set(['date']);

const RU_MONTH: Record<string, number> = {
  'январь': 1, 'января': 1, 'январе': 1, 'янв': 1,
  'февраль': 2, 'февраля': 2, 'феврале': 2, 'фев': 2,
  'март': 3, 'марта': 3, 'марте': 3, 'мар': 3,
  'апрель': 4, 'апреля': 4, 'апреле': 4, 'апр': 4,
  'май': 5, 'мая': 5, 'мае': 5,
  'июнь': 6, 'июня': 6, 'июне': 6, 'июн': 6,
  'июль': 7, 'июля': 7, 'июле': 7, 'июл': 7,
  'август': 8, 'августа': 8, 'августе': 8, 'авг': 8,
  'сентябрь': 9, 'сентября': 9, 'сентябре': 9, 'сен': 9, 'сент': 9,
  'октябрь': 10, 'октября': 10, 'октябре': 10, 'окт': 10,
  'ноябрь': 11, 'ноября': 11, 'ноябре': 11, 'ноя': 11,
  'декабрь': 12, 'декабря': 12, 'декабре': 12, 'дек': 12,
};

function normalizeDateText(text: string): string {
  const raw = text.trim();
  const t = raw.toLowerCase().replace(/[.!?]+$/, '').trim();
  const currentYear = new Date().getFullYear();
  const fmt = (d: number, m: number, y: number | string) =>
    `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;

  // Relative days: «сегодня», «вчера».
  const relativeDays: Record<string, number> = { 'сегодня': 0, 'вчера': -1 };
  if (t in relativeDays) {
    const d = new Date();
    d.setDate(d.getDate() + relativeDays[t]);
    return dateToDdmmyyyy(d);
  }

  // DD.MM.YYYY or DD/MM/YYYY
  let m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return fmt(d, mo, m[3]);
  }

  // DD.MM or DD/MM
  m = t.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return fmt(d, mo, currentYear);
  }

  // "DD MM" or "DD MM YYYY"
  m = t.match(/^(\d{1,2})\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return fmt(d, mo, m[3] || currentYear);
  }

  // "DD месяц" or "DD месяц YYYY"
  m = t.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?$/);
  if (m) {
    const d = +m[1], mo = RU_MONTH[m[2]];
    if (d >= 1 && d <= 31 && mo) return fmt(d, mo, m[3] || currentYear);
  }

  return raw;
}

function parseTimeRange(s: string): { from: string; to: string } {
  const t = s.trim();
  const m = t.match(/^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/);
  if (m) return { from: padHm(m[1]), to: padHm(m[2]) };
  const single = t.match(/^(\d{1,2}:\d{2})$/);
  if (single) return { from: padHm(single[1]), to: '' };
  return { from: '', to: '' };
}

function padHm(s: string): string {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function composeTimeRange(from: string, to: string): string {
  if (!from && !to) return '';
  if (from && to) return `${from}–${to}`;
  return from || to;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Horizontal 0–10 rating slider: tap or drag along the track, value snaps to
// whole numbers. RATING_PAD (half the thumb width) keeps the thumb inside the
// track at both ends. Empty value renders as "–" until the user picks one.
const RATING_PAD = 12;

export function RatingInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const filled = value.trim() !== '';
  const num = filled ? Math.min(10, Math.max(0, Math.round(Number(value) || 0))) : 0;
  const ratio = num / 10;

  const commit = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const usable = rect.width - RATING_PAD * 2;
    const r = usable > 0 ? (clientX - rect.left - RATING_PAD) / usable : 0;
    onChange(String(Math.round(Math.min(1, Math.max(0, r)) * 10)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    commit(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0) return; // only while pressed
    commit(e.clientX);
  };

  const span = `(100% - ${RATING_PAD * 2}px)`;

  return (
    <div className={`rating-slider${filled ? '' : ' empty'}${className ? ' ' + className : ''}`}>
      <div className="rating-value">{filled ? num : '–'}</div>
      <div
        ref={trackRef}
        className="rating-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={filled ? num : undefined}
        aria-valuetext={filled ? String(num) : 'не выбрано'}
      >
        <div className="rating-rail" />
        <div className="rating-fill" style={{ width: `calc(${ratio} * ${span})` }} />
        <div className="rating-ticks">
          {Array.from({ length: 11 }, (_, i) => <span key={i} className="rating-tick" />)}
        </div>
        <div className="rating-thumb" style={{ left: `calc(${RATING_PAD}px + ${ratio} * ${span})` }} />
      </div>
      <div className="rating-scale"><span>0</span><span>5</span><span>10</span></div>
    </div>
  );
}

// Russian cardinal number words 0..50 (units, teens, tens) we may hear in spoken time.
const NUM_WORD: Record<string, number> = {
  'ноль': 0, 'нуль': 0,
  'один': 1, 'одна': 1, 'час': 1,
  'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5,
  'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
  'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14,
  'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17, 'восемнадцать': 18,
  'девятнадцать': 19, 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
};

// Collapse a sequence of number words into numbers, merging "tens + unit"
// (e.g. ["двадцать","три"] → [23], ["четырнадцать","тридцать"] → [14, 30]).
function groupNumberWords(words: string[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const v = NUM_WORD[words[i]];
    if (v === undefined) return null;
    const next = i + 1 < words.length ? NUM_WORD[words[i + 1]] : undefined;
    if ((v === 20 || v === 30 || v === 40 || v === 50) && next !== undefined && next >= 1 && next <= 9) {
      out.push(v + next);
      i++;
    } else {
      out.push(v);
    }
  }
  return out;
}

// Flatten a cleaned time phrase into a flat list of numbers. Digit ("14"),
// glued ("1430"), colon ("14:30") and spoken-word forms all reduce to the same
// number stream; a colon/glued time contributes its hour and minute as two
// consecutive numbers. Returns null if any token isn't a number.
function toNumberList(t: string): number[] | null {
  const nums: number[] = [];
  const wordBuf: string[] = [];
  const flush = (): boolean => {
    if (!wordBuf.length) return true;
    const g = groupNumberWords(wordBuf);
    wordBuf.length = 0;
    if (!g) return false;
    nums.push(...g);
    return true;
  };
  for (const tok of t.split(' ')) {
    if (!tok) continue;
    let m = tok.match(/^(\d{1,2})[:.](\d{2})$/); // "14:30" / "14.30"
    if (m) { if (!flush()) return null; nums.push(+m[1], +m[2]); continue; }
    m = tok.match(/^(\d{3,4})$/); // glued "1430" / "930"
    if (m) { if (!flush()) return null; nums.push(+m[1].slice(0, -2), +m[1].slice(-2)); continue; }
    if (/^\d{1,2}$/.test(tok)) { if (!flush()) return null; nums.push(+tok); continue; }
    if (NUM_WORD[tok] === undefined) return null;
    wordBuf.push(tok);
  }
  return flush() ? nums : null;
}

// Consume a number stream into up to two zero-padded "HH:MM" times.
// Minutes are only ever :00 or :30, so a following number binds as minutes only
// when it is exactly 0 or 30 — any other number starts the next time (the end of
// an implicit range, e.g. "девять тридцать десять" → 09:30 + 10:00, "22 23" →
// 22:00 + 23:00). Trailing zeros after a minute absorb spoken "ноль ноль" (= :00).
function parseTimes(t: string): string[] {
  const nums = toNumberList(t);
  if (!nums) return [];
  const out: string[] = [];
  let i = 0;
  while (i < nums.length && out.length < 2) {
    const h = nums[i++];
    if (h < 0 || h > 23) break;
    let m = 0;
    if (i < nums.length && (nums[i] === 0 || nums[i] === 30)) {
      m = nums[i++];
      while (i < nums.length && nums[i] === 0) i++;
    }
    out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return out;
}

function normalizeTimeText(text: string): string {
  const raw = text.trim();
  // Treat dashes as separators so "14-16" / "14:30-15:30" join the number stream.
  const t = raw.toLowerCase().replace(/[—–-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return raw;

  // "[с/со/от] X до Y" — drop the framing words; both sides feed one number stream.
  const doParts = t.split(/\s+до\s+/);
  const body =
    doParts.length === 2
      ? `${doParts[0].replace(/^(?:с|со|от)\s+/, '')} ${doParts[1]}`
      : t.replace(/^(?:в|во|с|со|от)\s+/, '');

  const times = parseTimes(body);
  if (times.length >= 2) return `${times[0]}–${times[1]}`;
  if (times.length === 1) return times[0];
  return raw;
}

// Half-hour slots for the whole day: "00:00", "00:30" … "23:30".
const HALF_HOUR_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    out.push(`${hh}:00`, `${hh}:30`);
  }
  return out;
})();

function TimeRangeInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { from, to } = parseTimeRange(value);
  const [open, setOpen] = useState(false);
  const fromRef = useRef<HTMLButtonElement>(null);
  const toRef = useRef<HTMLButtonElement>(null);

  // Centre the selected slots when the picker opens.
  useEffect(() => {
    if (open) {
      fromRef.current?.scrollIntoView({ block: 'center' });
      toRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  const pickFrom = (t: string) => onChange(composeTimeRange(t, to));
  // Tapping the already-selected "to" clears it (the end is optional).
  const pickTo = (t: string) => onChange(composeTimeRange(from, t === to ? '' : t));

  const label = from ? (to ? `${from} – ${to}` : from) : 'Выбрать время';

  const column = (
    side: 'from' | 'to',
    selected: string,
    onPick: (t: string) => void,
    ref: React.RefObject<HTMLButtonElement | null>
  ) => (
    <div className="time-col">
      <div className="time-col-head">
        {side === 'from' ? 'С' : <>До <span className="time-col-opt">(опц.)</span></>}
      </div>
      <div className="time-col-list">
        {HALF_HOUR_SLOTS.map(t => (
          <button
            type="button"
            key={t}
            ref={t === selected ? ref : undefined}
            className={`time-slot${t === selected ? ' selected' : ''}`}
            onClick={() => onPick(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="time-input">
      <button
        type="button"
        className={`date-display-btn${className ? ' ' + className : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        <span className="date-caret">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="time-pop">
          {column('from', from, pickFrom, fromRef)}
          {column('to', to, pickTo, toRef)}
        </div>
      )}
    </div>
  );
}

export function DateInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const selected = ddmmyyyyToDate(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const base = selected ?? new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  // Follow the selected date when it jumps to another month (preset / voice input).
  useEffect(() => {
    const d = ddmmyyyyToDate(value);
    if (d) setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [value]);

  const setToday = () => onChange(dateToDdmmyyyy(new Date()));
  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    onChange(dateToDdmmyyyy(d));
  };
  const pick = (day: number) => {
    onChange(dateToDdmmyyyy(new Date(view.y, view.m, day)));
    setOpen(false);
  };
  const prevMonth = () => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const startDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
  const isSel = (d: number) =>
    !!selected && d === selected.getDate() && view.m === selected.getMonth() && view.y === selected.getFullYear();

  return (
    <div className="date-input">
      <div className="date-preset-row">
        <button type="button" className="date-preset-btn" onClick={setToday}>Сегодня</button>
        <button type="button" className="date-preset-btn" onClick={setYesterday}>Вчера</button>
        <button
          type="button"
          className={`date-display-btn${className ? ' ' + className : ''}`}
          onClick={() => setOpen(o => !o)}
        >
          {value || 'Выбрать дату'}
          <span className="date-caret">{open ? '▲' : '▼'}</span>
        </button>
      </div>
      {open && (
        <div className="date-cal">
          <div className="date-cal-head">
            <button type="button" className="date-cal-nav" onClick={prevMonth} aria-label="Предыдущий месяц">‹</button>
            <span className="date-cal-title">{MONTHS_RU[view.m]} {view.y}</span>
            <button type="button" className="date-cal-nav" onClick={nextMonth} aria-label="Следующий месяц">›</button>
          </div>
          <div className="date-cal-weekdays">
            {WEEKDAYS.map(w => <span key={w} className="date-cal-wd">{w}</span>)}
          </div>
          <div className="date-cal-grid">
            {cells.map((d, i) =>
              d === null ? (
                <span key={`e${i}`} className="date-cal-cell empty" />
              ) : (
                <button
                  type="button"
                  key={d}
                  className={`date-cal-cell${isSel(d) ? ' selected' : ''}${isToday(d) ? ' today' : ''}`}
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  initial?: DiaryEntry;
  initialSheetType?: SheetType;
  // 'plan' — morning planning (new task, 5 plan fields)
  // 'evaluate' — closing out a planned task (3 rating fields, then full preview)
  // 'edit' — editing an existing entry (preview only, all fields)
  // undefined — new entry, ask the user which sheet first
  mode?: FormMode;
  onSave: (data: EntryData) => Promise<void>;
  onCancel: () => void;
  // Mood/medication tracking lives outside the Эмоции/Дела entry model (one
  // record per day, not per entry) — the sheet-select card just hands off to
  // App's dedicated Mood screen instead of continuing the wizard below.
  onSelectMood?: () => void;
}

type Phase = 'select' | 'record' | 'preview';

export function EntryForm({ initial, initialSheetType, mode, onSave, onCancel, onSelectMood }: Props) {
  const effectiveMode: FormMode = mode ?? (initial ? 'edit' : 'plan');
  const [phase, setPhase] = useState<Phase>(
    // Editing reuses the same field-by-field record flow as input (pre-filled),
    // so voice dictation is available on every field.
    initialSheetType || initial ? 'record' : 'select'
  );
  const [sheetType, setSheetType] = useState<SheetType>(initial?.sheetType ?? initialSheetType ?? 'emotions');
  const [fieldIdx, setFieldIdx] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { status, interimText, start, stop, supported } = useSpeechRecognition();

  useEffect(() => {
    if (initial) {
      const vals: Record<string, string> = {};
      for (const [k, v] of Object.entries(initial)) {
        if (typeof v === 'string') vals[k] = v;
      }
      setValues(vals);
      // Evaluate flow starts on the first rating field (skip already-filled plan fields).
      if (effectiveMode === 'evaluate') {
        setFieldIdx(0);
      }
    } else if (initialSheetType) {
      const recordFields = getRecordFields(initialSheetType, effectiveMode);
      const autoVals: Record<string, string> = {};
      for (const f of recordFields) {
        if (f.autoFill) autoVals[f.key] = f.autoFill();
      }
      setValues(autoVals);
      const firstContent = recordFields.findIndex(f => !f.autoFill);
      setFieldIdx(firstContent >= 0 ? firstContent : 0);
    }
  }, [initial, initialSheetType, effectiveMode]);

  const startNewEntry = useCallback(
    (type: SheetType) => {
      setSheetType(type);
      const recordFields = getRecordFields(type, effectiveMode);
      const autoVals: Record<string, string> = {};
      for (const f of recordFields) {
        if (f.autoFill) autoVals[f.key] = f.autoFill();
      }
      setValues(autoVals);
      const firstContent = recordFields.findIndex(f => !f.autoFill);
      setFieldIdx(firstContent >= 0 ? firstContent : 0);
      setPhase('record');
    },
    [effectiveMode]
  );

  const fields = getRecordFields(sheetType, effectiveMode);
  const field = fields[fieldIdx];
  const isLast = fieldIdx === fields.length - 1;
  const progress = ((fieldIdx + 1) / fields.length) * 100;

  const handleMic = () => {
    if (status === 'recording') {
      stop();
      return;
    }
    const existing = values[field.key] || '';
    start(text => {
      if (text) {
        let normalized: string;
        if (NUMERIC_FIELDS.has(field.key)) {
          normalized = normalizeNumericText(text);
        } else if (TIME_FIELDS.has(field.key)) {
          normalized = normalizeTimeText(text);
        } else if (DATE_FIELDS.has(field.key)) {
          normalized = normalizeDateText(text);
        } else {
          normalized = text;
        }
        const isReplace = NUMERIC_FIELDS.has(field.key) || TIME_FIELDS.has(field.key) || DATE_FIELDS.has(field.key);
        setValues(v => ({
          ...v,
          [field.key]: isReplace ? normalized : (existing ? existing + ' ' + normalized : normalized),
        }));
      }
    });
  };

  const goNext = () => {
    if (status === 'recording') stop();
    if (isLast) {
      setPhase('preview');
    } else {
      setFieldIdx(i => i + 1);
    }
  };

  const goPrev = () => {
    if (status === 'recording') stop();
    if (fieldIdx > 0) {
      setFieldIdx(i => i - 1);
    } else if (effectiveMode === 'edit') {
      // No sheet-select step when editing — back from the first field cancels.
      onCancel();
    } else {
      setPhase('select');
    }
  };

  const buildData = (overrideStatus?: TaskStatus): EntryData => {
    if (sheetType === 'emotions') {
      return {
        sheetType: 'emotions',
        entryId: values.entryId || '',
        time: values.time || '',
        date: values.date || '',
        situation: values.situation || '',
        thoughts: values.thoughts || '',
        emotions: values.emotions || '',
        behavior: values.behavior || '',
      } satisfies EmotionData;
    }
    // Status transitions:
    //   plan      → planned (just scheduled)
    //   evaluate  → done    (closing out a planned task)
    //   edit      → keep previous status (defaulting to 'done' for legacy/manual entries)
    const prevStatus = (initial?.sheetType === 'tasks' ? initial.status : undefined) ?? 'done';
    const nextStatus: TaskStatus =
      overrideStatus ??
      (effectiveMode === 'plan' ? 'planned' : effectiveMode === 'evaluate' ? 'done' : prevStatus);
    return {
      sheetType: 'tasks',
      entryId: values.entryId || '',
      status: nextStatus,
      time: values.time || '',
      date: values.date || '',
      activity: values.activity || '',
      sphere: values.sphere || '',
      importance: values.importance || '',
      urgency: values.urgency || '',
      difficulty: values.difficulty || '',
      pleasure: values.pleasure || '',
      enjoyment: values.enjoyment || '',
    } satisfies TaskData;
  };

  const handleSave = async (overrideStatus?: TaskStatus) => {
    if (status === 'recording') stop();
    setSaving(true);
    await onSave(buildData(overrideStatus));
    setSaving(false);
  };

  /* ── PHASE: select ── */
  if (phase === 'select') {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="text-btn" onClick={onCancel}>Отмена</button>
          <span className="header-title">Новая запись</span>
          <span style={{ minWidth: 64 }} />
        </header>
        <div className="sheet-select-body">
          <p className="sheet-select-prompt">Что записываем?</p>
          <button className="sheet-select-card" onClick={() => startNewEntry('emotions')}>
            <span className="sheet-select-icon">💭</span>
            <div className="sheet-select-text">
              <strong>Эмоции</strong>
              <p>Ситуация · мысли · эмоции · поведение</p>
            </div>
            <span className="sheet-select-arrow">›</span>
          </button>
          <button className="sheet-select-card" onClick={() => startNewEntry('tasks')}>
            <span className="sheet-select-icon">🗓</span>
            <div className="sheet-select-text">
              <strong>Дело (план)</strong>
              <p>Занятие · сфера · когда · важность</p>
            </div>
            <span className="sheet-select-arrow">›</span>
          </button>
          {onSelectMood && (
            <button className="sheet-select-card" onClick={onSelectMood}>
              <span className="sheet-select-icon">😊</span>
              <div className="sheet-select-text">
                <strong>Настроение</strong>
                <p>Утро · день · вечер · лекарства</p>
              </div>
              <span className="sheet-select-arrow">›</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── PHASE: record ── */
  if (phase === 'record') {
    const isRecording = status === 'recording';
    const displayInterim = isRecording && interimText
      ? (values[field.key] ? '…' + interimText : interimText)
      : '';

    return (
      <div className="screen">
        <header className="app-header">
          <span className="header-title">
            {effectiveMode === 'edit'
              ? (sheetType === 'emotions' ? '✏️ Эмоции' : '✏️ Дело')
              : sheetType === 'emotions'
                ? '💭 Эмоции'
                : effectiveMode === 'evaluate'
                  ? '⭐ Оценка'
                  : '🗓 План дела'}
            <span className="step-indicator-inline"> · {fieldIdx + 1}/{fields.length}</span>
          </span>
        </header>

        <div className="progress-track-outer">
          <div className="progress-track-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="record-body">
          <h2 className="rec-field-label">{field.label}</h2>
          <p className="rec-field-hint">{field.hint}</p>

          {NUMERIC_FIELDS.has(field.key) ? (
            <RatingInput
              className={isRecording ? 'recording-border' : ''}
              value={values[field.key] || ''}
              onChange={val => setValues(v => ({ ...v, [field.key]: val }))}
            />
          ) : DATE_FIELDS.has(field.key) ? (
            <DateInput
              className={isRecording ? 'recording-border' : ''}
              value={values[field.key] || ''}
              onChange={val => setValues(v => ({ ...v, [field.key]: val }))}
            />
          ) : TIME_FIELDS.has(field.key) ? (
            <TimeRangeInput
              className={`field-textarea rec-textarea${isRecording ? ' recording-border' : ''}`}
              value={values[field.key] || ''}
              onChange={val => setValues(v => ({ ...v, [field.key]: val }))}
            />
          ) : (
            <textarea
              className={`field-textarea rec-textarea${isRecording ? ' recording-border' : ''}`}
              value={values[field.key] || ''}
              onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
              rows={field.rows ?? 4}
              placeholder={isRecording ? 'Слушаю…' : 'Говорите в микрофон или введите текст'}
            />
          )}

          {displayInterim && (
            <p className="interim-preview">{displayInterim}</p>
          )}

          {!supported && (
            <p className="warn-msg">
              Голосовой ввод не поддерживается в этом браузере. Введите текст вручную.
            </p>
          )}

          <div className="mic-area">
            <div className="mic-nav-row">
              <button className="nav-side-btn" onClick={goPrev}>
                {fieldIdx === 0 ? '✕ Отмена' : '← Назад'}
              </button>
              {supported ? (
                <button
                  className={`mic-button${isRecording ? ' recording' : ''}`}
                  onClick={handleMic}
                  aria-label={isRecording ? 'Остановить запись' : 'Начать запись'}
                >
                  <span className="mic-emoji">🎙</span>
                  {isRecording && (
                    <>
                      <div className="mic-ring r1" />
                      <div className="mic-ring r2" />
                    </>
                  )}
                </button>
              ) : (
                <span className="mic-button-spacer" />
              )}
              <button
                className="nav-side-btn primary"
                onClick={
                  // Evaluate flow needs the preview step so the user can adjust
                  // time/importance against actuals before committing to done.
                  isLast && effectiveMode !== 'evaluate' ? () => handleSave() : goNext
                }
                disabled={saving}
              >
                {isLast
                  ? effectiveMode === 'evaluate'
                    ? 'Далее →'
                    : (saving ? '…' : 'Сохранить')
                  : 'Далее →'}
              </button>
            </div>
            {supported && (
              <p className="mic-status-text">
                {isRecording ? 'Говорите… (нажмите чтобы остановить)' : 'Нажмите для голосового ввода'}
              </p>
            )}
          </div>
        </div>

      </div>
    );
  }

  /* ── PHASE: preview ── */
  const previewFields = getPreviewFields(sheetType, effectiveMode);
  const previewTitle =
    effectiveMode === 'edit'
      ? 'Редактировать'
      : effectiveMode === 'evaluate'
        ? 'Оценка выполнения'
        : 'Проверка';
  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={() => (effectiveMode === 'edit' ? onCancel() : setPhase('record'))}>
          {effectiveMode === 'edit' ? 'Отмена' : '← Назад'}
        </button>
        <span className="header-title">{previewTitle}</span>
        {effectiveMode === 'evaluate' ? (
          // Two-button flow lives at the bottom of the form (see below) so the
          // header keeps the «Назад» + title rhythm of the other screens.
          <span style={{ minWidth: 64 }} />
        ) : (
          <button className="text-btn primary" onClick={() => handleSave()} disabled={saving}>
            {saving ? '…' : 'Сохранить'}
          </button>
        )}
      </header>
      <div className="form-body">
        {effectiveMode !== 'edit' && (
          <p className="preview-note muted">
            {effectiveMode === 'evaluate'
              ? 'Проверьте оценки. Время и важность можно подправить, если по факту вышло иначе.'
              : 'Проверьте поля перед сохранением — можно редактировать прямо здесь.'}
          </p>
        )}
        {previewFields.map(f => (
          <div key={f.key} className="field-group">
            <label className="field-label">{f.label}</label>
            {NUMERIC_FIELDS.has(f.key) ? (
              <RatingInput
                value={values[f.key] || ''}
                onChange={val => setValues(v => ({ ...v, [f.key]: val }))}
              />
            ) : DATE_FIELDS.has(f.key) ? (
              <DateInput
                value={values[f.key] || ''}
                onChange={val => setValues(v => ({ ...v, [f.key]: val }))}
              />
            ) : TIME_FIELDS.has(f.key) ? (
              <TimeRangeInput
                className="field-textarea"
                value={values[f.key] || ''}
                onChange={val => setValues(v => ({ ...v, [f.key]: val }))}
              />
            ) : (
              <textarea
                className="field-textarea"
                value={values[f.key] || ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                rows={f.rows ?? 3}
              />
            )}
          </div>
        ))}
        {effectiveMode === 'evaluate' && (
          // Two explicit actions: «Сохранить» keeps status=planned (you can
          // come back later to finish), «Готово» flips to done. Both sync to
          // Google Sheets the same way.
          <div className="evaluate-actions">
            <button
              className="settings-btn secondary"
              onClick={() => handleSave('planned')}
              disabled={saving}
            >
              {saving ? '…' : '💾 Сохранить (пока в плане)'}
            </button>
            <button
              className="settings-btn primary"
              onClick={() => handleSave('done')}
              disabled={saving}
            >
              {saving ? '…' : '✅ Готово'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
