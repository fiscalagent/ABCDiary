import Dexie, { type Table } from 'dexie';

export interface RawEntry {
  id?: number;
  createdAt: number;
  updatedAt: number;
  iv: string;
  ciphertext: string;
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
}

// Mood/medication records are stored the same encrypted-blob way as goals,
// one row per calendar day (decrypted on read in App.loadMoods).
export interface RawMood {
  id?: number;
  createdAt: number;
  updatedAt: number;
  iv: string;
  ciphertext: string;
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
