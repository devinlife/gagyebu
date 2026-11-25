import { UsageError } from './errors.js';
import { formatWon } from './format.js';

export function describeTransaction({ id, date, type, amount, category, memo, tags }) {
  const label = type === 'income' ? '수입' : '지출';
  const description = memo ? `${category} ${memo}` : category;
  const tagText = Array.isArray(tags) && tags.length > 0 ? ` #${tags.join(' #')}` : '';
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}${tagText}`;
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

export function parseId(text) {
  if (!/^[1-9][0-9]*$/.test(text)) {
    return null;
  }

  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}
