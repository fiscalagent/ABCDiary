#!/usr/bin/env node
// Полный цикл релиза: bump → changelog → commit → tag → push
// Usage: node scripts/release.js [patch|minor|major]

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌  Задай переменную ANTHROPIC_API_KEY');
  process.exit(1);
}

const bump = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('❌  Укажи тип: patch | minor | major');
  process.exit(1);
}

const client = new Anthropic();

function git(cmd, opts = {}) {
  return execSync(`git ${cmd}`, { encoding: 'utf-8', ...opts }).trim();
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
}

/* ── version bump ── */
function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/* ── git helpers ── */
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

const SKIP = [
  /\b(CI|CD|GitHub\s*Actions|workflow|\.npmrc|Node\.?js|npm\b|eslint|prettier|vite\.config|base\s*path|GitHub\s*Pages|deploy|license)\b/i,
  /^(Force|Update|Add)\s+(Node|CI|Actions|npm|base\s*path)/i,
  /^Initial\s+commit/i,
  /^Merge\s+branch/i,
  /^Revert\s+/i,
  /^Release\s+v/i,
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
- Никаких технических терминов (state, migration, legacy, refactor, dependency, hook, plugin, build, stale и т.п.)
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

/* ── changelog helpers ── */
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
  // 1. Проверим чистоту рабочего дерева
  const dirty = git('status --porcelain');
  if (dirty) {
    console.error('❌  Есть незакоммиченные изменения. Сделай commit или stash сначала.');
    process.exit(1);
  }

  // 2. Bump version
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, bump);
  pkg.version = newVersion;
  writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log(`📦  ${oldVersion} → ${newVersion}`);

  // 3. Получить коммиты с последнего тега
  const tags = getTags();
  const latestTag = tags[0];
  const allCommits = getCommits(latestTag);
  const userCommits = allCommits.filter(isUserFacing);

  console.log(`📝  Коммитов: ${allCommits.length} всего, ${userCommits.length} пользовательских`);

  // 4. Генерация changelog
  let changes = [];
  if (userCommits.length > 0) {
    console.log('🤖  Генерирую changelog через Claude...');
    changes = await rewrite(userCommits, newVersion);
    console.log(`✅  ${changes.length} записей:`);
    changes.forEach(c => console.log(`   • ${c}`));
  } else {
    console.log('⚠️   Нет пользовательских изменений — changelog будет пустым для этой версии');
  }

  // 5. Обновить changelog.ts
  const today = new Date().toISOString().split('T')[0];
  const existing = parseChangelog().filter(e => e.version !== newVersion);
  const updated = [{ version: newVersion, date: today, changes }, ...existing];
  writeFileSync('./src/changelog.ts', serializeChangelog(updated));

  // 6. Обновить version в vite — уже через package.json, ничего дополнительного

  // 7. Коммит
  run('git add package.json src/changelog.ts');
  git(`commit -m "Release v${newVersion}"`);
  console.log(`\n📌  Коммит: Release v${newVersion}`);

  // 8. Тег
  git(`tag v${newVersion}`);
  console.log(`🏷️   Тег: v${newVersion}`);

  // 9. Push
  console.log('🚀  Пушу...');
  git('push origin main');
  git('push --tags');

  console.log(`\n✅  Релиз v${newVersion} задеплоен! GitHub Actions запустит сборку.`);
}

main().catch(err => {
  console.error('\n❌  Ошибка:', err.message);
  process.exit(1);
});
