#!/usr/bin/env node
// Создаёт карточку в YouGile.
//   node create-task.js --title "…" [--description "…"] [--deadline YYYY-MM-DD] [--project "…"]
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { list, loadEnv, yougile } from './lib.js';
import { notify } from './notify.js';

const { values: args } = parseArgs({
  options: {
    title: { type: 'string' },
    description: { type: 'string' },
    deadline: { type: 'string' },
    project: { type: 'string' },
  },
});

if (!args.title) {
  console.error('Нужен --title');
  process.exit(2);
}

const env = loadEnv();
if (!env.YOUGILE_API_KEY || !env.YOUGILE_COLUMN_ID) {
  console.error('NO_SETUP: ключи YouGile не настроены, запусти scripts/open-setup.sh');
  process.exit(3);
}

// Первая колонка первой доски проекта, найденного по названию
async function firstColumnOf(projectName) {
  const needle = projectName.toLowerCase();
  const project = (await list('/projects')).find((p) => p.title.toLowerCase().includes(needle));
  if (!project) throw new Error(`Проект «${projectName}» не найден`);
  const [board] = await list(`/boards?projectId=${project.id}`);
  if (!board) throw new Error(`В проекте «${project.title}» нет досок`);
  const [column] = await list(`/columns?boardId=${board.id}`);
  if (!column) throw new Error(`На доске «${board.title}» нет колонок`);
  return { id: column.id, where: `${project.title} · ${column.title}` };
}

const target = args.project
  ? await firstColumnOf(args.project)
  : { id: env.YOUGILE_COLUMN_ID, where: env.YOUGILE_COLUMN_NAME };

const task = { title: args.title, columnId: target.id, idempotencyKey: randomUUID() };
if (args.description) task.description = args.description;
if (args.deadline) task.deadline = { deadline: new Date(`${args.deadline}T12:00:00`).getTime() };

await yougile('POST', '/tasks', task);
const message = `Задача создана: ${args.title} (${target.where})`;
console.log(message);

// Задачи из бота не дублируем уведомлением: бот и так ответит
if (!process.env.TASK_NO_NOTIFY) {
  await notify(message).catch((err) => console.error(`Уведомление не отправлено: ${err.message}`));
}
