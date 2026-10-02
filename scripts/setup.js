#!/usr/bin/env node
// Интерактивная настройка ключей. Запускается в отдельном окне через open-setup.sh.
//   node setup.js            — всё сразу: YouGile и Telegram
//   node setup.js yougile    — только аккаунт YouGile (новый или повторная авторизация)
//   node setup.js telegram   — только Telegram
import { createInterface } from 'node:readline';
import { loadAccounts, saveAccounts, saveEnv, yougile } from './lib.js';
import { telegram } from './notify.js';

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
  const login = (await ask('Логин (email): ')).toLowerCase();
  const password = await ask('Пароль: ', true);

  const { content: companies = [] } = await yougile('POST', '/auth/companies', { login, password });
  if (!companies.length) throw new Error('У аккаунта нет компаний');
  const company = await choose('Компания:', companies, (c) => c.name);

  const { key } = await yougile('POST', '/auth/keys', { login, password, companyId: company.id });

  const get = async (path) => (await yougile('GET', `${path}${path.includes('?') ? '&' : '?'}limit=1000`, null, key)).content ?? [];
  const project = await choose('Проект по умолчанию:', await get('/projects'), (p) => p.title);
  const board = await choose('Доска:', await get(`/boards?projectId=${project.id}`), (b) => b.title);
  const column = await choose('Колонка для новых задач:', await get(`/columns?boardId=${board.id}`), (c) => c.title);

  // Новый или заново авторизованный аккаунт сразу становится активным
  const data = loadAccounts();
  data.accounts[login] = {
    apiKey: key,
    company: company.name,
    columnId: column.id,
    columnName: `${project.title} · ${column.title}`,
  };
  data.active = login;
  saveAccounts(data);
  console.log(`\nГотово: аккаунт ${login} активен, задачи будут падать в «${project.title} · ${column.title}»`);
}

async function setupTelegram() {
  console.log('\nНастройка Telegram-бота. Нет бота? Нажми Enter, настроишь позже\n');
  const token = await ask('Токен бота от @BotFather: ', true);
  if (!token) {
    console.log('Telegram пропущен');
    return;
  }
  const bot = await telegram('getMe', {}, token);
  console.log(`Бот: @${bot.username}`);
  const chatId = await ask('Твой Telegram ID (узнать у @userinfobot): ');
  await ask(`Открой @${bot.username} в Telegram, нажми «Start» и вернись сюда. Enter, когда готово`);
  await telegram('sendMessage', { chat_id: chatId, text: 'Бот подключён к скиллу task' }, token);

  saveEnv({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId });
  console.log('Готово: бот прислал тебе проверочное сообщение');
}

const sections = {
  all: async () => {
    await setupYougile();
    await setupTelegram();
  },
  yougile: setupYougile,
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
