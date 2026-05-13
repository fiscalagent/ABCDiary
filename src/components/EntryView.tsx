import { useState } from 'react';
import type { DiaryEntry } from '../types';
import type { GoogleConfig } from '../utils/gsheets';
import { exportEntryToSheet } from '../utils/gsheets';
import { formatDateTime } from '../utils/dateFormat';
import { shareEntry, printEntry } from '../utils/export';

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
  return [
    { label: 'Время', value: entry.time },
    { label: 'Дата', value: entry.date },
    { label: 'Занятие', value: entry.activity },
    { label: 'Сфера', value: entry.sphere },
    { label: 'Важность (1-10)', value: entry.importance },
    { label: 'Сложность (1-10)', value: entry.difficulty },
  ];
}

interface Props {
  entry: DiaryEntry;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
  googleConfig: GoogleConfig | null;
}

export function EntryView({ entry, onEdit, onDelete, onBack, googleConfig }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const confirmDelete = () => {
    if (window.confirm('Удалить эту запись?')) onDelete();
  };

  const handleExport = async () => {
    if (!googleConfig) {
      setExportMsg('Настройте Google Таблицу в настройках (⚙️)');
      setTimeout(() => setExportMsg(''), 4000);
      return;
    }
    setExporting(true);
    setExportMsg('');
    try {
      await exportEntryToSheet(googleConfig, entry);
      setExportMsg('✅ Добавлено в таблицу');
    } catch (err) {
      setExportMsg(`Ошибка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(''), 5000);
    }
  };

  const sections = getSections(entry);

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title header-date">
          {entry.sheetType === 'emotions' ? '💭 ' : '✅ '}
          {formatDateTime(entry.createdAt)}
        </span>
        <button className="text-btn danger" onClick={confirmDelete}>Удалить</button>
      </header>

      <div className="form-body">
        {sections.map(s => (
          <div key={s.label} className="view-section">
            <div className="view-label">{s.label}</div>
            <div className="view-text">{s.value || <span className="muted">—</span>}</div>
          </div>
        ))}
        {exportMsg && (
          <p className={`export-msg${exportMsg.startsWith('✅') ? ' success' : ' error'}`}>
            {exportMsg}
          </p>
        )}
      </div>

      <div className="action-bar">
        <button className="action-btn" onClick={onEdit}>✏️ Редактировать</button>
        <button className="action-btn" onClick={handleExport} disabled={exporting}>
          {exporting ? '…' : '📊 В таблицу'}
        </button>
        <button className="action-btn" onClick={() => shareEntry(entry)}>↗️ Поделиться</button>
        <button className="action-btn" onClick={() => printEntry(entry)}>🖨 PDF</button>
      </div>
    </div>
  );
}
