import { constants, copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DataError } from './errors.js';
import { formatLocalDateTime } from './format.js';
import { readBackup, readData, readError } from './store.js';

const backupName = /^gagyebu-(\d{8}-\d{6})(?:-(\d+))?\.json$/;

export function backupDirectory(dataPath, dirOption) {
  return path.resolve(dirOption ?? path.join(path.dirname(dataPath), 'backups'));
}

export function createBackup(dataPath, directory, now = new Date()) {
  let source;
  try {
    source = statSync(dataPath, { throwIfNoEntry: false });
  } catch (error) {
    throw readError(dataPath, error.code ?? error.message);
  }
  if (source === undefined) {
    throw new DataError('백업할 데이터 파일이 없습니다');
  }
  const count = readData(dataPath).transactions.length;
  const stamp = formatLocalDateTime(now).replace(/[-:]/g, '').replace(' ', '-');

  try {
    mkdirSync(directory, { recursive: true });
  } catch (error) {
    throw new DataError(`백업 폴더를 만들 수 없습니다: ${directory} (${error.code ?? error.message})`);
  }

  for (let number = 1; ; number += 1) {
    const suffix = number === 1 ? '' : `-${number}`;
    const target = path.join(directory, `gagyebu-${stamp}${suffix}.json`);
    try {
      copyFileSync(dataPath, target, constants.COPYFILE_EXCL);
      return { path: target, count };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new DataError(`백업 파일을 쓸 수 없습니다: ${target} (${error.code ?? error.message})`);
      }
    }
  }
}

function countTransactions(filePath) {
  try {
    return readBackup(filePath).transactions.length;
  } catch (error) {
    if (error instanceof DataError) {
      return null;
    }
    throw error;
  }
}

function directoryReadError(directory, error) {
  return new DataError(`백업 폴더를 읽을 수 없습니다: ${directory} (${error.code ?? error.message})`);
}

export function listBackups(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw directoryReadError(directory, error);
  }

  const backups = [];
  for (const entry of entries) {
    const match = entry.isFile() ? backupName.exec(entry.name) : null;
    if (match) {
      const [, stamp, number = '1'] = match;
      backups.push({ name: entry.name, stamp, number: Number(number) });
    }
  }
  backups.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.number - a.number);

  return backups.map(({ name }) => {
    const filePath = path.join(directory, name);
    let size;
    try {
      ({ size } = statSync(filePath));
    } catch (error) {
      throw directoryReadError(directory, error);
    }
    return { name, size, count: countTransactions(filePath) };
  });
}
