#!/usr/bin/env node
// Пишет сообщение в чат YouGile: групповой или чат задачи.
// Упоминания API ставит только текстом, уведомление по ним не приходит.
//   node send-message.js --chat "B2B" --mention "Ильдар" --text "…" --dry-run   — показать, куда и что уйдёт
//   node send-message.js --chat "B2B" --mention "Ильдар" --text "…"             — отправить
// Чат выбирается как в chats.js: --chat, --task, --id; найтись должен ровно один.
// --text можно заменить на --file с текстом; --mention повторяется, ищет сотрудника по имени или почте
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { findAccount, findChats, list, yougile } from './lib.js';

const { values: args } = parseArgs({
  options: {
    chat: { type: 'string' },
    task: { type: 'string' },
    id: { type: 'string' },
    text: { type: 'string' },
    file: { type: 'string' },
    mention: { type: 'string', multiple: true, default: [] },
    'dry-run': { type: 'boolean', default: false },
    account: { type: 'string' },
  },
});

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const linkify = (s) => s.replace(/https?:\/\/[^\s<]+/g, (url) => `<a class="_link" href="${url}" rel="nofollow" target="_blank">${url}</a>`);

// Абзацы как в редакторе YouGile: строка — <p>, пустая строка — <p>&nbsp;</p>
const toHtml = (text) => text.split('\n').map((line) => `<p>${line.trim() ? linkify(escape(line)) : '&nbsp;'}</p>`).join('');

function pickUser(users, needle) {
  const n = needle.toLowerCase();
  const found = users.filter((u) => `${u.realName ?? ''} ${u.email ?? ''}`.toLowerCase().includes(n));
  if (!found.length) throw new Error(`Сотрудник «${needle}» не найден`);
  if (found.length > 1) {
    throw new Error(`«${needle}» подходит к нескольким: ${found.map((u) => u.realName || u.email).join(', ')}`);
  }
  return found[0];
}

try {
  if (!args.chat && !args.task && !args.id) throw new Error('Нужен чат: --chat, --task или --id');
  const body = (args.file ? readFileSync(args.file, 'utf8') : args.text ?? '').trim();
  if (!body) throw new Error('Нужен текст: --text или --file');

  const account = findAccount(args.account);
  if (!account) {
    console.error('NO_SETUP: ключи YouGile не настроены, запусти scripts/open-setup.sh');
    process.exit(3);
  }
  const key = account.apiKey;

  const chats = await findChats(args, key);
  if (!chats.length) throw new Error('Чат не найден. Посмотреть, что есть: node chats.js');
  if (chats.length > 1) {
    throw new Error(`Подходит несколько чатов, уточни: ${chats.slice(0, 10).map((c) => c.title).join('; ')}`);
  }
  const [chat] = chats;

  // Упоминания идут первой строкой, как их ставит сам YouGile
  const users = args.mention.length ? await list('/users', key) : [];
  const mentions = args.mention.map((m) => pickUser(users, m)).map((u) => ({ user: u, tag: `@${u.realName || u.email}` }));
  const text = [mentions.map((m) => m.tag).join(' '), body].filter(Boolean).join('\n');

  console.log(`Аккаунт: ${account.name}\nКуда: ${chat.title}\n\n${text}`);
  if (args['dry-run']) process.exit(0);

  // Из Telegram-бота текст некому согласовать: только показываем
  if (process.env.TASK_FROM_BOT) {
    console.log('\nИз Telegram сообщения в чаты не отправляются, отправь из Claude Code');
    process.exit(0);
  }

  // Публичный API принимает только текст: упоминание остаётся строкой «@Имя» без уведомления
  await yougile('POST', `/chats/${chat.id}/messages`, { text, textHtml: toHtml(text), label: '' }, key);
  console.log('\nОтправлено');
  if (mentions.length) {
    console.log(`Упоминание стоит текстом: чтобы пришло уведомление, в YouGile поставь заново ${mentions.map((m) => m.tag).join(', ')} в первой строке`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
