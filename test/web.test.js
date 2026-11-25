import assert from 'node:assert/strict';
import { test } from 'node:test';
import { today } from '../src/input.js';

import { escapeHtml, renderErrorPage, renderReportPage } from '../src/web.js';

test('HTML에서 특별한 다섯 글자를 이스케이프한다', () => {
  assert.equal(escapeHtml("<a href=\"x\">&'</a>"), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml('점심 식비'), '점심 식비');
});

test('보고서에 예산 초과 금액과 스타일을 표시한다', () => {
  const html = renderReportPage({
    summary: {
      month: '2026-02', income: 0, expense: 2000, net: -2000,
      expenseByCategory: [{ category: '식비', amount: 2000, budget: 1500, over: 500 }],
    },
    transactions: [],
    balances: { date: '2026-02-28', accounts: [], total: 0 },
  });

  assert.match(html, /<tr class="over">[\s\S]*?초과 500원[\s\S]*?<\/tr>/);
  assert.match(html, /\.over\s*\{\s*color:/);
  assert.doesNotMatch(html, /<script/i);
});

test('빈 달은 분류와 거래 대신 빈 상태를 표시하고 계좌 표는 유지한다', () => {
  const html = renderReportPage({
    summary: { month: '2026-02', income: 0, expense: 0, net: 0, expenseByCategory: [] },
    transactions: [],
    balances: { date: '2026-02-28', accounts: [{ name: '현금', balance: 0 }], total: 0 },
  });

  assert.equal(html.match(/<p>거래가 없습니다\.<\/p>/g)?.length, 2);
  assert.equal(html.match(/<table>/g)?.length, 1);
  assert.match(html, /<td>현금<\/td>/);
  assert.doesNotMatch(html, /<script/i);
});

test('오류 화면은 메시지를 이스케이프하고 보고서로 돌아가는 링크를 표시한다', () => {
  const html = renderErrorPage(400, '잘못된 입력 <>&');

  assert.match(html, /<h1>400 오류<\/h1>/);
  assert.match(html, /잘못된 입력 &lt;&gt;&amp;/);
  assert.match(html, /<a href="\/">이번 달 보고서<\/a>/);
});

test('보고서 요약 위에 이름표, 날짜 기본값과 등록된 선택지가 있는 폼을 그린다', () => {
  const html = reportWithForm();
  assert.match(html, /<form method="post" action="\/transactions">[\s\S]*?<\/form>[\s\S]*?<dl>/);
  for (const name of ['amount', 'type', 'category', 'date', 'account', 'memo', 'tags']) {
    assert.ok(html.includes(`<label for="add-${name}">`), name);
    assert.ok(html.includes(`id="add-${name}" name="${name}"`), name);
  }
  assert.ok(html.includes(`name="date" type="date" value="${today()}"`));
  assert.match(html, /name="csrf" value="토큰"/);
  assert.match(html, /name="month" value="2026-02"/);
  assert.match(html, /<optgroup label="지출"><option value="기타" selected>기타<\/option>/);
  assert.match(html, /<optgroup label="수입"><option value="기타">기타<\/option><option value="급여">급여<\/option>/);
  assert.match(html, /<option value="현금" selected>현금<\/option>/);
});

test('폼에 입력값을 남기고 오류가 난 칸을 오류 문구에 연결한다', () => {
  const html = reportWithForm({
    values: { type: 'income', category: '기타', account: '<"카드">', memo: '<script>"</script>' },
    error: { field: 'amount', message: '<금액>' },
  }, '<추가>');
  assert.match(html, /<p role="status">&lt;추가&gt;<\/p>/);
  assert.match(html, /<p id="form-error" role="alert">&lt;금액&gt;<\/p>\s*<form/);
  assert.match(html, /name="amount" aria-describedby="form-error" aria-invalid="true"/);
  assert.equal(html.match(/aria-describedby="form-error"/g)?.length, 1);
  assert.match(html, /<option value="income" selected>수입<\/option>/);
  assert.match(html, /<optgroup label="수입"><option value="기타" selected>/);
  assert.match(html, /<option value="&lt;&quot;카드&quot;&gt;" selected>&lt;&quot;카드&quot;&gt;<\/option>/);
  assert.match(html, /value="&lt;script&gt;&quot;&lt;\/script&gt;"/);
  assert.doesNotMatch(html, /<script/i);
});

function reportWithForm(overrides, notice) {
  return renderReportPage({
    summary: { month: '2026-02', income: 0, expense: 0, net: 0, expenseByCategory: [] },
    transactions: [],
    balances: { date: '2026-02-28', accounts: [], total: 0 },
    form: {
      token: '토큰',
      month: '2026-02',
      categories: { expense: ['기타', '<식비>'], income: ['기타', '급여'] },
      accounts: ['현금', '<"카드">'],
      ...overrides,
    },
    notice,
  });
}
