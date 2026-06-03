import { useState, useMemo } from 'react';
import type { DiaryEntry, SheetType } from '../types';
import { formatShortDate } from '../utils/dateFormat';

interface Props {
  entries: DiaryEntry[];
  onView: (id: number) => void;
  onEvaluate: (id: number) => void;
  onNew: (sheetType?: SheetType) => void;
  onLock: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onGoals: () => void;
}

function isPlanned(e: DiaryEntry): boolean {
  return e.sheetType === 'tasks' && e.status === 'planned';
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'Все' },
  { key: 'emotions', label: '💭 Эмоции' },
  { key: 'tasks', label: '✅ Дела' },
] as const;

type FilterKey = (typeof FILTER_OPTIONS)[number]['key'];

function getPreview(entry: DiaryEntry): string {
  if (entry.sheetType === 'emotions') return entry.situation;
  return entry.activity;
}

function getTag(entry: DiaryEntry): string {
  if (entry.sheetType === 'emotions') return entry.emotions;
  return entry.sphere;
}

function clip(text: string, max = 80) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function EntryList({ entries, onView, onEvaluate, onNew, onLock, onSettings, onHelp, onGoals }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  // Today's still-planned tasks — surfaced as a dedicated "to do" section above
  // the regular log. Ordered by planned time so the day reads top-to-bottom.
  const plannedToday = useMemo(() => {
    if (query.trim() || filter === 'emotions') return [];
    return entries
      .filter(e => isPlanned(e) && isToday(e.createdAt))
      .sort((a, b) => (a.sheetType === 'tasks' && b.sheetType === 'tasks'
        ? (a.time || '').localeCompare(b.time || '')
        : 0));
  }, [entries, query, filter]);

  const plannedIds = useMemo(() => new Set(plannedToday.map(e => e.id)), [plannedToday]);

  const filtered = useMemo(() => {
    let list = entries.filter(e => !plannedIds.has(e.id));
    if (filter !== 'all') list = list.filter(e => e.sheetType === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(e => {
        const searchable =
          e.sheetType === 'emotions'
            ? [e.situation, e.thoughts, e.emotions, e.behavior]
            : [e.activity, e.sphere, e.importance, e.difficulty, e.pleasure];
        return searchable.some(f => f.toLowerCase().includes(q));
      });
    }
    return list;
  }, [entries, query, filter, plannedIds]);

  return (
    <div className="screen">
      <header className="app-header">
        <h1 className="app-title-sm">ABCDiary</h1>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn" onClick={onGoals} title="Цели">🎯</button>
          <button className="icon-btn help" onClick={onHelp} title="Инструкция">?</button>
          <button className="icon-btn" onClick={onSettings} title="Настройки">⚙️</button>
          <button className="icon-btn" onClick={onLock} title="Заблокировать">🔒</button>
        </div>
      </header>

      <div className="search-area">
        <input
          className="search-input"
          type="search"
          placeholder="Поиск по записям…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="field-tabs">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.key}
              className={`field-tab${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {plannedToday.length > 0 && (
        <div className="planned-section">
          <div className="planned-section-title">🗓 План на сегодня</div>
          {plannedToday.map(e => {
            if (e.sheetType !== 'tasks') return null;
            return (
              <div key={e.id} className="entry-card planned-card" onClick={() => onEvaluate(e.id)}>
                <div className="entry-card-meta">
                  <span className="entry-card-date">
                    {e.time && <span className="entry-card-time">{e.time}</span>}
                    {e.importance && <span className="planned-importance" title="Важность">❗{e.importance}</span>}
                    {e.urgency && <span className="planned-importance" title="Срочность">⏰{e.urgency}</span>}
                  </span>
                  <span className="planned-cta">Оценить ›</span>
                </div>
                <div className="entry-card-preview">
                  {e.activity ? clip(e.activity) : <span className="muted">Без названия</span>}
                </div>
                {e.sphere && <div className="entry-card-tag">{clip(e.sphere, 50)}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="entry-list">
        {filtered.length === 0 && plannedToday.length === 0 && (
          <p className="empty-state">
            {query || filter !== 'all'
              ? 'Ничего не найдено'
              : 'Нажмите + чтобы добавить первую запись'}
          </p>
        )}
        {filtered.map(e => {
          const preview = getPreview(e);
          const tag = getTag(e);
          return (
            <div key={e.id} className="entry-card" onClick={() => onView(e.id)}>
              <div className="entry-card-meta">
                <span className="entry-card-date">
                  {formatShortDate(e.createdAt)}
                  {e.sheetType === 'tasks' && e.time && (
                    <span className="entry-card-time">{e.time}</span>
                  )}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {e.sheetType === 'tasks' && (e.importance || e.urgency || e.difficulty || e.pleasure) && (
                    <span className="entry-card-scores">
                      {e.importance && <span title="Важность">❗{e.importance}</span>}
                      {e.urgency && <span title="Срочность">⏰{e.urgency}</span>}
                      {e.difficulty && <span title="Сложность">💪{e.difficulty}</span>}
                      {e.pleasure && <span title="Удовлетворение">😊{e.pleasure}</span>}
                      {e.enjoyment && <span title="Удовольствие">😍{e.enjoyment}</span>}
                    </span>
                  )}
                  <span className="entry-type-badge">
                    {e.sheetType === 'emotions' ? '💭' : e.status === 'done' ? '✅' : '📋'}
                  </span>
                </div>
              </div>
              <div className="entry-card-preview">
                {preview ? clip(preview) : <span className="muted">Нет текста</span>}
              </div>
              {tag && <div className="entry-card-tag">{clip(tag, 50)}</div>}
            </div>
          );
        })}
      </div>

      <button
        className="fab"
        onClick={() => onNew(filter === 'emotions' ? 'emotions' : filter === 'tasks' ? 'tasks' : undefined)}
      >+</button>
    </div>
  );
}
