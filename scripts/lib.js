// Общие функции скилла: чтение и запись .env, запросы к YouGile API
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_PATH = join(ROOT, '.env');

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

export function saveEnv(values) {
  const env = { ...loadEnv(), ...values };
  const text = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync(ENV_PATH, text, { mode: 0o600 });
}

const API = 'https://yougile.com/api-v2';

export async function yougile(method, path, body, key = loadEnv().YOUGILE_API_KEY) {
  const res = await fetch(API + path, {
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

// Списки в YouGile приходят как { paging, content: [...] }
export async function list(path) {
  const sep = path.includes('?') ? '&' : '?';
  return (await yougile('GET', `${path}${sep}limit=1000`)).content ?? [];
}
