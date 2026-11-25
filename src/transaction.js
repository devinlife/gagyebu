import { formatWon } from './format.js';
import { TYPE_LABELS } from './types.js';

export function describeTransaction({ id, date, type, amount, category, memo, tags }) {
  const label = TYPE_LABELS[type];
  const description = memo ? `${category} ${memo}` : category;
  const tagText = Array.isArray(tags) && tags.length > 0 ? ` #${tags.join(' #')}` : '';
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}${tagText}`;
}
