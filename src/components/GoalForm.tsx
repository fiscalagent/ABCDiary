import { useState } from 'react';
import type { GoalData, GoalHorizon, Goal } from '../types';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface Props {
  // Pre-filled values when editing an existing goal, or when creating a
  // subtask (parentGoalId pre-set, horizon defaulted from parent).
  initial?: Partial<GoalData>;
  // 'create' — saving spawns a new goal; 'edit' — patches an existing one.
  mode: 'create' | 'edit';
  // Existing goal (used to preserve goalId / deferredCount on edit).
  existing?: Goal;
  // When set, the form starts as a subtask of this goal (UI hides horizon=month).
  parentGoal?: Goal;
  onSave: (data: GoalData) => Promise<void>;
  onCancel: () => void;
}

function dateToInputValue(ddmmyyyy: string): string {
  const m = ddmmyyyy.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function inputValueToDdmmyyyy(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// Suggest a sensible default deadline for each horizon: end of today /
// end of week (Sunday) / end of month. Picker can still override.
function defaultDeadline(horizon: GoalHorizon): string {
  const d = new Date();
  if (horizon === 'day') {
    // leave today
  } else if (horizon === 'week') {
    const dow = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() + (6 - dow));
  } else {
    d.setMonth(d.getMonth() + 1, 0); // last day of current month
  }
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

const HORIZON_OPTIONS: { key: GoalHorizon; label: string; icon: string }[] = [
  { key: 'month', label: 'Месяц', icon: '📅' },
  { key: 'week', label: 'Неделя', icon: '🗓' },
  { key: 'day', label: 'День', icon: '📌' },
];

export function GoalForm({ initial, mode, existing, parentGoal, onSave, onCancel }: Props) {
  // Subtask horizon is always finer than the parent — UI hides 'month' for
  // week-parents, hides 'month' & 'week' for day-parents (the latter is rare).
  const allowedHorizons: GoalHorizon[] = parentGoal
    ? parentGoal.horizon === 'month'
      ? ['week', 'day']
      : ['day']
    : ['month', 'week', 'day'];

  const [title, setTitle] = useState(initial?.title ?? '');
  const [horizon, setHorizon] = useState<GoalHorizon>(
    initial?.horizon ?? allowedHorizons[0]
  );
  const [deadline, setDeadline] = useState(
    initial?.deadline || defaultDeadline(initial?.horizon ?? allowedHorizons[0])
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  // Which textarea the mic is currently feeding into.
  const [activeField, setActiveField] = useState<'title' | 'note'>('title');
  const { status, interimText, start, stop, supported } = useSpeechRecognition();

  // When the user picks a new horizon, also refresh the deadline to that
  // horizon's default — but only if they hadn't manually edited it yet (i.e.
  // the current value still matches *some* horizon's default).
  const pickHorizon = (h: GoalHorizon) => {
    setHorizon(h);
    const defaults = HORIZON_OPTIONS.map(o => defaultDeadline(o.key));
    if (!deadline || defaults.includes(deadline)) {
      setDeadline(defaultDeadline(h));
    }
  };

  const handleMic = (field: 'title' | 'note') => {
    if (status === 'recording' && activeField === field) {
      stop();
      return;
    }
    if (status === 'recording') stop();
    setActiveField(field);
    const setter = field === 'title' ? setTitle : setNote;
    start(text => {
      if (!text) return;
      setter(prev => (prev ? prev + ' ' + text : text));
    });
  };

  const handleSubmit = async () => {
    if (!title.trim() || !deadline) return;
    if (status === 'recording') stop();
    setSaving(true);
    const data: GoalData = {
      goalId: existing?.goalId || crypto.randomUUID(),
      ...(parentGoal ? { parentGoalId: parentGoal.goalId } : initial?.parentGoalId ? { parentGoalId: initial.parentGoalId } : {}),
      title: title.trim(),
      horizon,
      deadline,
      status: existing?.status || 'active',
      ...(note.trim() ? { note: note.trim() } : {}),
      deferredCount: existing?.deferredCount ?? 0,
      ...(existing?.linkedEntryIds ? { linkedEntryIds: existing.linkedEntryIds } : {}),
    };
    await onSave(data);
    setSaving(false);
  };

  const titleLabel = parentGoal
    ? mode === 'edit' ? 'Редактировать подзадачу' : 'Новая подзадача'
    : mode === 'edit' ? 'Редактировать цель' : 'Новая цель';

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onCancel}>Отмена</button>
        <span className="header-title">{titleLabel}</span>
        <button
          className="text-btn primary"
          onClick={handleSubmit}
          disabled={saving || !title.trim() || !deadline}
        >
          {saving ? '…' : 'Сохранить'}
        </button>
      </header>

      <div className="form-body">
        {parentGoal && (
          <p className="preview-note muted">
            Часть цели «{parentGoal.title}»
          </p>
        )}

        <div className="field-group">
          <label className="field-label">Название</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                className={`field-textarea${status === 'recording' && activeField === 'title' ? ' recording-border' : ''}`}
                value={title}
                onChange={e => setTitle(e.target.value)}
                rows={2}
                placeholder="Что хотите сделать?"
              />
              {status === 'recording' && activeField === 'title' && interimText && (
                <p className="interim-preview">{interimText}</p>
              )}
            </div>
            {supported && (
              <button
                type="button"
                className={`mic-inline-btn${status === 'recording' && activeField === 'title' ? ' recording' : ''}`}
                onClick={() => handleMic('title')}
                aria-label={status === 'recording' && activeField === 'title' ? 'Остановить запись' : 'Голосовой ввод'}
              >
                🎙
              </button>
            )}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Горизонт</label>
          <div className="field-tabs">
            {HORIZON_OPTIONS.filter(o => allowedHorizons.includes(o.key)).map(o => (
              <button
                key={o.key}
                className={`field-tab${horizon === o.key ? ' active' : ''}`}
                onClick={() => pickHorizon(o.key)}
              >
                {o.icon} {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Дедлайн</label>
          <input
            type="date"
            className="settings-input"
            value={dateToInputValue(deadline)}
            onChange={e => setDeadline(inputValueToDdmmyyyy(e.target.value))}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Заметка (необязательно)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                className={`field-textarea${status === 'recording' && activeField === 'note' ? ' recording-border' : ''}`}
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="Почему это важно? Что мешает? Что чувствуете об этом?"
              />
              {status === 'recording' && activeField === 'note' && interimText && (
                <p className="interim-preview">{interimText}</p>
              )}
            </div>
            {supported && (
              <button
                type="button"
                className={`mic-inline-btn${status === 'recording' && activeField === 'note' ? ' recording' : ''}`}
                onClick={() => handleMic('note')}
                aria-label={status === 'recording' && activeField === 'note' ? 'Остановить запись' : 'Голосовой ввод'}
              >
                🎙
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
