#!/usr/bin/env node
// Интерактивная настройка ключей. Запускается в отдельном окне через open-setup.sh.
//   node setup.js            — всё сразу: YouGile и Telegram
//   node setup.js telegram   — только Telegram
import { createInterface } from 'node:readline';
import { saveEnv, yougile } from './lib.js';

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => s.includes(question) && rl.output.write(s);
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function choose(title, items, label) {
  if (items.length === 1) return items[0];
  console.log(`\n${title}`);
  items.forEach((item, i) => console.log(`  ${i + 1}. ${label(item)}`));
  for (;;) {
    const n = Number(await ask(`Номер [1-${items.length}]: `));
    if (n >= 1 && n <= items.length) return items[n - 1];
  }
}

async function setupYougile() {
  console.log('Настройка YouGile. Пароль нужен один раз, сохранится только API-ключ\n');
  const login = await ask('Логин (email): ');
  const password = await ask('Пароль: ', true);

  const { content: companies = [] } = await yougile('POST', '/auth/companies', { login, password });
  if (!companies.length) throw new Error('У аккаунта нет компаний');
  const company = await choose('Компания:', companies, (c) => c.name);

  const { key } = await yougile('POST', '/auth/keys', { login, password, companyId: company.id });

  const get = async (path) => (await yougile('GET', `${path}${path.includes('?') ? '&' : '?'}limit=1000`, null, key)).content ?? [];
  const project = await choose('Проект по умолчанию:', await get('/projects'), (p) => p.title);
  const board = await choose('Доска:', await get(`/boards?projectId=${project.id}`), (b) => b.title);
  const column = await choose('Колонка для новых задач:', await get(`/columns?boardId=${board.id}`), (c) => c.title);

  saveEnv({
    YOUGILE_API_KEY: key,
    YOUGILE_COLUMN_ID: column.id,
    YOUGILE_COLUMN_NAME: `${project.title} · ${column.title}`,
  });
  console.log(`\nГотово: задачи будут падать в «${project.title} · ${column.title}»`);
}

async function telegram(method, token, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

async function setupTelegram() {
  console.log('\nНастройка Telegram-бота. Нет бота? Нажми Enter, настроишь позже\n');
  const token = await ask('Токен бота от @BotFather: ', true);
  if (!token) {
    console.log('Telegram пропущен');
    return;
  }
  const bot = await telegram('getMe', token);
  console.log(`Бот: @${bot.username}`);
  const chatId = await ask('Твой Telegram ID (узнать у @userinfobot): ');
  await ask(`Открой @${bot.username} в Telegram, нажми «Start» и вернись сюда. Enter, когда готово`);
  await telegram('sendMessage', token, { chat_id: chatId, text: 'Бот подключён к скиллу task' });

  saveEnv({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
  console.log('Готово: бот прислал тебе проверочное сообщение');
}

const sections = {
  all: async () => {
    await setupYougile();
    await setupTelegram();
  },
  telegram: setupTelegram,
};
const section = sections[process.argv[2] ?? 'all'];
if (!section) {
  console.error(`Разделы: ${Object.keys(sections).join(', ')}`);
  process.exit(2);
}

try {
  await section();
} catch (err) {
  console.error(`\nОшибка: ${err.message}`);
  await ask('Enter, чтобы закрыть окно');
  process.exit(1);
}
