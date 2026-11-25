import { readdirSync } from 'node:fs';

const directory = new URL('./commands/', import.meta.url);
const files = readdirSync(directory).filter((file) => file.endsWith('.js'));
const modules = await Promise.all(files.map((file) => import(new URL(file, directory))));
modules.sort((a, b) => a.order - b.order);

const names = new Set();
const orders = new Set();
for (const { name, order } of modules) {
  if (names.has(name)) {
    throw new Error(`명령 이름이 겹칩니다: ${name}`);
  }
  if (orders.has(order)) {
    throw new Error(`명령 순서가 겹칩니다: ${order}`);
  }
  names.add(name);
  orders.add(order);
}

export const commands = Object.fromEntries(modules.map((command) => [command.name, command]));
