#!/usr/bin/env node
// Произвольный запрос на чтение к YouGile API. Пока только GET: писать скилл не умеет.
//   node api.js /projects
//   node api.js "/task-list?columnId=…" [--account "почта"] [--all]
// --all собирает все страницы списка и печатает только content
import { parseArgs } from 'node:util';
import { findAccount, list, yougile } from './lib.js';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    account: { type: 'string' },
    all: { type: 'boolean' },
  },
});

const [path] = positionals;
if (!path?.startsWith('/')) {
  console.error('Нужен путь от /api-v2, например: node api.js /projects');
  process.exit(2);
}

try {
  const account = findAccount(args.account);
  if (!account) {
    console.error('NO_SETUP: ключи YouGile не настроены, запусти scripts/open-setup.sh');
    process.exit(3);
  }
  const data = args.all ? await list(path, account.apiKey) : await yougile('GET', path, null, account.apiKey);
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
