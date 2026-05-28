import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from './db';
import type { DiaryEntry, EntryData, SheetType } from './types';
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

type Screen =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'locked' }
  | { name: 'list' }
  | { name: 'new'; sheetType?: SheetType }
  | { name: 'view'; entryId: number }
  | { name: 'edit'; entryId: number }
  | { name: 'evaluate'; entryId: number }
  | { name: 'googleSettings' }
  | { name: 'help' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
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
    if (screen.name === 'new' || screen.name === 'googleSettings' || screen.name === 'view' || screen.name === 'help' || screen.name === 'evaluate') {
      setScreen({ name: 'list' });
    } else if (screen.name === 'edit') {
      setScreen({ name: 'view', entryId: screen.entryId });
    }
  }, [screen]);

  // Push a history entry when entering sub-screens so Android back button triggers popstate
  const prevScreenName = useRef(screen.name);
  useEffect(() => {
    const subScreens = ['new', 'view', 'edit', 'evaluate', 'googleSettings', 'help'];
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

  const handleUnlock = useCallback(
    async (key: CryptoKey) => {
      setCryptoKey(key);
      await loadEntries(key);
      setScreen({ name: 'list' });
    },
    [loadEntries]
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

  const lock = () => {
    setCryptoKey(null);
    setEntries([]);
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
