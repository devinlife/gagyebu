import { addAccount, listAccounts, removeAccount } from '../account.js';
import { parseName } from '../category.js';
import { UsageError, unexpectedArgument } from '../errors.js';
import { formatTable, formatWon } from '../format.js';
import { parseOpening } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, writeData } from '../store.js';

export const name = 'account';
export const order = 75;
export const summary = '계좌 목록을 보고 계좌를 더하거나 지웁니다.';

const USAGE = '사용법: gagyebu account list|add|rm [인자] [--옵션 값]';
const USAGES = {
  list: '사용법: gagyebu account list [--json] [--data <경로>]',
  add: '사용법: gagyebu account add <이름> [--opening <금액>] [--data <경로>]',
  rm: '사용법: gagyebu account rm <이름> [--data <경로>]',
};

function printAccounts(list, { json }) {
  if (json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }

  const rows = [['계좌', '시작 잔액', '거래']];
  for (const { name, opening, count } of list) {
    rows.push([name, formatWon(opening), `${count}건`]);
  }
  console.log(formatTable(rows, { right: [1, 2] }));
}

export function run(argv) {
  const [command, ...operands] = argv;
  if (command === '--help') {
    const { args, error } = parseOptions(operands, {});
    if (error || args.length > 0) {
      throw error ? new UsageError(error, USAGE) : unexpectedArgument(args[0], USAGE);
    }
    console.log(Object.values(USAGES).join('\n'));
    return 0;
  }
  if (command === undefined) {
    throw new UsageError('계좌 하위 명령이 없습니다', USAGE);
  }
  if (!Object.hasOwn(USAGES, command)) {
    throw new UsageError(`알 수 없는 계좌 하위 명령입니다: ${command}`, USAGE);
  }

  const usage = USAGES[command];
  const isList = command === 'list';
  const { args, options, error } = parseOptions(operands, {
    values: command === 'add' ? ['opening', 'data'] : ['data'],
    flags: isList ? ['help', 'json'] : ['help'],
  });
  if (error) {
    throw new UsageError(error, usage);
  }
  if (options.help) {
    console.log(usage);
    return 0;
  }
  if (isList && args.length > 0) {
    throw unexpectedArgument(args[0], usage);
  }
  const name = isList ? undefined : parseName(args, usage, '계좌');
  const opening = options.opening === undefined ? 0 : parseOpening(options.opening, usage);
  const { filePath, data } = loadData(options, usage);
  if (isList) {
    printAccounts(listAccounts(data), options);
    return 0;
  }

  if (command === 'add') {
    const accounts = addAccount(data.accounts, name, opening);
    writeData(filePath, { ...data, accounts });
    console.log(`계좌를 더했습니다: ${name} (시작 잔액 ${formatWon(opening)})`);
    return 0;
  }

  const accounts = removeAccount(data, name);
  writeData(filePath, { ...data, accounts });
  console.log(`계좌를 지웠습니다: ${name}`);
  return 0;
}
