#!/usr/bin/env node
// Аккаунты YouGile: список, переключение, удаление.
//   node accounts.js              — список, активный отмечен
//   node accounts.js use <почта>  — сделать активным (подходит часть почты или названия компании)
//   node accounts.js remove <почта>
// Добавить аккаунт: bash open-setup.sh yougile
import { findAccount, loadAccounts, saveAccounts } from './lib.js';

const [command = 'list', query] = process.argv.slice(2);
const data = loadAccounts();

function print() {
  const names = Object.keys(data.accounts);
  if (!names.length) {
    console.log('Аккаунтов нет, добавь через open-setup.sh yougile');
    return;
  }
  for (const name of names) {
    const { company, columnName } = data.accounts[name];
    const mark = name === data.active ? '●' : '○';
    console.log(`${mark} ${name}${company ? ` (${company})` : ''} → ${columnName}`);
  }
}

try {
  if (command === 'list') {
    print();
  } else if (command === 'use') {
    if (!query) throw new Error('Укажи почту: accounts.js use <почта>');
    const { name } = findAccount(query, data);
    data.active = name;
    saveAccounts(data);
    console.log(`Активный аккаунт: ${name}`);
  } else if (command === 'remove') {
    if (!query) throw new Error('Укажи почту: accounts.js remove <почта>');
    const { name } = findAccount(query, data);
    delete data.accounts[name];
    if (data.active === name) data.active = Object.keys(data.accounts)[0] ?? null;
    saveAccounts(data);
    console.log(`Аккаунт ${name} удалён${data.active ? `, активный: ${data.active}` : ''}`);
  } else {
    throw new Error('Команды: list, use <почта>, remove <почта>');
  }
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
