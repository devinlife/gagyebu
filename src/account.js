import { DataError } from './errors.js';
import { countTransactionsBy } from './transaction-counts.js';

export const DEFAULT_ACCOUNT = '현금';
const accountHint = ' (gagyebu account add로 더하세요)';

function findAccountIndex(accounts, name) {
  return accounts.findIndex((account) => account.name === name);
}

export function requireAccount(accounts, name, suffix = accountHint) {
  const index = findAccountIndex(accounts, name);
  if (index === -1) {
    throw new DataError(`없는 계좌입니다: ${name}${suffix}`);
  }
  return index;
}

export function listAccounts({ accounts, transactions }) {
  const counts = countTransactionsBy(transactions, 'account');
  return accounts.map(({ name, opening }) => ({ name, opening, count: counts.get(name) ?? 0 }));
}

export function addAccount(accounts, name, opening) {
  if (findAccountIndex(accounts, name) !== -1) {
    throw new DataError(`이미 있는 계좌입니다: ${name}`);
  }
  return [...accounts, { name, opening }];
}

export function removeAccount({ accounts, transactions }, name) {
  const index = requireAccount(accounts, name, '');
  const count = countTransactionsBy(transactions, 'account').get(name) ?? 0;
  if (count > 0) {
    throw new DataError(`${count}건의 거래가 쓰는 계좌입니다: ${name}`);
  }
  if (accounts.length === 1) {
    throw new DataError(`마지막 남은 계좌는 지울 수 없습니다: ${name}`);
  }
  return accounts.toSpliced(index, 1);
}
