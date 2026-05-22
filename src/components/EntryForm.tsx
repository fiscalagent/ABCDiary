import { useState, useEffect, useCallback } from 'react';
import type { EntryData, EmotionData, TaskData, SheetType, DiaryEntry } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

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
    hint: 'Например: «14:30», «в два», «с 14 30 до 15 30»',
    rows: 1,
  },
  {
    key: 'date',
    label: 'Дата',
    hint: 'Скажите или введите дату',
    rows: 1,
  },
  { key: 'situation', label: 'Триггерная ситуация', hint: 'Опишите ситуацию, которая произошла' },
  { key: 'thoughts', label: 'Мысли', hint: 'Что вы думали в этот момент?' },
  { key: 'emotions', label: 'Эмоции', hint: 'Какие эмоции вы испытывали?' },
  { key: 'behavior', label: 'Поведение', hint: 'Как вы себя повели, что сделали?' },
];

const TASK_FIELDS: FieldConfig[] = [
  {
    key: 'time',
    label: 'Время',
    hint: 'Например: «14:30», «в два», «с 14 30 до 15 30»',
    rows: 1,
  },
  {
    key: 'date',
    label: 'Дата',
    hint: 'Скажите или введите дату',
    rows: 1,
  },
  { key: 'activity', label: 'Занятие', hint: 'Чем занимались или планируете заниматься?' },
  {
    key: 'sphere',
    label: 'Сфера',
    hint: 'Сфера жизни: работа, здоровье, семья, хобби...',
    rows: 1,
  },
  {
    key: 'importance',
    label: 'Важность (1-10)',
    hint: 'Назовите число от 1 до 10',
    rows: 1,
  },
  {
    key: 'difficulty',
    label: 'Сложность (1-10)',
    hint: 'Насколько сложно? Число от 1 до 10',
    rows: 1,
  },
  {
    key: 'pleasure',
    label: 'Удовольствие (1-10)',
    hint: 'Насколько приятно? Число от 1 до 10',
    rows: 1,
  },
];

function getFields(type: SheetType): FieldConfig[] {
  return type === 'emotions' ? EMOTION_FIELDS : TASK_FIELDS;
}

const WORD_TO_DIGIT: Record<string, string> = {
  'ноль': '0', 'нуль': '0',
  'один': '1', 'одна': '1', 'раз': '1',
  'два': '2', 'две': '2',
  'три': '3', 'четыре': '4', 'пять': '5',
  'шесть': '6', 'семь': '7', 'восемь': '8',
  'девять': '9', 'десять': '10',
};

