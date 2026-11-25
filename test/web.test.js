import assert from 'node:assert/strict';
import { test } from 'node:test';
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
