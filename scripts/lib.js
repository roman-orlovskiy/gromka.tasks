// Общие функции скилла: чтение и запись .env и аккаунтов, запросы к YouGile API
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_PATH = join(ROOT, '.env');
export const ACCOUNTS_PATH = join(ROOT, 'accounts.json');

export function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  return Object.fromEntries(
    readFileSync(ENV_PATH, 'utf8')
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value]),
  );
}

function writeEnv(env) {
  const text = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

export function saveEnv(values) {
  writeEnv({ ...loadEnv(), ...values });
}

// Аккаунты YouGile: { active: "почта", accounts: { "почта": { apiKey, company, columnId, columnName } } }
// Telegram общий для всех аккаунтов и остаётся в .env
export function loadAccounts() {
  if (existsSync(ACCOUNTS_PATH)) return JSON.parse(readFileSync(ACCOUNTS_PATH, 'utf8'));

  // Старая версия скилла хранила единственный аккаунт в .env: переносим его
  const env = loadEnv();
  const data = { active: null, accounts: {} };
  if (env.YOUGILE_API_KEY) {
    const name = env.YOUGILE_LOGIN || 'основной';
    data.accounts[name] = {
      apiKey: env.YOUGILE_API_KEY,
      columnId: env.YOUGILE_COLUMN_ID,
      columnName: env.YOUGILE_COLUMN_NAME,
    };
    data.active = name;
    saveAccounts(data);
    writeEnv(Object.fromEntries(Object.entries(env).filter(([k]) => !k.startsWith('YOUGILE_'))));
  }
  return data;
}

export function saveAccounts(data) {
  writeFileSync(ACCOUNTS_PATH, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

// Аккаунт по почте или её части («gromka», «kngnn»), без запроса — активный
export function findAccount(query, data = loadAccounts()) {
  const names = Object.keys(data.accounts);
  if (!query) {
    const name = data.active ?? names[0];
    return name ? { name, ...data.accounts[name] } : null;
  }
  const q = query.toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === q);
  const matches = exact
    ? [exact]
    : names.filter((n) => `${n} ${data.accounts[n].company ?? ''}`.toLowerCase().includes(q));
  if (!matches.length) {
    throw new Error(`Аккаунт «${query}» не найден. Есть: ${names.join(', ') || 'ни одного'}`);
  }
  if (matches.length > 1) {
    throw new Error(`«${query}» подходит к нескольким аккаунтам: ${matches.join(', ')}`);
  }
  return { name: matches[0], ...data.accounts[matches[0]] };
}

const API = 'https://yougile.com/api-v2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// YouGile пускает не больше 50 запросов в минуту на компанию: держим запас
const RATE_LIMIT = 45;
const recent = [];
async function throttle() {
  for (;;) {
    while (recent.length && Date.now() - recent[0] > 60_000) recent.shift();
    if (recent.length < RATE_LIMIT) break;
    await sleep(60_000 - (Date.now() - recent[0]) + 100);
  }
  recent.push(Date.now());
}

// Сетевые сбои и 429 повторяем до 3 раз. POST /tasks безопасно повторять благодаря idempotencyKey
async function fetchWithRetry(url, options, attempts = 3) {
  for (let i = 1; ; i++) {
    await throttle();
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (res.status !== 429 || i >= attempts) return res;
      await sleep(15_000 * i);
    } catch (err) {
      if (i >= attempts) throw err;
      await sleep(1000 * i);
    }
  }
}

export async function yougile(method, path, body, key = findAccount()?.apiKey) {
  const res = await fetchWithRetry(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(key && { Authorization: `Bearer ${key}` }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`YouGile ${method} ${path}: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

// Списки в YouGile приходят страницами { paging: { next }, content: [...] }: собираем все
export async function list(path, key) {
  const sep = path.includes('?') ? '&' : '?';
  const items = [];
  for (let offset = 0; ; ) {
    const { content = [], paging } = await yougile('GET', `${path}${sep}limit=1000&offset=${offset}`, null, key);
    items.push(...content);
    if (!paging?.next || !content.length) return items;
    offset += content.length;
  }
}

const has = (title, needle) => title.toLowerCase().includes(needle.toLowerCase());

// Чаты по запросу { id, chat, task, board, project }: [{ id, title }]. У задачи ID чата совпадает с ID задачи
export async function findChats(query, key) {
  const get = (path) => list(path, key);

  if (query.id) {
    const id = query.id.match(/[0-9a-f-]{12,}$/i)?.[0]?.toLowerCase();
    if (!id) throw new Error(`Не понял ID чата: ${query.id}`);
    const group = (await get('/group-chats')).filter((c) => c.id.endsWith(id));
    if (group.length) return group.map((c) => ({ id: c.id, title: `Чат «${c.title}»` }));
    const tasks = (await get('/tasks')).filter((t) => t.id.endsWith(id));
    return tasks.map((t) => ({ id: t.id, title: `Задача «${t.title}»` }));
  }
  if (query.chat) {
    const chats = (await get('/group-chats')).filter((c) => has(c.title, query.chat));
    return chats.map((c) => ({ id: c.id, title: `Чат «${c.title}»` }));
  }

  const projects = (await get('/projects')).filter((p) => !query.project || has(p.title, query.project));
  const columns = [];
  for (const project of projects) {
    const boards = (await get(`/boards?projectId=${project.id}`)).filter((b) => !query.board || has(b.title, query.board));
    for (const board of boards) {
      for (const column of await get(`/columns?boardId=${board.id}`)) {
        columns.push({ ...column, where: `${board.title} · ${column.title}` });
      }
    }
  }

  const chats = [];
  for (const column of columns) {
    const search = query.task ? `&title=${encodeURIComponent(query.task)}` : '';
    for (const task of await get(`/task-list?columnId=${column.id}${search}`)) {
      const status = [task.completed && 'выполнена', task.archived && 'в архиве'].filter(Boolean);
      chats.push({
        id: task.id,
        title: `${column.where} · «${task.title}»${status.length ? ` [${status.join(', ')}]` : ''}`,
      });
    }
  }
  return chats;
}
