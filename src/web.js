import { formatBalanceDate, formatBudgetOverage, formatPercent, formatTag, formatWon, formatYearMonth, NO_TRANSACTIONS } from './format.js';
import { shiftMonth } from './input.js';
import { categoryText } from './transaction.js';
import { EXPENSE, INCOME, TYPE_LABELS } from './types.js';

const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function page(title, content) {
  const escapedTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 64rem; margin: 1rem auto; padding: 0 1rem; }
  nav a { margin-inline-end: 1rem; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #ccc; text-align: start; }
  th, .number { white-space: nowrap; }
  .number { text-align: end; }
  .over { color: #b00020; font-weight: bold; }
</style>
</head>
<body>
<main>
<h1>${escapedTitle}</h1>
${content}
</main>
</body>
</html>`;
}

function table(headings, rows, footer = '') {
  return `<div class="table-wrap">
<table>
<thead><tr>${headings.map((heading) => `<th scope="col">${heading}</th>`).join('')}</tr></thead>
<tbody>${rows.join('\n')}</tbody>
${footer}
</table>
</div>`;
}

const empty = `<p>${NO_TRANSACTIONS}</p>`;

function expenseTable({ expense, expenseByCategory }) {
  if (expenseByCategory.length === 0) {
    return empty;
  }
  const rows = expenseByCategory.map(({ category, amount, budget, over }) => `
<tr${over > 0 ? ' class="over"' : ''}>
  <td>${escapeHtml(category)}</td>
  <td class="number">${formatWon(amount)}</td>
  <td class="number">${formatPercent(amount, expense)}</td>
  <td class="number">${budget === null ? '' : formatWon(budget)}</td>
  <td class="number">${budget === null ? '' : formatPercent(amount, budget)}</td>
  <td class="number">${over > 0 ? formatBudgetOverage(over) : ''}</td>
</tr>`);
  return table(['분류', '금액', '비율', '예산', '사용률', '초과'], rows);
}

function transactionTable(transactions) {
  if (transactions.length === 0) {
    return empty;
  }
  const rows = transactions.map((transaction) => {
    const { date, type, amount, account, memo, tags } = transaction;
    return `
<tr>
  <td>${escapeHtml(date)}</td>
  <td>${TYPE_LABELS[type]}</td>
  <td class="number">${formatWon(amount)}</td>
  <td>${escapeHtml(categoryText(transaction))}</td>
  <td>${escapeHtml(account)}</td>
  <td>${escapeHtml(memo)}</td>
  <td>${escapeHtml(tags.map(formatTag).join(' '))}</td>
</tr>`;
  });
  return table(['날짜', '구분', '금액', '분류', '계좌', '메모', '태그'], rows);
}

function balanceTable({ accounts, total }) {
  const rows = accounts.map(({ name, balance }) => `
<tr><td>${escapeHtml(name)}</td><td class="number">${formatWon(balance)}</td></tr>`);
  const footer = `<tfoot><tr><th scope="row">합계</th><td class="number">${formatWon(total)}</td></tr></tfoot>`;
  return table(['계좌', '잔액'], rows, footer);
}

export function renderReportPage({ summary, transactions, balances }) {
  const { month, income, expense, net } = summary;
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return page(`${formatYearMonth(month)} 가계부`, `<nav aria-label="월 이동">
<a href="/?month=${previous}">이전 달</a>
<a href="/?month=${next}">다음 달</a>
</nav>
<dl>
  <dt>${TYPE_LABELS[INCOME]}</dt><dd>${formatWon(income)}</dd>
  <dt>${TYPE_LABELS[EXPENSE]}</dt><dd>${formatWon(expense)}</dd>
  <dt>차액</dt><dd>${formatWon(net)}</dd>
</dl>
<section>
<h2>지출 분류별</h2>
${expenseTable(summary)}
</section>
<section>
<h2>거래</h2>
${transactionTable(transactions)}
</section>
<section>
<h2>계좌별 잔액</h2>
<p>${escapeHtml(formatBalanceDate(balances.date))}</p>
${balanceTable(balances)}
</section>`);
}

export function renderErrorPage(status, message) {
  return page(`${status} 오류`, `<p>${escapeHtml(message)}</p>
<p><a href="/">이번 달 보고서</a></p>`);
}
