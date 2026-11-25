import { UsageError } from './errors.js';

const relativeDays = new Map([['오늘', 0], ['어제', 1], ['그제', 2]]);
const numberPattern = '[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+';
const amountPattern = new RegExp(`^(?:(${numberPattern})만 ?)?(?:([1-9])천 ?)?(${numberPattern})?$`);

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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
      throw new UsageError(
        `GAGYEBU_TODAY는 YYYY-MM-DD 형식의 있는 날이어야 합니다: ${override}`,
        '사용법은 gagyebu help를 보세요.',
      );
    }
    return override;
  }

  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return [year, month, day].join('-');
}

export function parseDate(text, env = process.env) {
  if (isValidDate(text)) {
    return text;
  }

  const daysAgo = relativeDays.get(text);
  if (daysAgo !== undefined) {
    const [year, month, day] = today(env).split('-').map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day - daysAgo);
    return date.getUTCFullYear() >= 0 ? date.toISOString().slice(0, 10) : null;
  }

  const match = /^(\d{2})-(\d{2})$/.exec(text) ?? /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (!match) {
    return null;
  }

  const [, month, day] = match;
  const year = today(env).slice(0, 4);
  const date = [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  return isValidDate(date) ? date : null;
}

export function parseAmount(text) {
  const value = text.endsWith('원') ? text.slice(0, -1) : text;
  const match = amountPattern.exec(value);
  if (!match || value.endsWith(' ')) {
    return null;
  }

  const [, tenThousandsText, thousandsText = '0', remainderText = '0'] = match;
  const tenThousands = Number((tenThousandsText ?? '0').replaceAll(',', ''));
  const thousands = Number(thousandsText);
  const remainder = Number(remainderText.replaceAll(',', ''));
  if ((tenThousandsText !== undefined && tenThousands === 0)
    || (thousands > 0 && remainder >= 1000)
    || (tenThousands > 0 && remainder >= 10000)) {
    return null;
  }

  const amount = tenThousands * 10000 + thousands * 1000 + remainder;
  return amount > 0 && [tenThousands, thousands, remainder, amount].every(Number.isSafeInteger)
    ? amount : null;
}
