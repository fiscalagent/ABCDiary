import Dexie, { type Table } from 'dexie';

export interface RawEntry {
  id?: number;
  createdAt: number;
  updatedAt: number;
  iv: string;
  ciphertext: string;
  // True when this row was saved but never confirmed synced to Google Sheets
  // (e.g. saved while offline). Not encrypted — read without decrypting so a
  // reconnect can find and retry everything pending in one pass.
  pendingSync?: boolean;
}

export interface Settings {
  id?: number;
  salt: string;
  verifierIv: string;
  verifierCt: string;
}

// Goals are stored the same way as entries: an encrypted blob keyed by
// auto-increment id. Decryption happens on read in App.loadGoals.
export interface RawGoal {
  id?: number;
  createdAt: number;
  updatedAt: number;
  iv: string;
  ciphertext: string;
  pendingSync?: boolean;
}

// Mood/medication records are stored the same encrypted-blob way as goals,
// one row per calendar day (decrypted on read in App.loadMoods).
export interface RawMood {
  id?: number;
  createdAt: number;
  updatedAt: number;
  iv: string;
  ciphertext: string;
  pendingSync?: boolean;
}

class ABCDiaryDB extends Dexie {
  entries!: Table<RawEntry>;
  settings!: Table<Settings>;
  goals!: Table<RawGoal>;
  moods!: Table<RawMood>;

  constructor() {
    super('ABCDiary');
    this.version(1).stores({
      entries: '++id, createdAt',
      settings: '++id',
    });
    // v2: goals table for the soft-planning module.
    this.version(2).stores({
      entries: '++id, createdAt',
      settings: '++id',
      goals: '++id, createdAt',
    });
    // v3: moods table for daily mood/medication tracking.
    this.version(3).stores({
      entries: '++id, createdAt',
      settings: '++id',
      goals: '++id, createdAt',
      moods: '++id, createdAt',
    });
  }
}

export const db = new ABCDiaryDB();
