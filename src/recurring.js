import { DataError } from './errors.js';
import { withParticle } from './format.js';
import { requireEntryReferences } from './transaction.js';

export function addRule(data, rule) {
  requireEntryReferences(data, rule);
  const id = data.nextRecurringId;
  if (!Number.isSafeInteger(id + 1)) {
    throw new DataError('다음 반복 규칙 번호를 저장할 수 없습니다');
  }
  return {
    recurring: [...data.recurring, { id, ...rule }],
    nextRecurringId: id + 1,
  };
}

export function removeRule(recurring, id) {
  const index = recurring.findIndex((rule) => rule.id === id);
  if (index === -1) {
    throw new DataError(`반복 규칙 #${withParticle(String(id), '이/가')} 없습니다`);
  }
  return { removed: recurring[index], recurring: recurring.toSpliced(index, 1) };
}
