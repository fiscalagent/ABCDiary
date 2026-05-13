export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-05-14',
    changes: [
      'Исправлено сравнение PIN при входе (устаревшее состояние)',
      'Удалена устаревшая миграция базы данных',
    ],
  },
  {
    version: '1.0.0',
    date: '2025-01-01',
    changes: [
      'Голосовой ввод через Speech Recognition',
      'Шифрование AES-256 — все записи хранятся локально',
      'Синхронизация с Google Таблицами (Эмоции / Дела)',
      'PIN-защита дневника',
      'PWA — работает офлайн, устанавливается на экран',
    ],
  },
];
