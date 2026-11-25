import { DataError } from './errors.js';
import { EXPENSE, INCOME, TRANSFER } from './types.js';
import { countUses } from './usage.js';

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

export function listAccounts(data) {
  const counts = countUses(data, 'account');
  return data.accounts.map(({ name, opening }) => ({ name, opening, count: counts.get(name)?.transactions ?? 0 }));
}

export function addAccount(accounts, name, opening) {
  if (findAccountIndex(accounts, name) !== -1) {
    throw new DataError(`이미 있는 계좌입니다: ${name}`);
  }
  return [...accounts, { name, opening }];
}

export function removeAccount(data, name) {
  const { accounts } = data;
  const index = requireAccount(accounts, name, '');
  const count = countUses(data, 'account').get(name)?.transactions ?? 0;
  if (count > 0) {
    throw new DataError(`${count}건의 거래가 쓰는 계좌입니다: ${name}`);
  }
  if (accounts.length === 1) {
    throw new DataError(`마지막 남은 계좌는 지울 수 없습니다: ${name}`);
  }
  return accounts.toSpliced(index, 1);
}

export function accountBalances({ accounts, transactions }, date) {
  const entries = accounts.map(({ name, opening }) => ({ name, opening, balance: opening }));
  const balances = new Map(entries.map((entry) => [entry.name, entry]));
  for (const transaction of transactions) {
    if (transaction.date > date) {
      continue;
    }
    const { type, amount, account, toAccount } = transaction;
    const source = balances.get(account);
    if (source !== undefined) {
      if (type === INCOME) {
        source.balance += amount;
      } else if (type === EXPENSE || type === TRANSFER) {
        source.balance -= amount;
      }
    }
    if (type === TRANSFER) {
      const target = balances.get(toAccount);
      if (target !== undefined) {
        target.balance += amount;
      }
    }
  }
  const total = entries.reduce((sum, { balance }) => sum + balance, 0);
  return { date, accounts: entries, total };
}
