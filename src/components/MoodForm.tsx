import { useState } from 'react';
import type { MoodData, MoodEntry } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { RatingInput, DateInput } from './EntryForm';
import { normalizeNumericText, dateToDdmmyyyy, ddmmyyyyToDate } from '../utils/parsing';

interface FieldDef {
  key: keyof MoodData;
  label: string;
  hint?: string;
  numeric?: boolean;
}

const FIELDS: FieldDef[] = [
  { key: 'morning', label: 'Утро (0–10)', hint: '0 — тяжело, депрессия · 5 — нейтрально · 10 — эйфория', numeric: true },
  { key: 'day', label: 'День (0–10)', hint: 'Оцените состояние в течение дня', numeric: true },
  { key: 'evening', label: 'Вечер (0–10)', hint: 'Оцените состояние вечером', numeric: true },
  { key: 'med1', label: 'Лекарство 1', hint: 'Название препарата' },
  { key: 'dose1', label: 'Доза 1', hint: 'Например: 50 мг, 1 таблетка' },
  { key: 'med2', label: 'Лекарство 2' },
  { key: 'dose2', label: 'Доза 2' },
  { key: 'med3', label: 'Лекарство 3' },
  { key: 'dose3', label: 'Доза 3' },
  { key: 'comment', label: 'Комментарий', hint: 'Самочувствие, побочные эффекты и т.п.' },
];

interface Props {
  moods: MoodEntry[];
  // Which day this form edits — defaults to today (the FAB "Новая запись" flow).
  // Set when opened from a specific day in the mood calendar.
  initialDate?: string;
  onSave: (data: MoodData) => Promise<void>;
  onCancel: () => void;
}

function buildInitialValues(moods: MoodEntry[], initialDate?: string): MoodData {
  const targetDate = initialDate ?? dateToDdmmyyyy(new Date());
  const existing = moods.find(m => m.date === targetDate);
  if (existing) {
    return {
      date: existing.date,
      morning: existing.morning, day: existing.day, evening: existing.evening,
      med1: existing.med1, dose1: existing.dose1,
      med2: existing.med2, dose2: existing.dose2,
      med3: existing.med3, dose3: existing.dose3,
      comment: existing.comment,
    };
  }
  const targetTime = ddmmyyyyToDate(targetDate)?.getTime() ?? Infinity;
  // Carry meds over from the most recent earlier day — they change rarely,
  // so pre-filling saves re-typing; scores/comment always start blank.
  const prior = moods
    .filter(m => (ddmmyyyyToDate(m.date)?.getTime() ?? -Infinity) < targetTime)
    .sort((a, b) => (ddmmyyyyToDate(b.date)?.getTime() ?? 0) - (ddmmyyyyToDate(a.date)?.getTime() ?? 0))[0];
  return {
    date: targetDate,
    morning: '', day: '', evening: '',
    med1: prior?.med1 ?? '', dose1: prior?.dose1 ?? '',
    med2: prior?.med2 ?? '', dose2: prior?.dose2 ?? '',
    med3: prior?.med3 ?? '', dose3: prior?.dose3 ?? '',
    comment: '',
  };
}

export function MoodForm({ moods, initialDate, onSave, onCancel }: Props) {
  const [values, setValues] = useState<MoodData>(() => buildInitialValues(moods, initialDate));
  const [saving, setSaving] = useState(false);
  const [micField, setMicField] = useState<string | null>(null);
  const { status, interimText, start, stop, supported } = useSpeechRecognition();

  const setField = (key: keyof MoodData, val: string) => setValues(v => ({ ...v, [key]: val }));

  const toggleMic = (key: keyof MoodData, numeric: boolean) => {
    if (status === 'recording' && micField === key) {
      stop();
      return;
    }
    if (status === 'recording') stop();
    setMicField(key);
    const existing = values[key] || '';
    start(text => {
      setMicField(null);
      if (!text) return;
      const normalized = numeric ? normalizeNumericText(text) : text;
      setField(key, numeric ? normalized : (existing ? existing + ' ' + normalized : normalized));
    });
  };

  const handleSave = async () => {
    if (status === 'recording') stop();
    setSaving(true);
    await onSave(values);
    setSaving(false);
  };

  const isEditingExisting = moods.some(m => m.date === values.date);

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onCancel}>Отмена</button>
        <span className="header-title">😊 Настроение</span>
        <button className="text-btn primary" onClick={handleSave} disabled={saving}>
          {saving ? '…' : 'Сохранить'}
        </button>
      </header>
      <div className="form-body">
        <div className="field-group">
          <label className="field-label">Дата</label>
          <DateInput value={values.date} onChange={val => setField('date', val)} />
          {isEditingExisting && (
            <p className="field-hint">За этот день уже есть запись — она будет обновлена.</p>
          )}
        </div>

        {FIELDS.map(f => {
          const recording = micField === f.key;
          return (
            <div key={f.key} className="field-group">
              <label className="field-label">{f.label}</label>
              {f.hint && <p className="field-hint">{f.hint}</p>}
              <div style={{ display: 'flex', gap: 8, alignItems: f.numeric ? 'stretch' : 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {f.numeric ? (
                    <RatingInput
                      className={recording ? 'recording-border' : ''}
                      value={values[f.key] || ''}
                      onChange={val => setField(f.key, val)}
                    />
                  ) : (
                    <textarea
                      className={`field-textarea${recording ? ' recording-border' : ''}`}
                      value={values[f.key] || ''}
                      onChange={e => setField(f.key, e.target.value)}
                      rows={f.key === 'comment' ? 4 : 1}
                    />
                  )}
                  {recording && interimText && <p className="interim-preview">{interimText}</p>}
                </div>
                {supported && (
                  <button
                    type="button"
                    className={`mic-inline-btn${recording ? ' recording' : ''}`}
                    onClick={() => toggleMic(f.key, !!f.numeric)}
                    aria-label={recording ? 'Остановить запись' : 'Голосовой ввод'}
                  >
                    🎙
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
