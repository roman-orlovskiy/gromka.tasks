// Уведомление в Telegram от бота. Без настроенного бота молча ничего не делает
import { loadEnv } from './lib.js';

export async function telegram(method, body, token = loadEnv().TELEGRAM_BOT_TOKEN) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

export async function notify(text) {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  await telegram('sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text });
  return true;
}
