import { randomUUID } from 'node:crypto';
import {
  closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DataError, UsageError } from './errors.js';
import { isValidDate } from './input.js';
import { RECORD_TYPES, TYPES } from './types.js';

export const CURRENT_VERSION = 2;
export const DEFAULT_CATEGORIES = {
  expense: ['식비', '교통', '주거', '통신', '생활', '의료', '문화', '기타'],
  income: ['급여', '용돈', '기타'],
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

export const MIGRATIONS = { 1: migrateVersionOne };

export function validateDataOption(options, usage) {
  if (options.data === '') {
    throw new UsageError('--data 값이 비었습니다', usage);
  }
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
      throw readError(filePath, `${label}: ${field}가 문자열이 아닙니다`);
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

  if (!Array.isArray(data.transactions)) {
    throw readError(filePath, 'transactions가 올바르지 않습니다');
  }
  const transactions = data.transactions.map((transaction, index) => validateTransaction(transaction, index, filePath));

  return { ...data, budgets, transactions };
}

export function writeData(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  if (json === undefined) {
    throw new DataError(`데이터 파일을 쓸 수 없습니다: ${filePath} (JSON으로 변환할 수 없습니다)`);
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
          `데이터 파일을 쓸 수 없습니다: ${filePath} (${error.code ?? error.message}, 임시 파일을 지울 수 없습니다: ${cleanupError.code ?? cleanupError.message})`,
        );
      }
    }
    throw new DataError(`데이터 파일을 쓸 수 없습니다: ${filePath} (${error.code ?? error.message})`);
  }
}
