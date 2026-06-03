import type { DiaryEntry } from '../types';
import { formatDate } from './dateFormat';

function entryToText(entry: DiaryEntry): string {
  const header =
    entry.sheetType === 'emotions'
      ? '=== ABCDiary — Эмоции ==='
      : '=== ABCDiary — Дела ===';

  const lines = [header, `Записано: ${formatDate(entry.createdAt)}`, ''];

  if (entry.sheetType === 'emotions') {
    if (entry.time) lines.push(`Время: ${entry.time}`);
    if (entry.date) lines.push(`Дата: ${entry.date}`, '');
    lines.push('Триггерная ситуация:', entry.situation || '—', '');
    lines.push('Мысли:', entry.thoughts || '—', '');
    lines.push('Эмоции:', entry.emotions || '—', '');
    lines.push('Поведение:', entry.behavior || '—');
  } else {
    if (entry.time) lines.push(`Время: ${entry.time}`);
    if (entry.date) lines.push(`Дата: ${entry.date}`, '');
    lines.push('Занятие:', entry.activity || '—', '');
    lines.push('Сфера:', entry.sphere || '—', '');
    lines.push(`Важность: ${entry.importance || '—'}`);
    lines.push(`Срочность: ${entry.urgency || '—'}`);
    lines.push(`Сложность: ${entry.difficulty || '—'}`);
  }

  return lines.join('\n');
}

export function entriesToText(entries: DiaryEntry[]): string {
  return entries.map(entryToText).join('\n\n' + '='.repeat(40) + '\n\n');
}

export async function shareEntry(entry: DiaryEntry) {
  const text = entryToText(entry);
  const filename = `abcdiary-${entry.createdAt.toISOString().slice(0, 10)}.txt`;
  const file = new File([text], filename, { type: 'text/plain' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'ABCDiary' });
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function printEntry(entry: DiaryEntry) {
  const text = entryToText(entry).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>ABCDiary</title>
<style>body{font-family:sans-serif;max-width:600px;margin:40px auto;line-height:1.7;color:#222}
pre{white-space:pre-wrap;font-family:inherit;font-size:15px}</style>
</head><body><pre>${text}</pre></body></html>`);
  w.document.close();
  w.print();
}
