import { randomUUID } from 'node:crypto';
import {
  closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_ACCOUNT } from './account.js';
import { DEFAULT_CATEGORY } from './category.js';
import { DataError, singleLineMessage } from './errors.js';
import { withParticle } from './format.js';
import { isValidDate, parseNonemptyOption } from './input.js';
import { RECORD_TYPES, TYPES } from './types.js';

export const CURRENT_VERSION = 3;
export const DEFAULT_CATEGORIES = {
  expense: ['식비', '교통', '주거', '통신', '생활', '의료', '문화', DEFAULT_CATEGORY],
  income: ['급여', '용돈', DEFAULT_CATEGORY],
};

export function resolveDataPath(dataOption, env = process.env, home = os.homedir()) {
  const candidate = dataOption || env.GAGYEBU_DATA || '~/.gagyebu/data.json';
  if (candidate === '~') {
    return path.resolve(home);
  }
  if (candidate.startsWith('~/')) {
    return path.resolve(path.join(home, candidate.slice(2)));
  }
  return path.resolve(candidate);
}

export function readError(filePath, reason) {
  return new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (${reason})`);
}

function migrateVersionOne(data) {
  const categories = structuredClone(DEFAULT_CATEGORIES);
  if (Array.isArray(data.transactions)) {
    for (const transaction of data.transactions) {
      const { type, category } = transaction ?? {};
      if (TYPES.includes(type)
          && typeof category === 'string' && category !== '' && !categories[type].includes(category)) {
        categories[type].push(category);
      }
    }
  }
  return { ...data, categories };
}

function migrateVersionTwo(data) {
  const names = new Set([DEFAULT_ACCOUNT]);
  if (Array.isArray(data.transactions)) {
    for (const transaction of data.transactions) {
      const { account } = transaction ?? {};
      if (typeof account === 'string' && account !== '') {
        names.add(account);
      }
    }
  }
  return { ...data, accounts: [...names].map((name) => ({ name, opening: 0 })) };
}

export const MIGRATIONS = { 1: migrateVersionOne, 2: migrateVersionTwo };

export function validateDataOption(options, usage) {
  parseNonemptyOption(options.data, 'data', usage);
}

export function loadData(options, usage) {
  validateDataOption(options, usage);
  const filePath = resolveDataPath(options.data);
  return { filePath, data: readData(filePath) };
}

function validateTransaction(transaction, index, filePath) {
  const position = `거래 ${index + 1}번째`;
  if (transaction === null || typeof transaction !== 'object' || Array.isArray(transaction)) {
    throw readError(filePath, `${position}: 객체가 아닙니다`);
  }

  const { id, date, type, amount, tags = [] } = transaction;
  if (!Number.isInteger(id) || id < 1) {
    throw readError(filePath, `${position}: id가 양의 정수가 아닙니다`);
  }

  const label = `거래 #${id}`;
  if (!isValidDate(date)) {
    throw readError(filePath, `${label}: date가 있는 날이 아닙니다`);
  }
  if (!RECORD_TYPES.includes(type)) {
    const value = typeof type === 'string' ? type : typeof type;
    throw readError(filePath, `${label}: type을 알 수 없습니다: ${value}`);
  }
  if (!Number.isInteger(amount) || amount < 1) {
    throw readError(filePath, `${label}: amount가 양의 정수가 아닙니다`);
  }
  for (const field of ['category', 'account', 'memo']) {
    if (typeof transaction[field] !== 'string') {
      throw readError(filePath, `${label}: ${withParticle(field, '이/가')} 문자열이 아닙니다`);
    }
  }
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw readError(filePath, `${label}: tags가 문자열 배열이 아닙니다`);
  }
  return { ...transaction, tags };
}

