import { randomUUID } from 'node:crypto';
import {
  closeSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DataError } from './errors.js';

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

function readError(filePath, reason) {
  return new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (${reason})`);
}

function migrateVersionOne(data) {
  const categories = structuredClone(DEFAULT_CATEGORIES);
  if (Array.isArray(data.transactions)) {
    for (const transaction of data.transactions) {
      const { type, category } = transaction ?? {};
      if ((type === 'expense' || type === 'income')
          && typeof category === 'string' && category !== '' && !categories[type].includes(category)) {
        categories[type].push(category);
      }
    }
  }
  return { ...data, version: CURRENT_VERSION, categories };
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
  if (version === 1) {
    return migrateVersionOne(data);
  }
  const { categories } = data;
  if (!['expense', 'income'].every((type) =>
    Array.isArray(categories?.[type]) && categories[type].every((name) => typeof name === 'string'))) {
    throw readError(filePath, 'categories가 올바르지 않습니다');
  }

  return data;
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
