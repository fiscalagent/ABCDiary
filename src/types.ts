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

export type TaskStatus = 'planned' | 'done';

export interface TaskData {
  sheetType: 'tasks';
  entryId: string;
  status: TaskStatus;
  time: string;
  date: string;
  activity: string;
  sphere: string;
  importance: string;
  urgency: string;
  difficulty: string;
  pleasure: string;
  enjoyment: string;
}

export type EntryData = EmotionData | TaskData;

type EntryMeta = { id: number; createdAt: Date; updatedAt: Date };

export type DiaryEntry = (EmotionData & EntryMeta) | (TaskData & EntryMeta);

/* ── Goals (soft planning module) ────────────────────────────── */

// Horizon = the time window the goal lives in. Month-level goals are "эпики"
// you decompose into week-level subtasks; week-level ones get refined into day.
export type GoalHorizon = 'month' | 'week' | 'day';
export type GoalStatus = 'active' | 'done' | 'cancelled';

export interface GoalData {
  goalId: string;
  // parentGoalId set → this is a subtask of another goal (max 2 levels enforced in UI).
  parentGoalId?: string;
  title: string;
  horizon: GoalHorizon;
  deadline: string; // DD.MM.YYYY
  status: GoalStatus;
  note?: string;
  // Number of times the user pushed the deadline forward — "soft" tracking.
  deferredCount: number;
  // entryIds of Дела that were spawned as concrete steps toward this goal.
  linkedEntryIds?: string[];
}

export type Goal = GoalData & { id: number; createdAt: Date; updatedAt: Date };

/* ── Mood & medication tracking (one record per calendar day) ──── */

export interface MoodData {
  date: string; // DD.MM.YYYY — unique key, one record per day
  morning: string; // 0–10
  day: string; // 0–10
  evening: string; // 0–10
  med1: string;
  dose1: string;
  med2: string;
  dose2: string;
  med3: string;
  dose3: string;
  comment: string;
}

export type MoodEntry = MoodData & { id: number; createdAt: Date; updatedAt: Date };