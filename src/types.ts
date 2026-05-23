export type SheetType = 'emotions' | 'tasks';

export interface EmotionData {
  sheetType: 'emotions';
  entryId: string;
  time: string;
  date: string;
  situation: string;
  thoughts: string;
  emotions: string;
  behavior: string;
}

export interface TaskData {
  sheetType: 'tasks';
  entryId: string;
  time: string;
  date: string;
  activity: string;
  sphere: string;
  importance: string;
  difficulty: string;
  pleasure: string;
  enjoyment: string;
}

export type EntryData = EmotionData | TaskData;

type EntryMeta = { id: number; createdAt: Date; updatedAt: Date };

export type DiaryEntry = (EmotionData & EntryMeta) | (TaskData & EntryMeta);