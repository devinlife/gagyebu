import { UsageError, unexpectedArgument } from '../errors.js';
import { formatTable, formatWon } from '../format.js';
import { currentMonth, parseAmountArgument, parseDay, parseIdArgument, parseMonth } from '../input.js';
import { parseSubcommand } from '../options.js';
import { addRule, applyRecurring, removeRule } from '../recurring.js';
import { loadData, validateDataOption, writeData } from '../store.js';
import { describeTransaction, parseEntryOptions } from '../transaction.js';
import { TYPE_LABELS } from '../types.js';

export const name = 'recurring';
export const order = 26;
export const summary = '매달 반복할 거래 규칙을 관리합니다.';

const USAGE = '사용법: gagyebu recurring add|list|rm|apply [인자] [--옵션 값]';
const USAGES = {
  add: '사용법: gagyebu recurring add <금액> --day <일> [--type expense|income] [--category <분류>] [--account <이름>] [--memo <글>] [--tag <태그>] [--start YYYY-MM] [--end YYYY-MM] [--data <경로>]',
  list: '사용법: gagyebu recurring list [--json] [--data <경로>]',
  rm: '사용법: gagyebu recurring rm <번호> [--data <경로>]',
  apply: '사용법: gagyebu recurring apply [--month YYYY-MM] [--dry-run] [--data <경로>]',
};

function rulePeriod({ start, end }) {
  return `${start}~${end ?? ''}`;
}

function add(args, options, usage) {
  const amount = parseAmountArgument(args, usage);
  const entry = parseEntryOptions({ ...options, tags: options.tag }, usage);
  const day = parseDay(options.day, usage);
  const start = options.start === undefined ? currentMonth() : parseMonth(options.start, usage, 'start');
  const end = options.end === undefined ? null : parseMonth(options.end, usage, 'end');
  if (end !== null && end < start) {
    throw new UsageError(`--end가 --start보다 이릅니다: ${end} < ${start}`, usage);
  }

  const { filePath, data } = loadData(options, usage);
  const updated = addRule(data, { ...entry, amount, day, start, end });
  writeData(filePath, { ...data, ...updated });

  const rule = updated.recurring.at(-1);
  const description = describeTransaction({ ...rule, date: `매달 ${day}일` });
  console.log(`반복 규칙을 더했습니다: ${description} (${rulePeriod(rule)})`);
}

function list(args, options, usage) {
  if (args.length > 0) {
    throw unexpectedArgument(args[0], usage);
  }
  const { data: { recurring } } = loadData(options, usage);
  if (options.json) {
    console.log(JSON.stringify(recurring, null, 2));
    return;
  }
  if (recurring.length === 0) {
    console.log('반복 규칙이 없습니다.');
    return;
  }

  const rows = [['번호', '날', '구분', '금액', '분류', '계좌', '메모', '기간']];
  for (const rule of recurring) {
    const { id, day, type, amount, category, account, memo } = rule;
    rows.push([String(id), `${day}일`, TYPE_LABELS[type], formatWon(amount), category, account, memo, rulePeriod(rule)]);
  }
  console.log(formatTable(rows, { right: [3] }));
}

function remove(args, options, usage) {
  const id = parseIdArgument(args, usage);
  const { filePath, data } = loadData(options, usage);
  const { removed, recurring } = removeRule(data.recurring, id);
  writeData(filePath, { ...data, recurring });
  console.log(`반복 규칙을 지웠습니다: #${removed.id}`);
}

function apply(args, options, usage) {
  if (args.length > 0) {
    throw unexpectedArgument(args[0], usage);
  }
  const month = options.month === undefined ? currentMonth() : parseMonth(options.month, usage);
  const { filePath, data } = loadData(options, usage);
  const { added, existing } = applyRecurring(data, month, filePath);
  const dryRun = options['dry-run'];
  if (!dryRun && added.length > 0) {
    writeData(filePath, {
      ...data,
      transactions: [...data.transactions, ...added],
      nextId: data.nextId + added.length,
    });
  }

  const prefix = dryRun ? '만들 거래' : '추가했습니다';
  for (const transaction of added) {
    console.log(`${prefix}: ${describeTransaction(transaction)}`);
  }
  const result = dryRun ? '만들 예정입니다' : '만들었습니다';
  console.log(`${added.length}건을 ${result}(이미 있음 ${existing}건).`);
}

const commands = { add, list, rm: remove, apply };

export function run(argv) {
  const parsed = parseSubcommand(argv, {
    label: '반복 규칙', usage: USAGE, usages: USAGES,
    values: { add: ['day', 'type', 'category', 'account', 'memo', 'tag', 'start', 'end'], apply: ['month'] },
    flags: { apply: ['dry-run'] },
    repeatable: { add: ['tag'] },
  });
  if (parsed === null) {
    return 0;
  }
  const { command, args, options, usage } = parsed;
  validateDataOption(options, usage);
  commands[command](args, options, usage);
  return 0;
}
