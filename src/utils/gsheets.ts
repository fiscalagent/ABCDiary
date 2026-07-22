import type { DiaryEntry, Goal, GoalHorizon, GoalStatus, MoodEntry } from '../types';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => TokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

interface GoogleErrorResponse {
  type?: string;
  message?: string;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: ((response: TokenResponse) => void) | '';
  error_callback?: (error: GoogleErrorResponse) => void;
  login_hint?: string;
}

interface TokenClient {
  callback: ((response: TokenResponse) => void) | '';
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

export interface GoogleConfig {
  spreadsheetId: string;
  accountEmail?: string;
}

const GOOGLE_CLIENT_ID = '370573440901-0stejge8ol4dp528e5tqgg6akl4mboim.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const CONFIG_KEY = 'abcdiary_google_config';
const ACCOUNT_HINT_KEY = 'abcdiary_google_account';
const TOKEN_KEY = 'abcdiary_google_token';

let tokenClient: TokenClient | null = null;
let accessToken = '';
let tokenExpiry = 0;
// Set per-request so GIS popup failures (blocked/closed popup) reach the
// pending requestToken() promise instead of being silently dropped.
let currentErrorHandler: ((error: GoogleErrorResponse) => void) | null = null;

// Restore a cached token so reloads within its lifetime need no popup
try {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as { token: string; expiry: number };
    if (saved.expiry > Date.now()) {
      accessToken = saved.token;
      tokenExpiry = saved.expiry;
    }
  }
} catch { /* ignore malformed/inaccessible localStorage */ }

function storeToken(token: string, expiry: number): void {
  accessToken = token;
  tokenExpiry = expiry;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiry }));
  } catch { /* ignore (private browsing / quota) */ }
}

export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

export function loadGoogleConfig(): GoogleConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw) as GoogleConfig;
  } catch { /* ignore malformed/inaccessible localStorage */ }
  return null;
}

export function saveGoogleConfig(cfg: GoogleConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearGoogleConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

// The account hint: a user-configured email (Settings) takes priority over the
// one auto-detected on first sign-in.
function getAccountHint(): string | undefined {
  const configured = loadGoogleConfig()?.accountEmail?.trim();
  if (configured) return configured;
  return localStorage.getItem(ACCOUNT_HINT_KEY) ?? undefined;
}

// True while a non-expired access token is cached — i.e. saves will sync
// without any popup. Used by Settings to show the connection status.
export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiry;
}

// Email to show as the active account (configured one, else the detected one).
export function getActiveAccount(): string | undefined {
  return getAccountHint();
}

export function initGoogleAuth(): boolean {
  if (!window.google) return false;
  const login_hint = getAccountHint();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: '',
    error_callback: err => currentErrorHandler?.(err),
    ...(login_hint ? { login_hint } : {}),
  });
  return true;
}

export function revokeGoogleToken(): void {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = '';
  tokenExpiry = 0;
  tokenClient = null;
  localStorage.removeItem(ACCOUNT_HINT_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

// Request a token from GIS. `silent` uses prompt:'none' (no UI); resolves null
// if interaction would be required, so the caller can fall back to interactive.
function requestToken(silent: boolean): Promise<string | null> {
  // Silent attempts should fail fast so we can fall back to interactive;
  // interactive needs longer because the user is choosing an account.
  const timeoutMs = silent ? 10_000 : 90_000;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      currentErrorHandler = null;
      fn();
    };

    // A silent attempt that can't proceed (no UI) falls back to interactive;
    // an interactive failure surfaces to the user as a sync error.
    const fail = (message: string) =>
      finish(() => (silent ? resolve(null) : reject(new Error(message))));

    const timer = setTimeout(
      () => fail('Истекло время ожидания входа в Google. Попробуйте ещё раз.'),
      timeoutMs
    );

    // Popup blocked/closed/failed-to-open arrives here, not in callback
    currentErrorHandler = (err: GoogleErrorResponse) =>
      fail(err?.message || err?.type || 'Не удалось открыть окно входа Google.');

    tokenClient!.callback = (resp: TokenResponse) => {
      if (resp.error) {
        fail(resp.error_description || resp.error);
        return;
      }
      storeToken(resp.access_token, Date.now() + resp.expires_in * 1000 - 60_000);
      // Save account hint so future silent refreshes target the same account
      if (!localStorage.getItem(ACCOUNT_HINT_KEY)) {
        fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then(r => r.json())
          .then((info: { email?: string }) => {
            if (info.email) localStorage.setItem(ACCOUNT_HINT_KEY, info.email);
          })
          .catch(() => {});
      }
      finish(() => resolve(accessToken));
    };
    tokenClient!.requestAccessToken({ prompt: silent ? 'none' : '' });
  });
}

