import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DataError } from './errors.js';

export const CURRENT_VERSION = 1;

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

export function readData(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: CURRENT_VERSION, nextId: 1, transactions: [] };
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

  return data;
}

export function writeData(filePath, data) {
  let temporaryPath;
  try {
    const json = JSON.stringify(data, null, 2);
    if (json === undefined) {
      throw new DataError('JSON으로 변환할 수 없습니다');
    }

    const directory = path.dirname(filePath);
    mkdirSync(directory, { recursive: true });
    const candidate = path.join(directory, `.gagyebu-${randomUUID()}.tmp`);
    const fd = openSync(candidate, 'wx');
    temporaryPath = candidate;
    try {
      writeFileSync(fd, `${json}\n`, 'utf8');
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
