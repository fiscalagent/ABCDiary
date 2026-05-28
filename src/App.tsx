import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from './db';
import type { DiaryEntry, EntryData, SheetType, Goal, GoalData, GoalStatus, GoalHorizon, TaskData } from './types';
import { encryptData, decryptData } from './crypto';
import type { GoogleConfig } from './utils/gsheets';
import {
  loadGoogleConfig,
  saveGoogleConfig,
  revokeGoogleToken,
  initGoogleAuth,
  signInInteractive,
  isSignedIn,
  getActiveAccount,
  exportEntryToSheet,
  exportGoalToSheet,
  extractSpreadsheetId,
} from './utils/gsheets';
import { CHANGELOG } from './changelog';
import { useAppUpdate } from './hooks/useAppUpdate';
import { PinSetup } from './components/PinSetup';
import { PinLock } from './components/PinLock';
import { EntryList } from './components/EntryList';
import { EntryForm } from './components/EntryForm';
import { EntryView } from './components/EntryView';
import { HelpScreen } from './components/HelpScreen';
import { GoalList } from './components/GoalList';
import { GoalForm } from './components/GoalForm';
import { GoalView } from './components/GoalView';

type Screen =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'locked' }
  | { name: 'list' }
  | { name: 'new'; sheetType?: SheetType; prefill?: Partial<EntryData> }
  | { name: 'view'; entryId: number }
  | { name: 'edit'; entryId: number }
  | { name: 'evaluate'; entryId: number }
  | { name: 'googleSettings' }
  | { name: 'help' }
  | { name: 'goals' }
  | { name: 'goalNew'; horizon?: GoalHorizon; parentGoalId?: string }
  | { name: 'goalView'; goalDbId: number }
  | { name: 'goalEdit'; goalDbId: number };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig | null>(null);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [syncToast, setSyncToast] = useState('');
  const { updateAvailable, applyUpdate } = useAppUpdate();

  useEffect(() => {
    db.settings.count().then(n => {
      setScreen(n === 0 ? { name: 'setup' } : { name: 'locked' });
    });
    const cfg = loadGoogleConfig();
    if (cfg) {
      setGoogleConfig(cfg);
      setTimeout(() => initGoogleAuth(), 500);
    }
  }, []);

  const goBack = useCallback(() => {
    if (screen.name === 'new' || screen.name === 'googleSettings' || screen.name === 'view' || screen.name === 'help' || screen.name === 'evaluate' || screen.name === 'goals') {
      setScreen({ name: 'list' });
    } else if (screen.name === 'edit') {
      setScreen({ name: 'view', entryId: screen.entryId });
    } else if (screen.name === 'goalNew') {
      // If creating a subtask, return to its parent's view rather than the goals list.
      if (screen.parentGoalId) {
        const parent = goals.find(g => g.goalId === screen.parentGoalId);
        if (parent) {
          setScreen({ name: 'goalView', goalDbId: parent.id });
          return;
        }
      }
      setScreen({ name: 'goals' });
    } else if (screen.name === 'goalView') {
      setScreen({ name: 'goals' });
    } else if (screen.name === 'goalEdit') {
      setScreen({ name: 'goalView', goalDbId: screen.goalDbId });
    }
  }, [screen, goals]);

  // Push a history entry when entering sub-screens so Android back button triggers popstate
  const prevScreenName = useRef(screen.name);
  useEffect(() => {
    const subScreens = ['new', 'view', 'edit', 'evaluate', 'googleSettings', 'help', 'goals', 'goalNew', 'goalView', 'goalEdit'];
    if (subScreens.includes(screen.name) && prevScreenName.current !== screen.name) {
      history.pushState(null, '');
    }
    prevScreenName.current = screen.name;
  }, [screen.name]);

  useEffect(() => {
    window.addEventListener('popstate', goBack);
    return () => window.removeEventListener('popstate', goBack);
  }, [goBack]);

  const loadEntries = useCallback(async (key: CryptoKey) => {
    const raw = await db.entries.orderBy('createdAt').reverse().toArray();
    const decrypted = await Promise.all(
      raw.map(async r => {
        const data = await decryptData(r.iv, r.ciphertext, key) as EntryData;
        // Legacy tasks (pre-1.5.0) had no status field — they were all entered
        // post-hoc, so treat them as completed. Done lazily on read; persisted
        // next time the entry is saved.
        if (data.sheetType === 'tasks' && !data.status) {
          data.status = 'done';
        }
        return {
          ...data,
          id: r.id!,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        } as DiaryEntry;
      })
    );
    setEntries(decrypted);
  }, []);

  const loadGoals = useCallback(async (key: CryptoKey) => {
    const raw = await db.goals.orderBy('createdAt').reverse().toArray();
    const decrypted = await Promise.all(
      raw.map(async r => {
        const data = await decryptData(r.iv, r.ciphertext, key) as GoalData;
        return {
          ...data,
          id: r.id!,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        } as Goal;
      })
    );
    setGoals(decrypted);
  }, []);

  const handleUnlock = useCallback(
    async (key: CryptoKey) => {
      setCryptoKey(key);
      await Promise.all([loadEntries(key), loadGoals(key)]);
      setScreen({ name: 'list' });
    },
    [loadEntries, loadGoals]
  );

  const handleSave = async (data: EntryData, editId?: number) => {
    if (!cryptoKey) return;
    const now = Date.now();

    if (!data.entryId) {
      data = { ...data, entryId: crypto.randomUUID() };
    }

    const { iv, ciphertext } = await encryptData(data, cryptoKey);
    let dbId: number;
    if (editId !== undefined) {
      await db.entries.update(editId, { iv, ciphertext, updatedAt: now });
      dbId = editId;
    } else {
      dbId = (await db.entries.add({ iv, ciphertext, createdAt: now, updatedAt: now })) as number;
    }
    await loadEntries(cryptoKey);
    setScreen({ name: 'list' });

    if (googleConfig) {
      const existingEntry = entries.find(e => e.id === editId);
      const fullEntry: DiaryEntry = {
        ...data,
        id: dbId,
        createdAt: existingEntry?.createdAt ?? new Date(now),
        updatedAt: new Date(now),
      } as DiaryEntry;
      exportEntryToSheet(googleConfig, fullEntry)
        .then(() => {
          setSyncToast('✅ Синхронизировано с таблицей');
          setTimeout(() => setSyncToast(''), 3000);
        })
        .catch(err => {
          setSyncToast(`⚠️ Ошибка синхронизации: ${err instanceof Error ? err.message : String(err)}`);
          setTimeout(() => setSyncToast(''), 6000);
        });
    }
  };

  const handleDelete = async (id: number) => {
    await db.entries.delete(id);
    if (cryptoKey) await loadEntries(cryptoKey);
    setScreen({ name: 'list' });
  };

  // Persist a goal (create or update). Optimistically updates the list and
  // fires off a Google Sheets sync in the background, mirroring handleSave.
  const persistGoal = useCallback(
    async (data: GoalData, editDbId?: number): Promise<Goal> => {
      if (!cryptoKey) throw new Error('locked');
      const now = Date.now();
      const { iv, ciphertext } = await encryptData(data, cryptoKey);
      let dbId: number;
      let createdAt: number;
      if (editDbId !== undefined) {
        const existing = goals.find(g => g.id === editDbId);
        createdAt = existing?.createdAt.getTime() ?? now;
        await db.goals.update(editDbId, { iv, ciphertext, updatedAt: now });
        dbId = editDbId;
      } else {
        createdAt = now;
        dbId = (await db.goals.add({ iv, ciphertext, createdAt: now, updatedAt: now })) as number;
      }
      const goal: Goal = {
        ...data,
        id: dbId,
        createdAt: new Date(createdAt),
        updatedAt: new Date(now),
      };
      await loadGoals(cryptoKey);
      if (googleConfig) {
        exportGoalToSheet(googleConfig, goal)
          .then(() => {
            setSyncToast('✅ Цель синхронизирована');
            setTimeout(() => setSyncToast(''), 3000);
          })
          .catch(err => {
            setSyncToast(`⚠️ Ошибка синхронизации: ${err instanceof Error ? err.message : String(err)}`);
            setTimeout(() => setSyncToast(''), 6000);
          });
      }
      return goal;
    },
    [cryptoKey, goals, googleConfig, loadGoals]
  );

  const handleSaveGoal = async (data: GoalData, editDbId?: number) => {
    await persistGoal(data, editDbId);
    if (data.parentGoalId) {
      // Saved a subtask → bounce back to the parent's view so the user sees
      // their new step land in context.
      const parent = goals.find(g => g.goalId === data.parentGoalId);
      if (parent) {
        setScreen({ name: 'goalView', goalDbId: parent.id });
        return;
      }
    }
    setScreen({ name: 'goals' });
  };

  // Delete a goal and all its subtasks (the user already confirmed in the view).
  const handleDeleteGoal = async (dbId: number) => {
    if (!cryptoKey) return;
    const target = goals.find(g => g.id === dbId);
    if (!target) return;
    const subIds = goals.filter(g => g.parentGoalId === target.goalId).map(g => g.id);
    await db.goals.bulkDelete([dbId, ...subIds]);
    await loadGoals(cryptoKey);
    setScreen({ name: 'goals' });
  };

  const handleSetGoalStatus = async (goal: Goal, status: GoalStatus) => {
    const data: GoalData = {
      goalId: goal.goalId,
      ...(goal.parentGoalId ? { parentGoalId: goal.parentGoalId } : {}),
      title: goal.title,
      horizon: goal.horizon,
      deadline: goal.deadline,
      status,
      ...(goal.note ? { note: goal.note } : {}),
      deferredCount: goal.deferredCount,
      ...(goal.linkedEntryIds ? { linkedEntryIds: goal.linkedEntryIds } : {}),
    };
    await persistGoal(data, goal.id);
  };

  // "Soft" deferral: push the deadline forward by one horizon-step and bump
  // the deferredCount so we can see, without judgement, how often it slipped.
  const handleDeferGoalDeadline = async (goal: Goal) => {
    const m = goal.deadline.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (goal.horizon === 'day') d.setDate(d.getDate() + 1);
    else if (goal.horizon === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    const newDeadline =
      `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    const data: GoalData = {
      goalId: goal.goalId,
      ...(goal.parentGoalId ? { parentGoalId: goal.parentGoalId } : {}),
      title: goal.title,
      horizon: goal.horizon,
      deadline: newDeadline,
      status: goal.status,
      ...(goal.note ? { note: goal.note } : {}),
      deferredCount: goal.deferredCount + 1,
      ...(goal.linkedEntryIds ? { linkedEntryIds: goal.linkedEntryIds } : {}),
    };
    await persistGoal(data, goal.id);
  };

  // Spawn a planned "Дело" pre-filled from the goal. The new task is saved
  // immediately with today's date and status=planned, then the user lands on
  // the list and can tap it to add time/importance/etc. before the day is out.
  const handleLinkGoalAsTask = async (goal: Goal) => {
    if (!cryptoKey) return;
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    const parent = goal.parentGoalId ? goals.find(g => g.goalId === goal.parentGoalId) : null;
    const entryId = crypto.randomUUID();
    const task: TaskData = {
      sheetType: 'tasks',
      entryId,
      status: 'planned',
      time: '',
      date: dateStr,
      activity: goal.title,
      sphere: parent?.title || '',
      importance: '',
      difficulty: '',
      pleasure: '',
      enjoyment: '',
    };
    await handleSave(task);
    // Record the link on the goal side so we can show "linked to N дел" later.
    const linked = [...(goal.linkedEntryIds || []), entryId];
    const data: GoalData = {
      goalId: goal.goalId,
      ...(goal.parentGoalId ? { parentGoalId: goal.parentGoalId } : {}),
      title: goal.title,
      horizon: goal.horizon,
      deadline: goal.deadline,
      status: goal.status,
      ...(goal.note ? { note: goal.note } : {}),
      deferredCount: goal.deferredCount,
      linkedEntryIds: linked,
    };
    await persistGoal(data, goal.id);
    setSyncToast('✅ Дело добавлено в план на сегодня');
    setTimeout(() => setSyncToast(''), 3000);
  };

  const lock = () => {
    setCryptoKey(null);
    setEntries([]);
    setGoals([]);
    setScreen({ name: 'locked' });
  };

  const findEntry = (id: number) => entries.find(e => e.id === id);

  /* ── Google settings handlers ── */
  // Saving must also open the Google sign-in popup here, while still inside the
  // click gesture (everything before signInInteractive is synchronous), or the
  // browser blocks the popup. Saving settings alone never establishes a token.
  const handleSaveGoogleConfig = (spreadsheetId: string, accountEmail: string) => {
    const cfg: GoogleConfig = {
      spreadsheetId: extractSpreadsheetId(spreadsheetId),
      ...(accountEmail.trim() ? { accountEmail: accountEmail.trim() } : {}),
    };
    saveGoogleConfig(cfg);
    setGoogleConfig(cfg);
    initGoogleAuth();
    setSettingsMsg('Сохранено. Открываю вход в Google…');
    signInInteractive()
      .then(() => setSettingsMsg('✅ Сохранено, вход выполнен'))
      .catch(err =>
        setSettingsMsg(`Сохранено, но вход не удался: ${err instanceof Error ? err.message : String(err)}`)
      )
      .finally(() => setTimeout(() => setSettingsMsg(''), 5000));
  };

  const handleRevokeGoogle = () => {
    revokeGoogleToken();
    setSettingsMsg('Вышли из Google аккаунта');
    setTimeout(() => setSettingsMsg(''), 3000);
  };

  /* ── Screens ── */

  const toast = syncToast ? (
    <div className="sync-toast">{syncToast}</div>
  ) : null;

  const updateBanner = updateAvailable ? (
    <div className="update-banner">
      <span>Доступна новая версия</span>
      <button className="update-banner-btn" onClick={applyUpdate}>Обновить</button>
    </div>
  ) : null;

  if (screen.name === 'loading') {
    return <div className="screen center"><p className="muted">Загрузка…</p></div>;
  }
  if (screen.name === 'setup') {
    return <PinSetup onDone={() => setScreen({ name: 'locked' })} />;
  }
  if (screen.name === 'locked') {
    return <PinLock onUnlock={handleUnlock} />;
  }

  if (screen.name === 'help') {
    return (
      <>
        {updateBanner}
        <HelpScreen onBack={() => setScreen({ name: 'list' })} />
      </>
    );
  }

  if (screen.name === 'googleSettings') {
    return (
      <>
        {updateBanner}
        {toast}
        <GoogleSettingsScreen
          config={googleConfig}
          msg={settingsMsg}
          onSave={handleSaveGoogleConfig}
          onRevoke={handleRevokeGoogle}
          onBack={() => setScreen({ name: 'list' })}
        />
      </>
    );
  }

  if (screen.name === 'list') {
    return (
      <>
        {updateBanner}
        {toast}
        <EntryList
          entries={entries}
          onView={id => setScreen({ name: 'view', entryId: id })}
          onEvaluate={id => setScreen({ name: 'evaluate', entryId: id })}
          onNew={sheetType => setScreen({ name: 'new', sheetType })}
          onLock={lock}
          onSettings={() => setScreen({ name: 'googleSettings' })}
          onHelp={() => setScreen({ name: 'help' })}
          onGoals={() => setScreen({ name: 'goals' })}
        />
      </>
    );
  }
  if (screen.name === 'new') {
    return (
      <EntryForm
        initialSheetType={screen.sheetType}
        onSave={data => handleSave(data)}
        onCancel={() => setScreen({ name: 'list' })}
      />
    );
  }
  if (screen.name === 'edit') {
    const entry = findEntry(screen.entryId);
    if (!entry) return null;
    return (
      <EntryForm
        initial={entry}
        mode="edit"
        onSave={data => handleSave(data, entry.id)}
        onCancel={() => setScreen({ name: 'view', entryId: entry.id })}
      />
    );
  }
  if (screen.name === 'evaluate') {
    const entry = findEntry(screen.entryId);
    if (!entry || entry.sheetType !== 'tasks') return null;
    return (
      <EntryForm
        initial={entry}
        mode="evaluate"
        onSave={data => handleSave(data, entry.id)}
        onCancel={() => setScreen({ name: 'list' })}
      />
    );
  }
  if (screen.name === 'view') {
    const entry = findEntry(screen.entryId);
    if (!entry) return null;
    return (
      <>
        {updateBanner}
        {toast}
        <EntryView
          entry={entry}
          onEdit={() => setScreen({ name: 'edit', entryId: entry.id })}
          onEvaluate={
            entry.sheetType === 'tasks' && entry.status === 'planned'
              ? () => setScreen({ name: 'evaluate', entryId: entry.id })
              : undefined
          }
          onDelete={() => handleDelete(entry.id)}
          onBack={() => setScreen({ name: 'list' })}
        />
      </>
    );
  }

  /* ── Goals screens ── */

  if (screen.name === 'goals') {
    return (
      <>
        {updateBanner}
        {toast}
        <GoalList
          goals={goals}
          onView={id => setScreen({ name: 'goalView', goalDbId: id })}
          onNew={horizon => setScreen({ name: 'goalNew', horizon })}
          onBack={() => setScreen({ name: 'list' })}
        />
      </>
    );
  }
  if (screen.name === 'goalNew') {
    const parent = screen.parentGoalId
      ? goals.find(g => g.goalId === screen.parentGoalId)
      : undefined;
    return (
      <GoalForm
        mode="create"
        initial={{
          ...(screen.horizon ? { horizon: screen.horizon } : {}),
          ...(screen.parentGoalId ? { parentGoalId: screen.parentGoalId } : {}),
        }}
        parentGoal={parent}
        onSave={data => handleSaveGoal(data)}
        onCancel={() => {
          if (parent) setScreen({ name: 'goalView', goalDbId: parent.id });
          else setScreen({ name: 'goals' });
        }}
      />
    );
  }
  if (screen.name === 'goalView') {
    const goal = goals.find(g => g.id === screen.goalDbId);
    if (!goal) return null;
    return (
      <>
        {updateBanner}
        {toast}
        <GoalView
          goal={goal}
          allGoals={goals}
          onBack={() => {
            // Subtask view → back to parent goal; top-level view → goals list.
            if (goal.parentGoalId) {
              const parent = goals.find(g => g.goalId === goal.parentGoalId);
              if (parent) {
                setScreen({ name: 'goalView', goalDbId: parent.id });
                return;
              }
            }
            setScreen({ name: 'goals' });
          }}
          onEdit={() => setScreen({ name: 'goalEdit', goalDbId: goal.id })}
          onDelete={() => handleDeleteGoal(goal.id)}
          onAddSubtask={() => setScreen({ name: 'goalNew', parentGoalId: goal.goalId })}
          onOpenSubtask={id => setScreen({ name: 'goalView', goalDbId: id })}
          onSetStatus={status => handleSetGoalStatus(goal, status)}
          onDeferDeadline={() => handleDeferGoalDeadline(goal)}
          onLinkAsTask={() => handleLinkGoalAsTask(goal)}
        />
      </>
    );
  }
  if (screen.name === 'goalEdit') {
    const goal = goals.find(g => g.id === screen.goalDbId);
    if (!goal) return null;
    const parent = goal.parentGoalId
      ? goals.find(g => g.goalId === goal.parentGoalId)
      : undefined;
    return (
      <GoalForm
        mode="edit"
        initial={goal}
        existing={goal}
        parentGoal={parent}
        onSave={data => handleSaveGoal(data, goal.id)}
        onCancel={() => setScreen({ name: 'goalView', goalDbId: goal.id })}
      />
    );
  }
  return null;
}

/* ── About Section ── */

function AboutSection() {
  const [expanded, setExpanded] = useState(false);
  const latest = CHANGELOG[0];

  return (
    <>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
        ABCDiary v{__APP_VERSION__}<br />
        Голосовой дневник с шифрованием и Google Таблицами.<br />
        Все записи хранятся локально в зашифрованном виде.
      </p>
      <button
        className="settings-btn secondary"
        style={{ marginTop: 10 }}
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? 'Скрыть историю версий ▲' : 'История версий ▼'}
      </button>
      {expanded && (
        <div className="changelog">
          {CHANGELOG.map(entry => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-header">
                <span className="changelog-version">v{entry.version}</span>
                {entry.version === latest.version && (
                  <span className="changelog-badge">текущая</span>
                )}
                <span className="changelog-date">{entry.date}</span>
              </div>
              <ul className="changelog-list">
                {entry.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Google Settings Screen (inline component) ── */

interface GSProps {
  config: GoogleConfig | null;
  msg: string;
  onSave: (spreadsheetId: string, accountEmail: string) => void;
  onRevoke: () => void;
  onBack: () => void;
}

function GoogleSettingsScreen({ config, msg, onSave, onRevoke, onBack }: GSProps) {
  const [spreadsheetId, setSpreadsheetId] = useState(config?.spreadsheetId ?? '');
  const [accountEmail, setAccountEmail] = useState(config?.accountEmail ?? '');
  const [showHelp, setShowHelp] = useState(false);
  const [gsExpanded, setGsExpanded] = useState(false);
  // Configured tables show a compact summary; the form appears only on "edit".
  const [editing, setEditing] = useState(!config?.spreadsheetId);

  const connected = isSignedIn();
  const account = getActiveAccount();
  const tableTail = config?.spreadsheetId ? config.spreadsheetId.slice(-6) : '';

  if (showHelp) {
    return (
      <div className="screen">
        <header className="app-header">
          <button className="text-btn" onClick={() => setShowHelp(false)}>← Назад</button>
          <span className="header-title">Инструкция</span>
          <span style={{ minWidth: 64 }} />
        </header>
        <div className="form-body">
          <div className="help-card">
            <h3>Шаг 1 — Google Таблица</h3>
            <ol>
              <li>Создайте новую Google Таблицу</li>
              <li>Скопируйте ссылку на неё (из адресной строки<br />или через «Поделиться»)</li>
              <li>Вставьте ссылку в настройках и нажмите<br />«Сохранить и войти в Google»</li>
              <li>Листы «Эмоции» и «Дела» создадутся<br />автоматически при первой записи</li>
            </ol>
          </div>
          <div className="help-card">
            <h3>Шаг 2 — Доступ терапевта</h3>
            <ol>
              <li>Откройте таблицу в Google Sheets</li>
              <li>Нажмите «Поделиться»</li>
              <li>Добавьте email терапевта с нужными правами</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title">Настройки</span>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setShowHelp(true)} aria-label="Инструкция" title="Инструкция">❓</button>
          {config && (
            <button className="icon-btn" onClick={onRevoke} aria-label="Выйти из Google" title="Выйти из Google">🚪</button>
          )}
        </div>
      </header>
      <div className="form-body">
        <div className="settings-section">
          <button
            className="gs-toggle-btn"
            onClick={() => setGsExpanded(v => !v)}
            aria-expanded={gsExpanded}
          >
            <span className="gs-toggle-icon">📊</span>
            <span className="gs-toggle-label">Google Таблица</span>
            <span className="gs-toggle-arrow">{gsExpanded ? '▲' : '▼'}</span>
          </button>
          {gsExpanded && !editing && (
            <>
              <div className="gs-status">
                <span className={`gs-dot${connected ? ' on' : ''}`} />
                <div className="gs-status-text">
                  <span className="gs-status-title">
                    {connected ? 'Подключено' : 'Настроено'}
                  </span>
                  {account && <span className="gs-status-sub">{account}</span>}
                  {tableTail && <span className="gs-status-sub">Таблица: …{tableTail}</span>}
                </div>
              </div>
              <button className="settings-btn secondary" onClick={() => setEditing(true)}>
                ⚙️ Изменить настройки
              </button>
            </>
          )}

          {gsExpanded && editing && (
            <>
              <div className="field-group" style={{ marginTop: 12 }}>
                <label className="field-label">Ссылка на таблицу</label>
                <input
                  className="settings-input"
                  type="url"
                  value={spreadsheetId}
                  onChange={e => setSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Google-аккаунт (email)</label>
                <input
                  className="settings-input"
                  type="email"
                  value={accountEmail}
                  onChange={e => setAccountEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <p className="field-hint">
                  Запись отправляется от этого аккаунта без выбора при каждом сохранении.
                </p>
              </div>
              <button
                className="settings-btn primary"
                onClick={() => {
                  onSave(spreadsheetId, accountEmail);
                  if (config) setEditing(false);
                }}
                disabled={!spreadsheetId.trim()}
              >
                💾 Сохранить и войти в Google
              </button>
              {config && (
                <div className="gs-links">
                  <button className="gs-link" onClick={() => setEditing(false)}>
                    Отмена
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {msg && <p className="settings-msg">{msg}</p>}

        <div className="settings-section">
          <p className="settings-section-title">О приложении</p>
          <AboutSection />
        </div>
      </div>
    </div>
  );
}
