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

class ABCDiaryDB extends Dexie {
  entries!: Table<RawEntry>;
  settings!: Table<Settings>;

  constructor() {
    super('ABCDiary');
    this.version(1).stores({
      entries: '++id, createdAt',
      settings: '++id',
    });
  }
}

export const db = new ABCDiaryDB();
