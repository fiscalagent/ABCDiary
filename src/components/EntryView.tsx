import type { DiaryEntry } from '../types';
import { formatDateTime } from '../utils/dateFormat';

interface SectionDef {
  label: string;
  value: string;
}

function getSections(entry: DiaryEntry): SectionDef[] {
  if (entry.sheetType === 'emotions') {
    return [
      { label: 'Время', value: entry.time },
      { label: 'Дата', value: entry.date },
      { label: 'Триггерная ситуация', value: entry.situation },
      { label: 'Мысли', value: entry.thoughts },
      { label: 'Эмоции', value: entry.emotions },
      { label: 'Поведение', value: entry.behavior },
    ];
  }
  const base: SectionDef[] = [
    { label: 'Дата', value: entry.date },
    { label: 'Занятие', value: entry.activity },
    { label: 'Сфера', value: entry.sphere },
    { label: entry.status === 'planned' ? 'Когда (план)' : 'Время', value: entry.time },
    { label: 'Важность (0-10)', value: entry.importance },
    { label: 'Срочность (0-10)', value: entry.urgency },
  ];
  // Hide empty rating rows for still-planned tasks — they're not yet meaningful.
  if (entry.status !== 'planned') {
    base.push(
      { label: 'Сложность (0-10)', value: entry.difficulty },
      { label: 'Удовольствие во время (0-10)', value: entry.enjoyment },
      { label: 'Удовлетворение после (0-10)', value: entry.pleasure },
    );
  }
  return base;
}

interface Props {
  entry: DiaryEntry;
  onEdit: () => void;
  onEvaluate?: () => void;
  onDelete: () => void;
  onBack: () => void;
}

export function EntryView({ entry, onEdit, onEvaluate, onDelete, onBack }: Props) {
  const confirmDelete = () => {
    if (window.confirm('Удалить эту запись?')) onDelete();
  };

  const sections = getSections(entry);

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title header-date">
          {entry.sheetType === 'emotions'
            ? '💭 '
            : entry.status === 'planned' ? '🗓 ' : '✅ '}
          {formatDateTime(entry.createdAt)}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="text-btn" onClick={onEdit} title="Редактировать">✏️</button>
          <button className="text-btn danger" onClick={confirmDelete} title="Удалить">🗑️</button>
        </div>
      </header>

      <div className="form-body">
        {entry.sheetType === 'tasks' && entry.status === 'planned' && onEvaluate && (
          <button className="settings-btn primary" onClick={onEvaluate} style={{ marginBottom: 16 }}>
            ⭐ Оценить выполнение
          </button>
        )}
        {sections.map(s => (
          <div key={s.label} className="view-section">
            <div className="view-label">{s.label}</div>
            <div className="view-text">{s.value || <span className="muted">—</span>}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
