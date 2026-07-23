import { describe, it, expect } from 'vitest';
import { buildMoodRow, HEADERS } from './gsheets';
import { dateToDdmmyyyy } from './parsing';
import type { MoodEntry } from '../types';

// Dated tomorrow, not today, so a run right after midnight can't collide
// with a real entry already sitting in the sheet.
const tomorrow = dateToDdmmyyyy(new Date(Date.now() + 24 * 60 * 60 * 1000));

const mood: MoodEntry = {
  id: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  date: tomorrow,
  morning: '1', commentMorning: 'тест-утро',
  day: '2', commentDay: 'тест-день',
  evening: '3', commentEvening: 'тест-вечер',
  med1: 'Лекарство А', dose1: '10 мг',
  med2: '', dose2: '', med3: '', dose3: '',
};

describe('buildMoodRow', () => {
  it('places each comment right after its own score, in the sheet column order', () => {
    expect(buildMoodRow(mood)).toEqual([
      tomorrow,
      '1', 'тест-утро',
      '2', 'тест-день',
      '3', 'тест-вечер',
      'Лекарство А', '10 мг', '', '', '', '',
    ]);
  });

  it('matches the «Настроение» header row length and slot order', () => {
    expect(HEADERS['Настроение']).toEqual([
      'Дата', 'Утро', 'Комментарий (утро)', 'День', 'Комментарий (день)', 'Вечер', 'Комментарий (вечер)',
      'Лекарство 1', 'Доза 1', 'Лекарство 2', 'Доза 2', 'Лекарство 3', 'Доза 3',
    ]);
    expect(buildMoodRow(mood)).toHaveLength(HEADERS['Настроение'].length);
  });
});
