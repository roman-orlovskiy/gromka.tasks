#!/usr/bin/env node
// Telegram-бот: принимает задачи сообщениями и передаёт их в Claude Code (claude -p /task …).
// Отвечает только владельцу из TELEGRAM_CHAT_ID.
//   node bot.js
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { loadEnv } from './lib.js';
import { telegram } from './notify.js';

const env = loadEnv();
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
  console.error('NO_SETUP: бот не настроен, запусти scripts/open-setup.sh telegram');
  process.exit(3);
}

const OWNER = String(env.TELEGRAM_CHAT_ID);
const CLAUDE_TIMEOUT = 180_000;

function runClaude(text) {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', `/task ${text}`, '--allowedTools', 'Bash(node:*)'], {
      cwd: homedir(),
      env: { ...process.env, TASK_NO_NOTIFY: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill(), CLAUDE_TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(out.trim() || (code === 0 ? 'Готово' : 'Не получилось создать задачу'));
    });
  });
}

async function handle(message) {
  const chatId = message.chat.id;
  if (String(message.from?.id) !== OWNER) {
    await telegram('sendMessage', { chat_id: chatId, text: 'Это личный бот, задачи принимаются только от владельца' });
    return;
  }
  if (!message.text || message.text === '/start') {
    await telegram('sendMessage', { chat_id: chatId, text: 'Пришли текст задачи, я заведу её в YouGile' });
    return;
  }
  await telegram('sendChatAction', { chat_id: chatId, action: 'typing' });
  const answer = await runClaude(message.text);
  await telegram('sendMessage', { chat_id: chatId, text: answer.slice(0, 4000) });
}

const me = await telegram('getMe');
console.log(`Бот @${me.username} запущен, жду сообщения`);

let offset = 0;
for (;;) {
  try {
    const updates = await telegram('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
    for (const update of updates) {
      offset = update.update_id + 1;
      if (update.message) await handle(update.message).catch((err) => console.error(err.message));
    }
  } catch (err) {
    console.error(`getUpdates: ${err.message}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