export function readData(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        version: CURRENT_VERSION,
        nextId: 1,
        categories: structuredClone(DEFAULT_CATEGORIES),
        budgets: {},
        accounts: [{ name: DEFAULT_ACCOUNT, opening: 0 }],
        transactions: [],
      };
    }
    throw readError(filePath, error.code ?? error.message);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw readError(filePath, 'JSON 형식이 잘못되었습니다');
  }

  const version = data?.version;
  if (!Number.isInteger(version) || version < 1) {
    const value = typeof version === 'object' ? JSON.stringify(version) : String(version);
    throw readError(filePath, `version이 올바르지 않습니다: ${value}`);
  }
  if (version > CURRENT_VERSION) {
    throw readError(filePath, `지원하지 않는 version입니다: ${version}`);
  }
  for (let v = version; v < CURRENT_VERSION; v += 1) {
    data = { ...MIGRATIONS[v](data), version: v + 1 };
  }
  const { categories } = data;
  if (!TYPES.every((type) =>
    Array.isArray(categories?.[type]) && categories[type].every((name) => typeof name === 'string'))) {
    throw readError(filePath, 'categories가 올바르지 않습니다');
  }

  const { budgets = {} } = data;
  if (budgets === null || typeof budgets !== 'object' || Array.isArray(budgets)
      || !Object.values(budgets).every((amount) => Number.isSafeInteger(amount) && amount > 0)) {
    throw readError(filePath, 'budgets가 올바르지 않습니다');
  }

  const { accounts } = data;
  if (!Array.isArray(accounts) || !accounts.every((account) =>
    typeof account?.name === 'string' && account.name !== '' && Number.isSafeInteger(account.opening))
      || new Set(accounts.map(({ name }) => name)).size !== accounts.length) {
    throw readError(filePath, 'accounts가 올바르지 않습니다');
  }

  if (!Array.isArray(data.transactions)) {
    throw readError(filePath, 'transactions가 올바르지 않습니다');
  }
  const transactions = data.transactions.map((transaction, index) => validateTransaction(transaction, index, filePath));

  return { ...data, budgets, transactions };
}

const HISTORY_LIMIT = 20;
let commandSummary;

export function setCommandSummary(text) {
  commandSummary = text;
}

export function describeCommand(argv) {
  return argv.map((arg) => arg === '' || /[\s"'\p{Cc}]/u.test(arg) ? JSON.stringify(arg) : arg).join(' ');
}

function historyPath(filePath) {
  return `${filePath}.history.json`;
}

function isHistoryEntry(entry) {
  return typeof entry?.at === 'string' && typeof entry.command === 'string'
    && entry.data !== null && typeof entry.data === 'object' && !Array.isArray(entry.data);
}

class InvalidHistoryError extends DataError {
  constructor(details) {
    super(`이력 파일을 읽을 수 없습니다: ${details}`);
    this.details = details;
  }
}

export function readHistory(filePath) {
  const target = historyPath(filePath);
  let text;
  try {
    text = readFileSync(target, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new DataError(`이력 파일을 읽을 수 없습니다: ${target} (${error.code ?? error.message})`);
  }

  let entries;
  try {
    entries = JSON.parse(text);
  } catch {
    throw new InvalidHistoryError(`${target} (JSON 형식이 잘못되었습니다)`);
  }
  if (!Array.isArray(entries) || !entries.every(isHistoryEntry)) {
    throw new InvalidHistoryError(`${target} (이력 항목 형식이 올바르지 않습니다)`);
  }
  return entries;
}

export function writeData(filePath, data) {
  if (commandSummary !== undefined) {
    const before = readData(filePath);
    let entries;
    try {
      entries = readHistory(filePath);
    } catch (error) {
      if (!(error instanceof InvalidHistoryError)) {
        throw error;
      }
      console.error(singleLineMessage(`경고: 이력 파일이 깨져 새로 시작합니다: ${error.details}`));
      entries = [];
    }
    entries.push({ at: new Date().toISOString(), command: commandSummary, data: before });
    writeJsonFile(historyPath(filePath), entries.slice(-HISTORY_LIMIT), '이력 파일');
  }
  writeJsonFile(filePath, data, '데이터 파일');
}

function writeJsonFile(filePath, value, label) {
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) {
    throw new DataError(`${label}을 쓸 수 없습니다: ${filePath} (JSON으로 변환할 수 없습니다)`);
  }

  let temporaryPath;
  try {
    const existing = lstatSync(filePath, { throwIfNoEntry: false });
    const directory = path.dirname(filePath);
    mkdirSync(directory, { recursive: true });
    const candidate = path.join(directory, `.gagyebu-${randomUUID()}.tmp`);
    const fd = openSync(candidate, 'wx', 0o600);
    temporaryPath = candidate;
    try {
      writeFileSync(fd, `${json}\n`, 'utf8');
      if (existing?.isFile()) {
        fchmodSync(fd, existing.mode & 0o777);
      }
    } finally {
      closeSync(fd);
    }
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (temporaryPath !== undefined) {
      try {
        rmSync(temporaryPath, { force: true });
      } catch (cleanupError) {
        throw new DataError(
          `${label}을 쓸 수 없습니다: ${filePath} (${error.code ?? error.message}, 임시 파일을 지울 수 없습니다: ${cleanupError.code ?? cleanupError.message})`,
        );
      }
    }
    throw new DataError(`${label}을 쓸 수 없습니다: ${filePath} (${error.code ?? error.message})`);
  }
}
