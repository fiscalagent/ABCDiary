import type { DiaryEntry } from '../types';

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

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: ((response: TokenResponse) => void) | '';
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
} catch {}

function storeToken(token: string, expiry: number): void {
  accessToken = token;
  tokenExpiry = expiry;
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiry }));
  } catch {}
}

export function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

export function loadGoogleConfig(): GoogleConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw) as GoogleConfig;
  } catch {}
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

export function initGoogleAuth(): boolean {
  if (!window.google) return false;
  const login_hint = getAccountHint();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: '',
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
  return new Promise((resolve, reject) => {
    tokenClient!.callback = (resp: TokenResponse) => {
      if (resp.error) {
        // Silent attempt couldn't proceed without UI — let caller fall back
        if (silent) {
          resolve(null);
          return;
        }
        reject(new Error(resp.error_description || resp.error));
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
      resolve(accessToken);
    };
    tokenClient!.requestAccessToken({ prompt: silent ? 'none' : '' });
  });
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
};

const HEADERS: Record<string, string[]> = {
  Эмоции: ['ID', 'Время', 'Дата', 'Триггерная ситуация', 'Мысли', 'Эмоции', 'Поведение'],
  Дела: ['ID', 'Время', 'Дата', 'Занятие', 'Сфера', 'Важность (1-10)', 'Сложность (1-10)', 'Удовлетворение (1-10)', 'Удовольствие (1-10)'],
};

export async function initSpreadsheet(cfg: GoogleConfig): Promise<void> {
  const meta = await sheetsReq<{ sheets: { properties: { title: string } }[] }>(cfg, '');
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

export async function exportEntryToSheet(cfg: GoogleConfig, entry: DiaryEntry): Promise<void> {
  const sheetName = SHEET_NAMES[entry.sheetType];
  if (!sheetName) throw new Error('Неизвестный тип записи');

  let row: string[];
  if (entry.sheetType === 'emotions') {
    row = [entry.entryId || '', entry.time, entry.date, entry.situation, entry.thoughts, entry.emotions, entry.behavior];
  } else {
    row = [entry.entryId || '', entry.time, entry.date, entry.activity, entry.sphere, entry.importance, entry.difficulty, entry.pleasure, entry.enjoyment];
  }

  const lastCol = String.fromCharCode(64 + row.length); // 7→'G', 8→'H', 9→'I'

  // Try to find existing row by entryId (only if entryId is set and sheet has ID column)
  if (entry.entryId) {
    const colA = await sheetsReq<{ values?: string[][] }>(
      cfg,
      `/values/${encodeURIComponent(sheetName + '!A:A')}`
    );
    const rows = colA.values ?? [];
    if (rows[0]?.[0] === 'ID') {
      const rowIdx = rows.findIndex((r, i) => i > 0 && r[0] === entry.entryId);
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

  // Append new row
  await sheetsReq(
    cfg,
    `/values/${encodeURIComponent(sheetName + '!A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    'POST',
    { values: [row] }
  );
}
