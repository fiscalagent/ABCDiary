import { useState, useMemo } from 'react';
import type { Goal, GoalHorizon } from '../types';
import { daysLeft } from '../utils/parsing';

interface Props {
  goals: Goal[];
  onView: (id: number) => void;
  onNew: (horizon?: GoalHorizon) => void;
  onBack: () => void;
}

const HORIZON_TABS: { key: GoalHorizon | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'month', label: '📅 Месяц' },
  { key: 'week', label: '🗓 Неделя' },
  { key: 'day', label: '📌 День' },
];

function deadlineLabel(deadline: string): { text: string; tone: 'ok' | 'warn' | 'late' } {
  const dl = daysLeft(deadline);
  if (dl === null) return { text: deadline || '—', tone: 'ok' };
  if (dl < 0) return { text: `Просрочено на ${-dl} дн.`, tone: 'late' };
  if (dl === 0) return { text: 'Сегодня', tone: 'warn' };
  if (dl === 1) return { text: 'Завтра', tone: 'warn' };
  if (dl <= 3) return { text: `Через ${dl} дн.`, tone: 'warn' };
  return { text: `Через ${dl} дн.`, tone: 'ok' };
}

export function GoalList({ goals, onView, onNew, onBack }: Props) {
  const [filter, setFilter] = useState<GoalHorizon | 'all'>('all');

  const { topLevel, subtaskCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of goals) {
      if (g.parentGoalId && g.status === 'active') {
        counts[g.parentGoalId] = (counts[g.parentGoalId] || 0) + 1;
      }
    }
    let top = goals.filter(g => !g.parentGoalId);
    if (filter !== 'all') top = top.filter(g => g.horizon === filter);
    // Active first, then sort by deadline (closest first), then by createdAt desc.
    top.sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'active') return -1;
        if (b.status === 'active') return 1;
      }
      const da = daysLeft(a.deadline) ?? 9999;
      const db = daysLeft(b.deadline) ?? 9999;
      if (da !== db) return da - db;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    return { topLevel: top, subtaskCount: counts };
  }, [goals, filter]);

  // Refinement nudge: active month-goals with no active subtasks, or active
  // week-goals due within 7 days that have no day-level subtasks.
  const refineCount = useMemo(() => {
    let n = 0;
    for (const g of goals) {
      if (g.parentGoalId || g.status !== 'active') continue;
      const subs = subtaskCount[g.goalId] || 0;
      const dl = daysLeft(g.deadline);
      if (g.horizon === 'month' && subs === 0) n++;
      else if (g.horizon === 'week' && subs === 0 && dl !== null && dl <= 7) n++;
    }
    return n;
  }, [goals, subtaskCount]);

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title">🎯 Цели</span>
        <div className="header-actions" />
      </header>

      <div className="search-area">
        <div className="field-tabs">
          {HORIZON_TABS.map(t => (
            <button
              key={t.key}
              className={`field-tab${filter === t.key ? ' active' : ''}`}
              onClick={() => setFilter(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {refineCount > 0 && (
        <div className="planned-section">
          <div className="planned-section-title">
            ✨ {refineCount} {refineCount === 1 ? 'цель ждёт' : 'цели(ей) ждут'} декомпозиции
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '4px 14px 8px' }}>
            Откройте цель и добавьте шаги поменьше: эпик на месяц → подзадачи на неделю → дела на день.
          </p>
        </div>
      )}

      <div className="entry-list">
        {topLevel.length === 0 && (
          <p className="empty-state">
            {filter === 'all'
              ? 'Нажмите + чтобы поставить первую цель'
              : 'Здесь пока ничего нет'}
          </p>
        )}
        {topLevel.map(g => {
          const dl = deadlineLabel(g.deadline);
          const subs = subtaskCount[g.goalId] || 0;
          const isDone = g.status === 'done';
          const isCancelled = g.status === 'cancelled';
          const horizonIcon = g.horizon === 'month' ? '📅' : g.horizon === 'week' ? '🗓' : '📌';
          return (
            <div
              key={g.id}
              className="entry-card"
              onClick={() => onView(g.id)}
              style={isDone || isCancelled ? { opacity: 0.6 } : undefined}
            >
              <div className="entry-card-meta">
                <span className="entry-card-date">
                  <span>{horizonIcon}</span>
                  {!isDone && !isCancelled && (
                    <span className={`goal-deadline goal-deadline-${dl.tone}`}>{dl.text}</span>
                  )}
                  {isDone && <span className="muted">✅ Выполнена</span>}
                  {isCancelled && <span className="muted">✕ Отменена</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {g.deferredCount > 0 && (
                    <span className="entry-card-scores" title="Перенесена">
                      <span>↻{g.deferredCount}</span>
                    </span>
                  )}
                  {subs > 0 && (
                    <span className="entry-type-badge" title="Активных подзадач">
                      {subs}
                    </span>
                  )}
                </div>
              </div>
              <div className="entry-card-preview">
                {g.title || <span className="muted">Без названия</span>}
              </div>
              {g.note && <div className="entry-card-tag">{g.note.slice(0, 60)}{g.note.length > 60 ? '…' : ''}</div>}
            </div>
          );
        })}
      </div>

      <button
        className="fab"
        onClick={() => onNew(filter === 'all' ? undefined : filter)}
      >+</button>
    </div>
  );
}
