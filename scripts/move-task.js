#!/usr/bin/env node
// Переносит задачу в другую колонку той же доски.
//   node move-task.js --task "KNGNN-178" --column "В работе" [--account "почта"]
// --task: номер задачи (KNGNN-178, ID-211) или часть названия; --column: часть названия колонки
import { parseArgs } from 'node:util';
import { findAccount, list, yougile } from './lib.js';

const { values: args } = parseArgs({
  options: {
    task: { type: 'string' },
    column: { type: 'string' },
    account: { type: 'string' },
  },
});

if (!args.task || !args.column) {
  console.error('Нужны --task и --column');
  process.exit(2);
}

// Точное совпадение важнее частичного: «Тест» не должен цеплять «Тестирование»
function pick(items, needle, label, what) {
  const n = needle.toLowerCase();
  const exact = items.filter((i) => label(i).some((l) => l?.toLowerCase() === n));
  const found = exact.length ? exact : items.filter((i) => label(i).some((l) => l?.toLowerCase().includes(n)));
  if (!found.length) throw new Error(`${what} «${needle}» не найдена`);
  if (found.length > 1) {
    throw new Error(`«${needle}» подходит к нескольким: ${found.slice(0, 10).map((i) => label(i).filter(Boolean).join(' ')).join('; ')}`);
  }
  return found[0];
}

try {
  const account = findAccount(args.account);
  if (!account) {
    console.error('NO_SETUP: ключи YouGile не настроены, запусти scripts/open-setup.sh');
    process.exit(3);
  }
  const key = account.apiKey;

  const tasks = await list('/tasks', key);
  const task = pick(tasks, args.task.replace(/^#/, ''), (t) => [t.idTaskProject, t.idTaskCommon, t.title], 'Задача');
  const from = await yougile('GET', `/columns/${task.columnId}`, null, key);
  const columns = await list(`/columns?boardId=${from.boardId}`, key);
  const to = pick(columns, args.column, (c) => [c.title], 'Колонка');

  const name = `${task.idTaskProject ?? task.idTaskCommon} «${task.title}»`;
  if (to.id === from.id) {
    console.log(`${name} уже в колонке «${to.title}»`);
  } else {
    await yougile('PUT', `/tasks/${task.id}`, { columnId: to.id }, key);
    console.log(`${name}: ${from.title} → ${to.title}`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
