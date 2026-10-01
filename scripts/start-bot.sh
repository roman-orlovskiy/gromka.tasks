#!/bin/bash
# Запускает бота отдельным процессом, который живёт независимо от Claude Code.
#   bash start-bot.sh          — запустить (если уже работает, ничего не делает)
#   bash start-bot.sh stop     — остановить
#   bash start-bot.sh status   — работает ли
DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
PID_FILE="$DIR/.bot.pid"
LOG="$DIR/bot.log"

running() { [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; }

if [ "${1:-}" = "status" ]; then
  running && echo "Бот работает (PID $(cat "$PID_FILE"))" || echo "Бот не запущен"
  exit 0
fi

if [ "${1:-}" = "stop" ]; then
  running && kill "$(cat "$PID_FILE")" && echo "Бот остановлен" || echo "Бот не запущен"
  rm -f "$PID_FILE"
  exit 0
fi

if running; then
  echo "Бот уже работает (PID $(cat "$PID_FILE"))"
  exit 0
fi

nohup node "$DIR/scripts/bot.js" > "$LOG" 2>&1 &
echo $! > "$PID_FILE"
for _ in {1..10}; do
  [ -s "$LOG" ] && break
  sleep 1
done
if running; then
  head -1 "$LOG"
else
  echo "Бот не запустился:"; cat "$LOG"; exit 1
fi
