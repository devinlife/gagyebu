import { addAccount, listAccounts, removeAccount } from '../account.js';
import { parseName } from '../category.js';
import { unexpectedArgument } from '../errors.js';
import { formatTable, formatWon } from '../format.js';
import { parseOpening } from '../input.js';
import { parseSubcommand } from '../options.js';
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
  const parsed = parseSubcommand(argv, {
    label: '계좌', usage: USAGE, usages: USAGES,
    values: { add: ['opening'] },
  });
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { command, args, options, usage } = parsed;
  const isList = command === 'list';
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
