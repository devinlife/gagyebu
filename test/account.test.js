import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAccount, listAccounts, removeAccount, requireAccount } from '../src/account.js';
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
  const data = currentData({ accounts: [cash, card], transactions: [transaction({ account: '카드' })] });
  assert.deepEqual(removeAccount(data, '현금'), [card]);
  assert.deepEqual(data.accounts, [cash, card]);
  assert.throws(() => removeAccount(data, '미등록'), {
    constructor: DataError, message: '없는 계좌입니다: 미등록',
  });
  assert.throws(() => removeAccount(data, '카드'), {
    constructor: DataError, message: '1건의 거래가 쓰는 계좌입니다: 카드',
  });
  assert.throws(() => removeAccount(currentData(), '현금'), {
    constructor: DataError, message: '마지막 남은 계좌는 지울 수 없습니다: 현금',
  });
});
