#!/usr/bin/env node
// Generates src/changelog.ts from git commits via Claude API.
// Usage: node scripts/gen-changelog.js
// Requires: ANTHROPIC_API_KEY env var, git tags for released versions (v1.0.0, etc.)

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌  Задай переменную ANTHROPIC_API_KEY');
  process.exit(1);
}

const client = new Anthropic();

/* ── git helpers ── */
function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf-8' }).trim();
}

function getVersion() {
  return JSON.parse(readFileSync('./package.json', 'utf-8')).version;
}

function getTags() {
  try {
    const out = git('tag --sort=-version:refname');
    return out ? out.split('\n').filter(t => /^v\d/.test(t.trim())) : [];
  } catch { return []; }
}

function getCommits(sinceTag) {
  const range = sinceTag ? `${sinceTag}..HEAD` : 'HEAD';
  try {
    const out = git(`log ${range} --format=%s`);
    return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
  } catch { return []; }
}

/* ── filter: skip non-user-facing commits ── */
const SKIP = [
  /\b(CI|CD|GitHub\s*Actions|workflow|\.npmrc|Node\.?js|npm\b|eslint|prettier|vite\.config|base\s*path|GitHub\s*Pages|deploy|license)\b/i,
  /^(Force|Update|Add)\s+(Node|CI|Actions|npm|base\s*path)/i,
  /^Initial\s+commit/i,
  /^Merge\s+branch/i,
  /^Revert\s+/i,
  /^chore|^build|^ci\b|^style\b|^test\b/i,
];

function isUserFacing(msg) {
  return !SKIP.some(p => p.test(msg));
}

/* ── Claude rewrite ── */
async function rewrite(commits, version) {
  const list = commits.map(c => `- ${c}`).join('\n');

  const { content } = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Перепиши git-коммиты как краткие пункты ченджлога на русском языке для версии ${version}.

Правила:
- Пишешь для пользователей приложения (не для разработчиков)
- Короткие фразы, 4–8 слов, прошедшее время
- Никаких технических терминов (state, migration, legacy, refactor, dependency, hook, plugin, build, stale, comparison и т.п.)
- Только изменения, которые заметит пользователь
- Одна строка на коммит, без нумерации и маркеров
- Никаких пояснений, только строки

Коммиты:
${list}`,
    }],
  });

  if (content[0].type !== 'text') return [];
  return content[0].text
    .split('\n')
    .map(l => l.replace(/^[-•*\d.]+\s*/, '').trim())
    .filter(Boolean);
}

/* ── changelog.ts parser / serialiser ── */
function parseChangelog() {
  try {
    const src = readFileSync('./src/changelog.ts', 'utf-8');
    const entries = [];
    for (const m of src.matchAll(
      /\{\s*version:\s*'([^']+)',\s*date:\s*'([^']+)',\s*changes:\s*\[([\s\S]*?)\]\s*\}/g,
    )) {
      const changes = [...m[3].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(c =>
        c[1].replace(/\\'/g, "'"),
      );
      entries.push({ version: m[1], date: m[2], changes });
    }
    return entries;
  } catch { return []; }
}

function serializeChangelog(entries) {
  const body = entries
    .map(e => {
      const changes = e.changes
        .map(c => `      '${c.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
        .join(',\n');
      return `  {\n    version: '${e.version}',\n    date: '${e.date}',\n    changes: [\n${changes},\n    ],\n  }`;
    })
    .join(',\n');
  return (
    `export interface ChangelogEntry {\n` +
    `  version: string;\n` +
    `  date: string;\n` +
    `  changes: string[];\n` +
    `}\n\n` +
    `export const CHANGELOG: ChangelogEntry[] = [\n${body},\n];\n`
  );
}

/* ── main ── */
async function main() {
  const version = getVersion();
  const tags = getTags();
  const latestTag = tags[0];

  const allCommits = getCommits(latestTag);
  const userCommits = allCommits.filter(isUserFacing);

  console.log(`Версия:          ${version}`);
  console.log(`Последний тег:   ${latestTag ?? '(нет)'}`);
  console.log(`Коммитов всего:  ${allCommits.length}`);
  console.log(`Пользовательских: ${userCommits.length}`);

  if (userCommits.length === 0) {
    console.log('\nНет пользовательских изменений — changelog не изменён.');
    return;
  }

  console.log('\nОтправляю в Claude...');
  const changes = await rewrite(userCommits, version);

  if (changes.length === 0) {
    console.log('Claude не вернул изменений.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const existing = parseChangelog().filter(e => e.version !== version);
  const updated = [{ version, date: today, changes }, ...existing];

  writeFileSync('./src/changelog.ts', serializeChangelog(updated));

  console.log(`\n✅  src/changelog.ts обновлён — v${version}, ${changes.length} записей:`);
  changes.forEach(c => console.log(`  • ${c}`));
  console.log(`\nПосле коммита пометь релиз тегом: git tag v${version}`);
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
