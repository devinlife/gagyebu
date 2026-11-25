import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountBalances, addAccount, listAccounts, removeAccount, requireAccount } from '../src/account.js';
import { DataError } from '../src/errors.js';
import { currentData, transaction } from './helpers.js';

const cash = { name: '현금', opening: 0 };
const card = { name: '카드', opening: -50000 };

test('계좌를 등록 순서 끝에 더하고 같은 이름은 거부한다', () => {
  const accounts = [cash];
  assert.deepEqual(addAccount(accounts, card.name, card.opening), [cash, card]);
  assert.deepEqual(accounts, [cash]);
  assert.throws(() => addAccount(accounts, cash.name, 2000), {
    constructor: DataError, message: '이미 있는 계좌입니다: 현금',
  });
  assert.throws(() => requireAccount(accounts, card.name), {
    constructor: DataError, message: '없는 계좌입니다: 카드 (gagyebu account add로 더하세요)',
  });
});

test('등록한 계좌만 순서대로 나열하고 거래 수를 보여 준다', () => {
  const data = currentData({
    accounts: [cash, card],
    transactions: [
      transaction({ account: '카드' }), transaction({ account: '카드' }), transaction({ account: '미등록' }),
    ],
  });
  assert.deepEqual(listAccounts(data), [{ ...cash, count: 0 }, { ...card, count: 2 }]);
});

test('쓰지 않는 계좌를 지우고 없는 계좌와 쓰는 계좌와 마지막 계좌는 지울 수 없다', () => {
  const recurring = [{ id: 1, account: '카드' }, { id: 2, account: '카드' }];
  const data = currentData({ accounts: [cash, card], transactions: [transaction({ account: '카드' })], recurring });
  assert.deepEqual(removeAccount(data, '현금'), [card]);
  assert.deepEqual(data.accounts, [cash, card]);
  assert.throws(() => removeAccount(data, '미등록'), {
    constructor: DataError, message: '없는 계좌입니다: 미등록',
  });
  assert.throws(() => removeAccount(data, '카드'), {
    constructor: DataError, message: '1건의 거래가 쓰는 계좌입니다: 카드',
  });
  assert.throws(() => removeAccount({ ...data, transactions: [] }, '카드'), {
    constructor: DataError, message: '2개 반복 규칙이 쓰는 계좌입니다: 카드',
  });
  assert.throws(() => removeAccount({ ...data, accounts: [card], transactions: [] }, '카드'), {
    constructor: DataError, message: '2개 반복 규칙이 쓰는 계좌입니다: 카드',
  });
  assert.throws(() => removeAccount(currentData(), '현금'), {
    constructor: DataError, message: '마지막 남은 계좌는 지울 수 없습니다: 현금',
  });
});

test('계좌별 잔액에서 보내는 이체를 빼고 받는 이체를 더한다', () => {
  const data = currentData({
    accounts: [cash, card],
    transactions: [
      transaction({ account: '카드', amount: 3000 }),
      transaction({ type: 'transfer', amount: 7000, category: '', toAccount: '카드' }),
    ],
  });
  assert.deepEqual(accountBalances(data, '2026-02-10'), {
    date: '2026-02-10',
    accounts: [{ ...cash, balance: -7000 }, { ...card, balance: -46000 }],
    total: -53000,
  });
  assert.deepEqual(data.accounts, [cash, card]);
});
