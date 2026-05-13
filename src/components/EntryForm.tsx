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
    hint: 'Скажите или введите время',
    autoFill: () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    rows: 1,
  },
  {
    key: 'date',
    label: 'Дата',
    hint: 'Скажите или введите дату',
    autoFill: () =>
      new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
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
    hint: 'Скажите или введите время',
    autoFill: () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    rows: 1,
  },
  {
    key: 'date',
    label: 'Дата',
    hint: 'Скажите или введите дату',
    autoFill: () =>
      new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
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

const NUMERIC_FIELDS = new Set(['importance', 'difficulty']);

function normalizeNumericText(text: string): string {
  const trimmed = text.trim().toLowerCase();
  if (WORD_TO_DIGIT[trimmed]) return WORD_TO_DIGIT[trimmed];
  // extract first number if spoken as digit
  const match = trimmed.match(/\d+/);
  if (match) return match[0];
  return text.trim();
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
        const normalized = NUMERIC_FIELDS.has(field.key) ? normalizeNumericText(text) : text;
        setValues(v => ({
          ...v,
          [field.key]: NUMERIC_FIELDS.has(field.key) ? normalized : (existing ? existing + ' ' + normalized : normalized),
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

          <textarea
            className={`field-textarea rec-textarea${isRecording ? ' recording-border' : ''}`}
            value={values[field.key] || ''}
            onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}
            rows={field.rows ?? 4}
            placeholder={isRecording ? 'Слушаю…' : 'Говорите в микрофон или введите текст'}
          />

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
            <textarea
              className="field-textarea"
              value={values[f.key] || ''}
              onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              rows={f.rows ?? 3}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