// Acquire a token via the interactive popup. MUST be called straight from a
// user gesture (button click) with no awaits before it, or the browser blocks
// the popup ("Failed to open popup window"). Auto-sync can't satisfy that —
// hence this dedicated sign-in entry point. Once it succeeds the token is
// cached and later saves refresh it silently without any popup.
export function signInInteractive(): Promise<void> {
  if (!tokenClient && !initGoogleAuth()) {
    return Promise.reject(
      new Error('Google Sign-In не загрузился. Проверьте интернет-соединение.')
    );
  }
  return requestToken(false).then(() => undefined);
}

async function waitForToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  if (!tokenClient) {
    for (let i = 0; i < 50 && !tokenClient; i++) {
      if (!initGoogleAuth()) await new Promise(r => setTimeout(r, 100));
    }
  }
  if (!tokenClient) throw new Error('Google Sign-In не загрузился. Проверьте интернет-соединение.');

  // Try a silent refresh first when we know the account; only prompt if it fails
  if (getAccountHint()) {
    const silent = await requestToken(true);
    if (silent) return silent;
  }
  const token = await requestToken(false);
  if (!token) throw new Error('Не удалось получить доступ к Google.');
  return token;
}

async function sheetsReq<T>(
  cfg: GoogleConfig,
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const token = await waitForToken();
  const res = await fetch(`${SHEETS_BASE}/${cfg.spreadsheetId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json() as T;
}

export const SHEET_NAMES: Record<string, string> = {
  emotions: 'Эмоции',
  tasks: 'Дела',
  goals: 'Цели',
  moods: 'Настроение',
};

const HORIZON_LABEL: Record<GoalHorizon, string> = {
  month: 'месяц',
  week: 'неделя',
  day: 'день',
};
const STATUS_LABEL: Record<GoalStatus, string> = {
  active: 'активна',
  done: 'выполнена',
  cancelled: 'отменена',
};

const HEADERS: Record<string, string[]> = {
  Эмоции: ['ID', 'Время', 'Дата', 'Триггерная ситуация', 'Мысли', 'Эмоции', 'Поведение'],
  // Status appended at the end so spreadsheets created before 1.5.0 keep their
  // existing column layout — the new column lands in J with an empty header.
  Дела: ['ID', 'Время', 'Дата', 'Занятие', 'Сфера', 'Важность (0-10)', 'Срочность (0-10)', 'Сложность (0-10)', 'Удовлетворение (0-10)', 'Удовольствие (0-10)', 'Статус'],
  Цели: ['ID', 'Родитель', 'Название', 'Горизонт', 'Дедлайн', 'Статус', 'Создана', 'Перенесена (раз)', 'Заметка'],
  Настроение: ['Дата', 'Утро', 'День', 'Вечер', 'Лекарство 1', 'Доза 1', 'Лекарство 2', 'Доза 2', 'Лекарство 3', 'Доза 3', 'Комментарий'],
};

export async function initSpreadsheet(cfg: GoogleConfig): Promise<void> {
  // Restricted to just the titles — an unfiltered spreadsheets.get also
  // returns per-sheet formatting/conditional-format metadata, which on a
  // long-lived spreadsheet can be large enough to make this the flakiest
  // request in the app (the one place we'd never otherwise exercise a big
  // GET, since every other call here fetches a single narrow range).
  const meta = await sheetsReq<{ sheets: { properties: { title: string } }[] }>(
    cfg,
    '?fields=sheets.properties.title'
  );
  const existing = new Set(meta.sheets.map(s => s.properties.title));

  const addRequests = Object.values(SHEET_NAMES)
    .filter(name => !existing.has(name))
    .map(name => ({ addSheet: { properties: { title: name } } }));

  if (addRequests.length > 0) {
    await sheetsReq(cfg, '/batchUpdate', 'POST', { requests: addRequests });
  }

  for (const [name, headers] of Object.entries(HEADERS)) {
    const range = encodeURIComponent(`${name}!A1:Z1`);
    const data = await sheetsReq<{ values?: string[][] }>(cfg, `/values/${range}`);
    if (!data.values?.[0]?.length) {
      await sheetsReq(
        cfg,
        `/values/${encodeURIComponent(name + '!A1')}?valueInputOption=USER_ENTERED`,
        'PUT',
        { values: [headers] }
      );
    }
  }
}

// Sheets returns this (English, locale-independent) when the target tab
// doesn't exist yet — meaning the spreadsheet hasn't been initialized.
function isMissingSheetError(err: unknown): boolean {
  return err instanceof Error && /unable to parse range/i.test(err.message);
}

// fetch() itself (not a Sheets error response) rejects with this when the
// request never completes — dropped wifi/mobile signal mid-request. First-time
// sheet creation is the most exposed to this: it's several sequential requests
// (metadata, batchUpdate, header writes) instead of the usual single small one.
// Worth exactly one retry — a real, persistent failure still surfaces after that.
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /failed to fetch/i.test(err.message);
}

async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    return await fn();
  }
}

// Upsert a row into `sheetName`, matched by `keyValue` in column A (only when
// that column's header is `headerMarker` — older spreadsheets without an ID/
// Дата column always append). Falls back to append when no match is found.
// Shared by entries/goals/moods, which differ only in row shape and key.
async function upsertRow(
  cfg: GoogleConfig,
  sheetName: string,
  row: string[],
  keyValue: string,
  headerMarker: string
): Promise<void> {
  const lastCol = String.fromCharCode(64 + row.length); // 7→'G', 11→'K'

  if (keyValue) {
    const colA = await sheetsReq<{ values?: string[][] }>(
      cfg,
      `/values/${encodeURIComponent(sheetName + '!A:A')}`
    );
    const rows = colA.values ?? [];
    if (rows[0]?.[0] === headerMarker) {
      const rowIdx = rows.findIndex((r, i) => i > 0 && r[0] === keyValue);
      if (rowIdx !== -1) {
        const sheetRow = rowIdx + 1;
        await sheetsReq(
          cfg,
          `/values/${encodeURIComponent(`${sheetName}!A${sheetRow}:${lastCol}${sheetRow}`)}?valueInputOption=USER_ENTERED`,
          'PUT',
          { values: [row] }
        );
        return;
      }
    }
  }

  await sheetsReq(
    cfg,
    `/values/${encodeURIComponent(sheetName + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    'POST',
    { values: [row] }
  );
}

// Sync a row to its sheet. If the «Эмоции»/«Дела» tab doesn't exist yet,
// create it (and headers) on the fly and retry — so no manual "init" step.
export async function exportEntryToSheet(cfg: GoogleConfig, entry: DiaryEntry): Promise<void> {
  return withNetworkRetry(async () => {
    try {
      await writeEntryRow(cfg, entry);
    } catch (err) {
      if (!isMissingSheetError(err)) throw err;
      await initSpreadsheet(cfg);
      await writeEntryRow(cfg, entry);
    }
  });
}

async function writeEntryRow(cfg: GoogleConfig, entry: DiaryEntry): Promise<void> {
  const sheetName = SHEET_NAMES[entry.sheetType];
  if (!sheetName) throw new Error('Неизвестный тип записи');

  const row: string[] =
    entry.sheetType === 'emotions'
      ? [entry.entryId || '', entry.time, entry.date, entry.situation, entry.thoughts, entry.emotions, entry.behavior]
      : [
          entry.entryId || '', entry.time, entry.date, entry.activity, entry.sphere,
          entry.importance, entry.urgency, entry.difficulty, entry.pleasure, entry.enjoyment,
          entry.status === 'planned' ? 'план' : 'выполнено',
        ];

  await upsertRow(cfg, sheetName, row, entry.entryId, 'ID');
}

function ddmmyyyy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// Sync a goal row to the Цели sheet. Same upsert-by-ID pattern as entries:
// if the row exists we update it, otherwise append. Creates the sheet on the
// fly if it's missing (older spreadsheets).
export async function exportGoalToSheet(cfg: GoogleConfig, goal: Goal): Promise<void> {
  return withNetworkRetry(async () => {
    try {
      await writeGoalRow(cfg, goal);
    } catch (err) {
      if (!isMissingSheetError(err)) throw err;
      await initSpreadsheet(cfg);
      await writeGoalRow(cfg, goal);
    }
  });
}

async function writeGoalRow(cfg: GoogleConfig, goal: Goal): Promise<void> {
  const sheetName = SHEET_NAMES.goals;
  const row: string[] = [
    goal.goalId,
    goal.parentGoalId || '',
    goal.title,
    HORIZON_LABEL[goal.horizon],
    goal.deadline,
    STATUS_LABEL[goal.status],
    ddmmyyyy(goal.createdAt),
    goal.deferredCount > 0 ? String(goal.deferredCount) : '',
    goal.note || '',
  ];
  await upsertRow(cfg, sheetName, row, goal.goalId, 'ID');
}

// Sync a mood row to the Настроение sheet. Unlike entries/goals there's no ID
// column — one row per calendar day, so the date itself (col A) is the upsert
// key: morning/day/evening/meds/comment all land on the same row as the day
// gets filled in through the day.
export async function exportMoodToSheet(cfg: GoogleConfig, mood: MoodEntry): Promise<void> {
  return withNetworkRetry(async () => {
    try {
      await writeMoodRow(cfg, mood);
    } catch (err) {
      if (!isMissingSheetError(err)) throw err;
      await initSpreadsheet(cfg);
      await writeMoodRow(cfg, mood);
    }
  });
}

async function writeMoodRow(cfg: GoogleConfig, mood: MoodEntry): Promise<void> {
  const sheetName = SHEET_NAMES.moods;
  const row: string[] = [
    mood.date, mood.morning, mood.day, mood.evening,
    mood.med1, mood.dose1, mood.med2, mood.dose2, mood.med3, mood.dose3,
    mood.comment,
  ];
  await upsertRow(cfg, sheetName, row, mood.date, 'Дата');
}
