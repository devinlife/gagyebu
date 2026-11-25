import { readFileSync } from 'node:fs';
import { parseCsv, readCsvRows } from '../csv.js';
import { DataError, UsageError, singleLineMessage, unexpectedArgument } from '../errors.js';
import { parseCommand } from '../options.js';
import { loadData, validateDataOption, writeData } from '../store.js';
import { importTransactions } from '../transaction.js';

export const name = 'import';
export const order = 95;
export const summary = 'CSV 파일의 거래를 더합니다.';

const USAGE = '사용법: gagyebu import <파일> [--dry-run] [--data <경로>]';
const MAX_ROW_ERRORS = 20;

export function run(argv) {
  const parsed = parseCommand(argv, {
    flags: ['dry-run'],
    positional: true,
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { args, options } = parsed;
  const [inputFile, extra] = args;
  if (inputFile === undefined) {
    throw new UsageError('파일이 없습니다', USAGE);
  }
  if (extra !== undefined) {
    throw unexpectedArgument(extra, USAGE);
  }
  validateDataOption(options, USAGE);

  let bytes;
  try {
    bytes = readFileSync(inputFile);
  } catch (error) {
    throw new DataError(`파일을 읽을 수 없습니다: ${inputFile} (${error.code})`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new DataError(`UTF-8 파일이 아닙니다: ${inputFile}`);
  }
  const rows = readCsvRows(parseCsv(text));
  const { data, filePath } = loadData(options, USAGE);
  const { added, duplicates, errors } = importTransactions(data, rows);

  if (errors.length > 0) {
    console.error(`오류: ${errors.length}개 행이 잘못되어 아무것도 더하지 않았습니다`);
    for (const { line, reason } of errors.slice(0, MAX_ROW_ERRORS)) {
      console.error(`${line}행: ${singleLineMessage(reason)}`);
    }
    if (errors.length > MAX_ROW_ERRORS) {
      console.error(`… 외 ${errors.length - MAX_ROW_ERRORS}행`);
    }
    return 1;
  }

  if (options['dry-run']) {
    console.log(`${added.length}건을 더할 수 있습니다(중복 ${duplicates}건).`);
    return 0;
  }
  if (added.length > 0) {
    data.transactions = data.transactions.concat(added);
    data.nextId += added.length;
    writeData(filePath, data);
  }
  console.log(`${added.length}건을 더했습니다(중복 ${duplicates}건 건너뜀).`);
  return 0;
}
