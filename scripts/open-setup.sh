#!/bin/bash
# Открывает отдельное окно Терминала для ввода ключей, ждёт окончания настройки
# и возвращает фокус в приложение, из которого её запустили.
#   bash open-setup.sh yougile
set -u

DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SECTION="${1:?Укажи раздел настройки}"
DONE="$DIR/.setup-done"
TIMEOUT=600

PREV_APP="$(lsappinfo info -only bundleid "$(lsappinfo front)" | sed -E 's/.*"([^"]+)"$/\1/')"
rm -f "$DONE"

WIN_ID="$(osascript <<EOF
tell application "Terminal"
  set t to do script "cd '$DIR' && clear && node scripts/setup.js $SECTION; echo \$? > .setup-done; exit"
  activate
  return id of front window
end tell
EOF
)"

for ((i = 0; i < TIMEOUT; i++)); do
  [ -f "$DONE" ] && break
  sleep 1
done

if [ ! -f "$DONE" ]; then
  echo "Настройка не завершилась за $TIMEOUT секунд"
  exit 1
fi

STATUS="$(cat "$DONE")"
rm -f "$DONE"
sleep 1
osascript -e "tell application \"Terminal\" to close (every window whose id is $WIN_ID)" >/dev/null 2>&1
[ -n "$PREV_APP" ] && open -b "$PREV_APP"

if [ "$STATUS" = "0" ]; then
  echo "Настройка $SECTION завершена, ключи сохранены в .env"
else
  echo "Настройка $SECTION завершилась с ошибкой"
fi
exit "$STATUS"
