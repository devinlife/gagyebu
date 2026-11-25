import { DataError } from './errors.js';
import { withParticle } from './format.js';
import { monthEnd } from './input.js';
import { buildTransaction, requireEntryReferences } from './transaction.js';

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

export function ruleDate(day, month) {
  const lastDay = Number(monthEnd(month).slice(8));
  const dayText = String(Math.min(day, lastDay)).padStart(2, '0');
  return `${month}-${dayText}`;
}

export function applyRecurring(data, month, filePath) {
  const rules = data.recurring
    .filter(({ start, end }) => start <= month && (end === null || month <= end))
    .sort((a, b) => a.id - b.id);
  const alreadyApplied = new Set(data.transactions
    .filter(({ recurringMonth }) => recurringMonth === month)
    .map(({ recurringId }) => recurringId));

  const added = [];
  const entryData = { ...data };
  let existing = 0;
  for (const rule of rules) {
    if (alreadyApplied.has(rule.id)) {
      existing += 1;
      continue;
    }

    const date = ruleDate(rule.day, month);
    const transaction = buildTransaction(entryData, { ...rule, date }, filePath);
    added.push({ ...transaction, recurringId: rule.id, recurringMonth: month });
    entryData.nextId += 1;
  }
  return { added, existing };
}
