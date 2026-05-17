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
    hint: 'Например: «14:30», «в два», «с 14 до 16»',
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
    hint: 'Например: «14:30», «в два», «с 14 до 16»',
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

const HOUR_WORDS: Record<string, number> = {
  'ноль': 0, 'нуль': 0,
  'один': 1, 'одна': 1, 'час': 1,
  'два': 2, 'две': 2,
  'три': 3, 'четыре': 4, 'пять': 5,
  'шесть': 6, 'семь': 7, 'восемь': 8,
  'девять': 9, 'десять': 10, 'одиннадцать': 11,
  'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14,
  'пятнадцать': 15, 'шестнадцать': 16, 'семнадцать': 17,
  'восемнадцать': 18, 'девятнадцать': 19, 'двадцать': 20,
  'двадцать один': 21, 'двадцать два': 22, 'двадцать три': 23,
};

function parseTimeToken(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (/^\d{1,2}:\d{2}$/.test(t)) return t;
  const n = parseInt(t, 10);
  if (!isNaN(n) && n >= 0 && n <= 23) return `${n}:00`;
  if (HOUR_WORDS[t] !== undefined) return `${HOUR_WORDS[t]}:00`;
  return null;
}

function normalizeTimeText(text: string): string {
  const raw = text.trim();
  const t = raw.toLowerCase();

  // Already formatted with colon
  if (/^\d{1,2}:\d{2}/.test(t)) return raw.replace(/[-–]/, '–');

  // "с/от X до Y"
  const rangeRu = t.match(/(?:с|от)\s+(\S+)\s+до\s+(\S+)/);
  if (rangeRu) {
    const from = parseTimeToken(rangeRu[1]);
    const to = parseTimeToken(rangeRu[2]);
    if (from && to) return `${from}–${to}`;
  }

  // "X до Y"
  const xToY = t.match(/^(.+?)\s+до\s+(.+)$/);
  if (xToY) {
    const from = parseTimeToken(xToY[1]);
    const to = parseTimeToken(xToY[2]);
    if (from && to) return `${from}–${to}`;
  }

  // Numeric range "14-16"
  const numRange = t.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (numRange) {
    const from = parseTimeToken(numRange[1]);
    const to = parseTimeToken(numRange[2]);
    if (from && to) return `${from}–${to}`;
  }

  // "в/во X"
  const inTime = t.match(/(?:^|\s)(?:в|во)\s+(\S+)/);
  if (inTime) {
    const h = parseTimeToken(inTime[1]);
    if (h) return h;
  }

  // Two numbers "14 30" → "14:30"
  const twoNums = t.match(/^(\d{1,2})\s+(\d{2})$/);
  if (twoNums) {
    const h = parseInt(twoNums[1], 10);
    const m = parseInt(twoNums[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${h}:${String(m).padStart(2, '0')}`;
  }

  // Single token "два", "14"
  const single = t.match(/^(\S+)(?:\s+час(?:ов|а)?)?$/);
  if (single) {
    const h = parseTimeToken(single[1]);
    if (h) return h;
  }

  return raw;
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
          <button className="text-btn" onClick={() => { stop(); setPhase('select'); }}>Отмена</button>
          <span className="header-title">
            {sheetType === 'emotions' ? '💭 Эмоции' : '✅ Дела'}
          </span>
          <span className="step-indicator">{fieldIdx + 1}/{fields.length}</span>
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

          {supported && (
            <div className="mic-area">
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
              <p className="mic-status-text">
                {isRecording ? 'Говорите… (нажмите чтобы остановить)' : 'Нажмите для голосового ввода'}
              </p>
            </div>
          )}
        </div>

        <div className="rec-nav">
          <button className="text-btn" onClick={goPrev}>← Назад</button>
          <button className="text-btn primary" onClick={goNext}>
            {isLast ? 'Проверить →' : 'Далее →'}
          </button>
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
