import { useMemo, useState } from 'react';
import type { MoodEntry } from '../types';
import { dateToDdmmyyyy } from '../utils/parsing';

interface Props {
  moods: MoodEntry[];
  onBack: () => void;
  onOpenDay: (dateStr: string) => void;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Heatmap bucket per the user's thresholds: ≤3 red, 4–5 yellow, 6–7 green, 8–10 bright green.
// Empty/unfilled slot → '' (renders as a neutral dot, not a colour).
function scoreClass(v: string | undefined): string {
  if (!v || v.trim() === '') return '';
  const n = Number(v);
  if (isNaN(n)) return '';
  if (n <= 3) return 'mood-cell-red';
  if (n <= 5) return 'mood-cell-yellow';
  if (n <= 7) return 'mood-cell-green';
  return 'mood-cell-bright';
}

const SLOT_LABEL: Record<'morning' | 'day' | 'evening', string> = {
  morning: 'Утро', day: 'День', evening: 'Вечер',
};

function dayTitle(entry: MoodEntry | undefined): string {
  if (!entry) return 'Нет данных';
  return (['morning', 'day', 'evening'] as const)
    .map(slot => `${SLOT_LABEL[slot]}: ${entry[slot] || '—'}`)
    .join(' · ');
}

export function MoodCalendar({ moods, onBack, onOpenDay }: Props) {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const byDate = useMemo(() => {
    const map = new Map<string, MoodEntry>();
    for (const m of moods) map.set(m.date, m);
    return map;
  }, [moods]);

  const prevMonth = () => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));

  const startDow = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title">😊 Настроение</span>
        <div className="header-actions" />
      </header>
      <div className="form-body">
        <div className="date-cal">
          <div className="date-cal-head">
            <button type="button" className="date-cal-nav" onClick={prevMonth} aria-label="Предыдущий месяц">‹</button>
            <span className="date-cal-title">{MONTHS_RU[view.m]} {view.y}</span>
            <button type="button" className="date-cal-nav" onClick={nextMonth} aria-label="Следующий месяц">›</button>
          </div>
          <div className="date-cal-weekdays">
            {WEEKDAYS.map(w => <span key={w} className="date-cal-wd">{w}</span>)}
          </div>
          <div className="date-cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={`e${i}`} className="date-cal-cell empty" />;
              const dateStr = dateToDdmmyyyy(new Date(view.y, view.m, d));
              const entry = byDate.get(dateStr);
              return (
                <button
                  type="button"
                  key={d}
                  className={`date-cal-cell mood-cal-cell${isToday(d) ? ' today' : ''}`}
                  onClick={() => onOpenDay(dateStr)}
                  title={dayTitle(entry)}
                >
                  <span className="mood-cal-daynum">{d}</span>
                  <span className="mood-cal-dots">
                    <span className={`mood-dot${entry ? ' ' + scoreClass(entry.morning) : ''}`} />
                    <span className={`mood-dot${entry ? ' ' + scoreClass(entry.day) : ''}`} />
                    <span className={`mood-dot${entry ? ' ' + scoreClass(entry.evening) : ''}`} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mood-legend">
          <span className="mood-legend-item"><span className="mood-legend-swatch mood-cell-red" />0–3</span>
          <span className="mood-legend-item"><span className="mood-legend-swatch mood-cell-yellow" />4–5</span>
          <span className="mood-legend-item"><span className="mood-legend-swatch mood-cell-green" />6–7</span>
          <span className="mood-legend-item"><span className="mood-legend-swatch mood-cell-bright" />8–10</span>
          <span className="mood-legend-item"><span className="mood-legend-swatch mood-legend-empty" />нет данных</span>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Три точки под числом — утро / день / вечер; серая точка — оценка ещё не поставлена. Нажмите на день, чтобы открыть или создать запись.
        </p>
      </div>
    </div>
  );
}
