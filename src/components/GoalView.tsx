import { useMemo } from 'react';
import type { Goal, GoalStatus } from '../types';

interface Props {
  goal: Goal;
  // All goals so we can locate subtasks (parentGoalId === goal.goalId).
  allGoals: Goal[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSubtask: () => void;
  onOpenSubtask: (id: number) => void;
  onSetStatus: (status: GoalStatus) => void;
  onDeferDeadline: () => void;
  // Spawn a planned "Дело" linked back to this goal.
  onLinkAsTask: () => void;
}

function ddmmyyyyToDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function daysLeft(deadline: string): number | null {
  const d = ddmmyyyyToDate(deadline);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

const HORIZON_LABEL = { month: 'Месяц', week: 'Неделя', day: 'День' };
const HORIZON_ICON = { month: '📅', week: '🗓', day: '📌' };

export function GoalView({
  goal, allGoals, onBack, onEdit, onDelete,
  onAddSubtask, onOpenSubtask, onSetStatus, onDeferDeadline, onLinkAsTask,
}: Props) {
  const subtasks = useMemo(
    () =>
      allGoals
        .filter(g => g.parentGoalId === goal.goalId)
        .sort((a, b) => {
          if (a.status !== b.status) {
            if (a.status === 'active') return -1;
            if (b.status === 'active') return 1;
          }
          const da = daysLeft(a.deadline) ?? 9999;
          const db = daysLeft(b.deadline) ?? 9999;
          return da - db;
        }),
    [allGoals, goal.goalId]
  );

  const isSubtask = !!goal.parentGoalId;
  const parent = isSubtask ? allGoals.find(g => g.goalId === goal.parentGoalId) : null;
  // Two-level cap: subtasks can't have their own subtasks (only day-level can
  // be linked as a Дело — which is conceptually the third level).
  const canAddSubtask = !isSubtask && goal.horizon !== 'day' && goal.status === 'active';
  const canLinkAsTask = goal.status === 'active' && (goal.horizon === 'day' || isSubtask);

  const dl = daysLeft(goal.deadline);
  const dlText = dl === null
    ? goal.deadline || '—'
    : dl < 0 ? `${goal.deadline} (просрочено на ${-dl} дн.)`
    : dl === 0 ? `${goal.deadline} (сегодня)`
    : dl === 1 ? `${goal.deadline} (завтра)`
    : `${goal.deadline} (через ${dl} дн.)`;

  const confirmDelete = () => {
    const msg = subtasks.length > 0
      ? `Удалить эту цель и ${subtasks.length} подзадач(и)?`
      : 'Удалить эту цель?';
    if (window.confirm(msg)) onDelete();
  };

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title">
          {HORIZON_ICON[goal.horizon]} {HORIZON_LABEL[goal.horizon]}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="text-btn" onClick={onEdit} title="Редактировать">✏️</button>
          <button className="text-btn danger" onClick={confirmDelete} title="Удалить">🗑️</button>
        </div>
      </header>

      <div className="form-body">
        {parent && (
          <p className="preview-note muted">
            Часть цели «{parent.title}»
          </p>
        )}

        <div className="view-section">
          <div className="view-label">Название</div>
          <div className="view-text" style={{ fontSize: 17, fontWeight: 500 }}>
            {goal.title}
          </div>
        </div>

        <div className="view-section">
          <div className="view-label">Дедлайн</div>
          <div className="view-text">{dlText}</div>
        </div>

        <div className="view-section">
          <div className="view-label">Статус</div>
          <div className="view-text">
            {goal.status === 'active' && '🟢 Активна'}
            {goal.status === 'done' && '✅ Выполнена'}
            {goal.status === 'cancelled' && '✕ Отменена'}
            {goal.deferredCount > 0 && (
              <span className="muted" style={{ marginLeft: 10, fontSize: 13 }}>
                · перенесена {goal.deferredCount} раз
              </span>
            )}
          </div>
        </div>

        {goal.note && (
          <div className="view-section">
            <div className="view-label">Заметка</div>
            <div className="view-text" style={{ whiteSpace: 'pre-wrap' }}>{goal.note}</div>
          </div>
        )}

        {/* Status actions */}
        {goal.status === 'active' && (
          <div className="evaluate-actions" style={{ marginTop: 16 }}>
            <button className="settings-btn primary" onClick={() => onSetStatus('done')}>
              ✅ Готово
            </button>
            <button className="settings-btn secondary" onClick={onDeferDeadline}>
              ↻ Перенести дедлайн
            </button>
            <button className="settings-btn secondary" onClick={() => onSetStatus('cancelled')}>
              ✕ Отменить цель
            </button>
          </div>
        )}
        {goal.status !== 'active' && (
          <button
            className="settings-btn secondary"
            style={{ marginTop: 12 }}
            onClick={() => onSetStatus('active')}
          >
            ↺ Вернуть в активные
          </button>
        )}

        {/* Subtasks section */}
        {(canAddSubtask || subtasks.length > 0) && (
          <div className="planned-section" style={{ marginTop: 20 }}>
            <div className="planned-section-title">
              Шаги{subtasks.length > 0 ? ` (${subtasks.length})` : ''}
            </div>
            {subtasks.map(s => {
              const sdl = daysLeft(s.deadline);
              const tone = sdl === null ? '' : sdl < 0 ? 'late' : sdl <= 1 ? 'warn' : 'ok';
              return (
                <div
                  key={s.id}
                  className="entry-card planned-card"
                  onClick={() => onOpenSubtask(s.id)}
                  style={s.status !== 'active' ? { opacity: 0.6 } : undefined}
                >
                  <div className="entry-card-meta">
                    <span className="entry-card-date">
                      <span>{HORIZON_ICON[s.horizon]}</span>
                      {s.status === 'active' && (
                        <span className={`goal-deadline goal-deadline-${tone}`}>
                          {sdl === null ? s.deadline
                            : sdl < 0 ? `просрочено ${-sdl} дн.`
                            : sdl === 0 ? 'сегодня'
                            : sdl === 1 ? 'завтра'
                            : `через ${sdl} дн.`}
                        </span>
                      )}
                      {s.status === 'done' && <span className="muted">✅</span>}
                      {s.status === 'cancelled' && <span className="muted">✕</span>}
                    </span>
                  </div>
                  <div className="entry-card-preview">{s.title}</div>
                </div>
              );
            })}
            {canAddSubtask && (
              <button
                className="settings-btn secondary"
                style={{ marginTop: 10 }}
                onClick={onAddSubtask}
              >
                + Добавить шаг {goal.horizon === 'month' ? '(на неделю)' : '(на день)'}
              </button>
            )}
          </div>
        )}

        {canLinkAsTask && (
          <button
            className="settings-btn primary"
            style={{ marginTop: 16 }}
            onClick={onLinkAsTask}
          >
            ✅ Запланировать как дело на сегодня
          </button>
        )}
      </div>
    </div>
  );
}
