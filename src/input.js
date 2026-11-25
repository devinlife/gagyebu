import { DataError, UsageError } from './errors.js';
import { formatLocalDateTime } from './format.js';
import { TYPE_LABELS, TYPES } from './types.js';

export const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const relativeDays = new Map([['오늘', 0], ['어제', 1], ['그제', 2]]);
const numberPattern = '[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+';
const amountPattern = new RegExp(`^(?:(${numberPattern})만 ?)?(?:([1-9])천 ?)?(${numberPattern})?$`);

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function today(env = process.env) {
  const override = env.GAGYEBU_TODAY;
  if (override) {
    if (!isValidDate(override)) {
      throw new DataError(`GAGYEBU_TODAY가 YYYY-MM-DD가 아닙니다: ${override}`);
    }
    return override;
  }

  return formatLocalDateTime(new Date()).slice(0, 10);
}

export function currentMonth() {
  return today().slice(0, 7);
}

export function currentYear(env) {
  return today(env).slice(0, 4);
}

export function parseDate(text, usage, subject = '날짜는', env = process.env) {
  if (isValidDate(text)) {
    return text;
  }

  const daysAgo = relativeDays.get(text);
  if (daysAgo !== undefined) {
    const [year, month, day] = today(env).split('-').map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day - daysAgo);
    if (date.getUTCFullYear() >= 0) {
      return date.toISOString().slice(0, 10);
    }
  } else {
    const match = /^(\d{2})-(\d{2})$/.exec(text) ?? /^(\d{1,2})\/(\d{1,2})$/.exec(text);
    if (match) {
      const [, month, day] = match;
      const year = currentYear(env);
      const date = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
      if (isValidDate(date)) {
        return date;
      }
    }
  }

  throw new UsageError(`${subject} YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: ${text}`, usage);
}

export function parsePeriod(options, usage, { closed = false } = {}) {
  let from = options.from === undefined ? undefined : parseDate(options.from, usage, '--from은');
  let to = options.to === undefined ? undefined : parseDate(options.to, usage, '--to는');
  if (closed) {
    to ??= today();
    from ??= `${to.slice(0, 7)}-01`;
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new UsageError(`--from이 --to보다 늦습니다: ${from} > ${to}`, usage);
  }
  return { from, to };
}

export function parseMonth(text, usage) {
  if (!monthPattern.test(text)) {
    throw new UsageError(`--month는 YYYY-MM 형식의 달이어야 합니다: ${text}`, usage);
  }
  return text;
}

export function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, number - 1 + delta, 1);
  const shiftedYear = date.getUTCFullYear();
  if (shiftedYear < 0 || shiftedYear > 9999) {
    return null;
  }
  return date.toISOString().slice(0, 7);
}

export function monthEnd(month) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, number, 0);
  return date.toISOString().slice(0, 10);
}

export function parseYear(text, usage) {
  if (!/^\d{4}$/.test(text)) {
    throw new UsageError(`--year는 YYYY 형식의 연도여야 합니다: ${text}`, usage);
  }
  return Number(text);
}

export function parsePort(text, usage) {
  const port = Number(text);
  if (!/^[0-9]+$/.test(text) || port > 65535) {
    throw new UsageError(`--port는 0에서 65535 사이의 정수여야 합니다: ${text}`, usage);
  }
  return port;
}

export function parseChartOptions({ chart, json, width }, usage) {
  if (!chart) {
    if (width !== undefined) {
      throw new UsageError('--width는 --chart와 함께 써야 합니다', usage);
    }
    return null;
  }
  if (json) {
    throw new UsageError('--chart와 --json은 함께 쓸 수 없습니다', usage);
  }
  if (width === undefined) {
    return 40;
  }

  const number = Number(width);
  if (!/^[0-9]+$/.test(width) || number < 10 || number > 120) {
    throw new UsageError(`--width는 10에서 120 사이의 정수여야 합니다: ${width}`, usage);
  }
  return number;
}

export function parseCategory(text, usage) {
  return parseNonemptyOption(text, 'category', usage);
}

export function parseNonemptyOption(text, option, usage) {
  if (text === '') {
    throw new UsageError(`--${option} 값이 비었습니다`, usage);
  }
  return text;
}

export function parseType(text, usage) {
  if (!TYPES.includes(text)) {
    throw new UsageError(`--type은 ${TYPES.join(' 또는 ')}이어야 합니다: ${text}`, usage);
  }
  return text;
}

export function parseImportType(text) {
  const type = TYPES.find((value) => value === text || TYPE_LABELS[value] === text);
  if (type === undefined) {
    throw new UsageError(`type은 expense·income·지출·수입 중 하나여야 합니다: ${text}`);
  }
  return type;
}

export function parseAmount(text, usage) {
  const value = text.endsWith('원') ? text.slice(0, -1) : text;
  const match = amountPattern.exec(value);
  if (match && !value.endsWith(' ')) {
    const [, tenThousandsText, thousandsText = '0', remainderText = '0'] = match;
    const tenThousands = Number((tenThousandsText ?? '0').replaceAll(',', ''));
    const thousands = Number(thousandsText);
    const remainder = Number(remainderText.replaceAll(',', ''));
    const amount = tenThousands * 10000 + thousands * 1000 + remainder;
    if (!(tenThousandsText !== undefined && tenThousands === 0)
        && !(thousands > 0 && remainder >= 1000)
        && !(tenThousands > 0 && remainder >= 10000)
        && amount > 0 && [tenThousands, thousands, remainder, amount].every(Number.isSafeInteger)) {
      return amount;
    }
  }

  throw new UsageError(`금액은 양의 정수여야 합니다: ${text}`, usage);
}

export function parseOpening(text, usage) {
  if (text === '0') {
    return 0;
  }

  try {
    return text.startsWith('-') ? -parseAmount(text.slice(1), usage) : parseAmount(text, usage);
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    throw new UsageError(`--opening은 금액이거나 앞에 -를 붙인 금액이어야 합니다: ${text}`, usage);
  }
}

export function parseId(text, usage) {
  const id = Number(text);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(id)) {
    throw new UsageError(`번호는 양의 정수여야 합니다: ${text}`, usage);
  }
  return id;
}

export function parseTags(values = [], usage) {
  const tags = new Set();
  for (const value of values) {
    for (const part of value.split(',')) {
      const tag = part.trim().replace(/^#/, '');
      if (!tag || /\s/.test(tag) || [...tag].length > 20) {
        throw new UsageError(`태그는 공백 없는 1~20자여야 합니다: ${part}`, usage);
      }
      tags.add(tag);
    }
  }
  return [...tags];
}
