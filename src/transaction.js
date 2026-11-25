import { formatWon } from './format.js';

export function describeTransaction({ id, date, type, amount, category, memo }) {
  const label = type === 'income' ? '수입' : '지출';
  const description = memo ? `${category} ${memo}` : category;
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}`;
}

export function parseId(text) {
  if (!/^[1-9][0-9]*$/.test(text)) {
    return null;
  }

  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}
