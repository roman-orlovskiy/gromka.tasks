# task: задачи в YouGile из Claude Code и Telegram

Скилл для [Claude Code](https://claude.com/claude-code).

- `/task Подготовить договор до пятницы` в любом проекте создаёт карточку в YouGile,
  а бот присылает уведомление в Telegram
- сообщение Telegram-боту тоже превращается в карточку: бот передаёт его в Claude Code
  и отвечает, что получилось

## Установка

Проще всего попросить Claude Code: «Поставь скилл из github.com/roman-orlovskiy/gromka.tasks».
Терминал и git для этого не нужны.

Или вручную:

```bash
git clone https://github.com/roman-orlovskiy/gromka.tasks ~/.claude/skills/task
```

Нужны macOS, Node.js 18+ и Claude Code.

При первом `/task` скилл сам откроет окно Терминала и спросит:

1. логин и пароль YouGile (пароль нужен один раз, сохраняется только API-ключ),
   проект и колонку для новых задач
2. токен бота от [@BotFather](https://t.me/BotFather) и свой Telegram ID
   (его показывает [@userinfobot](https://t.me/userinfobot)); этот шаг можно пропустить

Всё сохраняется в `.env` внутри скилла и не попадает в git.

## Команды

| Команда | Что делает |
|---|---|
| `/task <текст>` | создать задачу; срок («до пятницы») и проект («Kngnn: …») понимает сам |
| `/task старт` | запустить Telegram-бота |
| `/task стоп` | остановить бота |
| `/task статус` | проверить, работает ли бот |

Бот работает отдельным процессом и не останавливается при выходе из Claude Code.
Он отвечает только владельцу (Telegram ID из настройки).

## Устройство

```
SKILL.md              инструкция для Claude
scripts/
  create-task.js      карточка в YouGile + уведомление
  notify.js           сообщения от бота
  bot.js              бот: сообщение → claude -p "/task …"
  start-bot.sh        старт, стоп и статус бота
  setup.js            настройка ключей
  open-setup.sh       открывает настройку в отдельном окне
.env                  ключи (создаётся при настройке)
```