const NUMERIC_FIELDS = new Set(['importance', 'difficulty', 'pleasure']);
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
  const t = raw.toLowerCase();
  const currentYear = new Date().getFullYear();
  const fmt = (d: number, m: number, y: number | string) =>
    `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;

  // DD.MM.YYYY or DD/MM/YYYY
  let m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return fmt(d, mo, m[3]);
  }

  // DD.MM or DD/MM
  m = t.match(/^(\d{1,2})[.\/](\d{1,2})$/);
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

function ddmmyyyyToIso(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function isoToDdmmyyyy(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function normalizeNumericText(text: string): string {
  const trimmed = text.trim().toLowerCase();
  if (WORD_TO_DIGIT[trimmed]) return WORD_TO_DIGIT[trimmed];
  const match = trimmed.match(/\d+/);
  if (match) return match[0];
  return text.trim();
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

function validHm(h: number, m: number): { h: number; m: number } | null {
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? { h, m } : null;
}

// Half-hour precision is enough — snap minutes to :00 / :30.
function snapHm(h: number, m: number): string {
  let mm = m < 15 ? 0 : m < 45 ? 30 : 60;
  let hh = h;
  if (mm === 60) { mm = 0; hh = (h + 1) % 24; }
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

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

// Extract raw hour/minute from one time token (no rounding), or null if it isn't a time.
// Handles: "14:30", "14.30", "1430", "14 30", "14", and spoken words
// like "четырнадцать тридцать", "два", "двадцать один".
function extractHm(s: string): { h: number; m: number } | null {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/\bчас(?:ов|а)?\b/g, ' ')
    .replace(/\bминут(?:ы|у)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;

  // "14:30" / "14.30"
  let m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m) return validHm(+m[1], +m[2]);

  // glued "1430" / "930"
  m = t.match(/^(\d{3,4})$/);
  if (m) {
    const r = validHm(+m[1].slice(0, -2), +m[1].slice(-2));
    if (r) return r;
  }

  // two number groups "14 30"
  m = t.match(/^(\d{1,2})\s+(\d{1,2})$/);
  if (m) return validHm(+m[1], +m[2]);

  // single number = whole hour "14"
  m = t.match(/^(\d{1,2})$/);
  if (m) return validHm(+m[1], 0);

  // spoken words
  const groups = groupNumberWords(t.split(' '));
  if (groups) {
    if (groups.length === 1) return validHm(groups[0], 0);
    if (groups.length === 2) return validHm(groups[0], groups[1]);
  }
  return null;
}

// One side of a range → snapped "H:MM", or null.
function parseTimeToken(s: string): string | null {
  const hm = extractHm(s);
  return hm ? snapHm(hm.h, hm.m) : null;
}

function normalizeTimeText(text: string): string {
  const raw = text.trim();
  const t = raw.toLowerCase().replace(/[—]/g, '-').replace(/\s+/g, ' ').trim();
  if (!t) return raw;

  // Range "[с/со/от] X до Y" — each side may be multi-word ("с 14 30 до 15 30").
  if (/\sдо\s/.test(t)) {
    const [left, right] = t.split(/\s+до\s+/);
    const from = parseTimeToken(left.replace(/^(?:с|со|от)\s+/, ''));
    const to = parseTimeToken(right);
    if (from && to) return `${from}–${to}`;
    if (from) return from;
  }

  // Dash range "14-16", "14:30-15:30", "14 30 - 15 30".
  if (t.includes('-')) {
    const [left, right] = t.split('-');
    const from = parseTimeToken(left);
    const to = parseTimeToken(right);
    if (from && to) return `${from}–${to}`;
  }

  // Single time, optionally "в/во X".
  const hm = extractHm(t.replace(/^(?:в|во)\s+/, ''));
  if (hm) {
    const { h, m } = hm;
    // Minutes are only ever :00 or :30. A "minute" like 23 that is itself a valid
    // later hour means the «до» was lost — e.g. "22 23" → range 22:00–23:00.
    if (m !== 0 && m !== 30 && m <= 23 && m > h) return `${h}:00–${m}:00`;
    return snapHm(h, m);
  }

  return raw;
}

function TimeRangeInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { from, to } = parseTimeRange(value);
  return (
    <div className="time-range-row">
      <input
        type="time"
        className={className}
        value={from}
        onChange={e => onChange(composeTimeRange(e.target.value, to))}
        aria-label="С"
      />
      <span className="time-range-sep">–</span>
      <input
        type="time"
        className={className}
        value={to}
        onChange={e => onChange(composeTimeRange(from, e.target.value))}
        aria-label="До (опционально)"
      />
    </div>
  );
}

interface Props {
  initial?: DiaryEntry;
  initialSheetType?: SheetType;
  onSave: (data: EntryData) => Promise<void>;
  onCancel: () => void;
}

type Phase = 'select' | 'record' | 'preview';

export function EntryForm({ initial, initialSheetType, onSave, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>(initial ? 'preview' : initialSheetType ? 'record' : 'select');
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
    } else if (initialSheetType) {
      const autoVals: Record<string, string> = {};
      for (const f of getFields(initialSheetType)) {
        if (f.autoFill) autoVals[f.key] = f.autoFill();
      }
      setValues(autoVals);
      const firstContent = getFields(initialSheetType).findIndex(f => !f.autoFill);
      setFieldIdx(firstContent >= 0 ? firstContent : 0);
    }
  }, [initial, initialSheetType]);

  const startNewEntry = useCallback(
    (type: SheetType) => {
      setSheetType(type);
      const autoVals: Record<string, string> = {};
      for (const f of getFields(type)) {
        if (f.autoFill) autoVals[f.key] = f.autoFill();
      }
      setValues(autoVals);
      const firstContent = getFields(type).findIndex(f => !f.autoFill);
      setFieldIdx(firstContent >= 0 ? firstContent : 0);
      setPhase('record');
    },
    []
  );

  const fields = getFields(sheetType);
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
    } else {
      setPhase('select');
    }
  };

  const buildData = (): EntryData => {
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
    return {
      sheetType: 'tasks',
      entryId: values.entryId || '',
      time: values.time || '',
      date: values.date || '',
      activity: values.activity || '',
      sphere: values.sphere || '',
      importance: values.importance || '',
      difficulty: values.difficulty || '',
      pleasure: values.pleasure || '',
    } satisfies TaskData;
  };

  const handleSave = async () => {
    if (status === 'recording') stop();
    setSaving(true);
    await onSave(buildData());
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
            <span className="sheet-select-icon">✅</span>
            <div className="sheet-select-text">
              <strong>Дела</strong>
              <p>Занятие · сфера · важность · сложность</p>
            </div>
            <span className="sheet-select-arrow">›</span>
          </button>
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
            {sheetType === 'emotions' ? '💭 Эмоции' : '✅ Дела'}
            <span className="step-indicator-inline"> · {fieldIdx + 1}/{fields.length}</span>
          </span>
        </header>

        <div className="progress-track-outer">
          <div className="progress-track-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="record-body">
          <h2 className="rec-field-label">{field.label}</h2>
          <p className="rec-field-hint">{field.hint}</p>

          {DATE_FIELDS.has(field.key) ? (
            <input
              type="date"
              className={`field-textarea rec-textarea${isRecording ? ' recording-border' : ''}`}
              value={ddmmyyyyToIso(values[field.key] || '')}
              onChange={e => setValues(v => ({ ...v, [field.key]: isoToDdmmyyyy(e.target.value) }))}
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
                onClick={isLast ? handleSave : goNext}
                disabled={saving}
              >
                {isLast ? (saving ? '…' : 'Сохранить') : 'Далее →'}
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
  const previewFields = getFields(sheetType);
  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={() => (initial ? onCancel() : setPhase('record'))}>
          {initial ? 'Отмена' : '← Назад'}
        </button>
        <span className="header-title">{initial ? 'Редактировать' : 'Проверка'}</span>
        <button className="text-btn primary" onClick={handleSave} disabled={saving}>
          {saving ? '…' : 'Сохранить'}
        </button>
      </header>
      <div className="form-body">
        {!initial && (
          <p className="preview-note muted">
            Проверьте поля перед сохранением — можно редактировать прямо здесь.
          </p>
        )}
        {previewFields.map(f => (
          <div key={f.key} className="field-group">
            <label className="field-label">{f.label}</label>
            {DATE_FIELDS.has(f.key) ? (
              <input
                type="date"
                className="field-textarea"
                value={ddmmyyyyToIso(values[f.key] || '')}
                onChange={e => setValues(v => ({ ...v, [f.key]: isoToDdmmyyyy(e.target.value) }))}
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
      </div>
    </div>
  );
}
