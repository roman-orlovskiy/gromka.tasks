#!/usr/bin/env node
// Читает сообщения из чатов YouGile в виде, удобном для саммари. Только чтение.
//   node chats.js                                  — что есть: проекты, доски, групповые чаты
//   node chats.js --board "Разработка"             — чаты всех задач доски
//   node chats.js --project "Kngnn"                — чаты задач всех досок проекта
//   node chats.js --task "Elastic"                 — чаты задач с таким названием
//   node chats.js --chat "Общий"                   — групповой чат
//   node chats.js --id "…#chat:0702805a3a67"       — чат по ссылке или ID (в ссылке хвост ID из 12 символов)
// Фильтры: --since YYYY-MM-DD, --account "почта". Названия ищутся по части, без учёта регистра
import { parseArgs } from 'node:util';
import { findAccount, findChats, list } from './lib.js';

const { values: args } = parseArgs({
  options: {
    board: { type: 'string' },
    project: { type: 'string' },
    task: { type: 'string' },
    chat: { type: 'string' },
    id: { type: 'string' },
    since: { type: 'string' },
    account: { type: 'string' },
  },
});

const account = findAccount(args.account);
if (!account) {
  console.error('NO_SETUP: ключи YouGile не настроены, запусти scripts/open-setup.sh');
  process.exit(3);
}
const get = (path) => list(path, account.apiKey);
const progress = (text) => process.stderr.write(`${text}\n`);

const pad = (n) => String(n).padStart(2, '0');
function formatTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function overview() {
  console.log(`Аккаунт: ${account.name}\n`);
  for (const project of await get('/projects')) {
    const boards = await get(`/boards?projectId=${project.id}`);
    console.log(`Проект «${project.title}»: доски ${boards.map((b) => `«${b.title}»`).join(', ') || 'нет'}`);
  }
  const chats = await get('/group-chats');
  console.log(`Групповые чаты: ${chats.map((c) => `«${c.title}»`).join(', ') || 'нет'}`);
}

if (!args.board && !args.project && !args.task && !args.chat && !args.id) {
  await overview();
  process.exit(0);
}

const users = Object.fromEntries((await get('/users')).map((u) => [u.id, u.realName || u.email]));
const since = args.since ? `?since=${new Date(`${args.since}T00:00:00`).getTime()}` : '';

const chats = await findChats(args, account.apiKey);
if (!chats.length) {
  console.error('Ничего не найдено. Посмотреть, что есть: node chats.js');
  process.exit(1);
}
progress(`Читаю ${chats.length} чатов (${account.name}), YouGile отдаёт не больше 50 запросов в минуту`);

let total = 0;
for (const chat of chats) {
  const messages = (await get(`/chats/${chat.id}/messages${since}`)).sort((a, b) => a.id - b.id);
  if (!messages.length) continue;
  total += messages.length;
  console.log(`\n## ${chat.title}`);
  for (const m of messages) {
    console.log(`${formatTime(m.id)} ${users[m.fromUserId] ?? m.fromUserId}: ${m.text.trim()}`);
  }
}
progress(`Готово: ${total} сообщений в ${chats.length} чатах`);
