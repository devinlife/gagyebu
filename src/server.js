import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { accountBalances } from './account.js';
import { DataError, UsageError } from './errors.js';
import { currentMonth, currentYear, monthEnd, parseId, parseMonth, parseYear } from './input.js';
import { parseListingFilters } from './listing.js';
import { summarizeMonth, summarizeYear } from './report.js';
import { loadData } from './store.js';
import { describeAddedTransaction, filterTransactions } from './transaction.js';
import { renderErrorPage, renderReportPage } from './web.js';

function queryOptions(params, names) {
  const options = new Map();
  for (const [name, value] of params) {
    if (!names.includes(name)) {
      throw new UsageError(`알 수 없는 매개변수입니다: ${name}`);
    }
    if (name === 'tag') {
      if (value !== '') {
        const tags = options.get(name) ?? [];
        tags.push(value);
        options.set(name, tags);
      }
    } else {
      options.set(name, value === '' ? undefined : value);
    }
  }
  return Object.fromEntries(options);
}

function queryMonth(params) {
  const { month } = queryOptions(params, ['month']);
  return parseMonth(month ?? currentMonth());
}

function reportPage(month, data, { token, values, error, notice }) {
  const end = monthEnd(month);
  return renderReportPage({
    summary: summarizeMonth(data.transactions, data.budgets, month),
    transactions: filterTransactions(data.transactions, { from: `${month}-01`, to: end }),
    balances: accountBalances(data, end),
    form: { token, month, categories: data.categories, accounts: data.accounts.map(({ name }) => name), values, error },
    notice,
  });
}

const reportPath = '/';
const routes = new Map([
  [reportPath, (params, { options, token }) => {
    const query = queryOptions(params, ['month', 'added']);
    const month = parseMonth(query.month ?? currentMonth());
    const id = query.added === undefined ? undefined : parseId(query.added);
    const { data } = loadData(options);
    const added = id === undefined ? undefined : data.transactions.find((transaction) => transaction.id === id);
    return reportPage(month, data, { token, notice: added && describeAddedTransaction(added) });
  }],
  ['/api/transactions', (params, { options }) => {
    const filters = parseListingFilters(queryOptions(params, ['from', 'to', 'type', 'category', 'account', 'tag']));
    const { data: { transactions } } = loadData(options);
    return filterTransactions(transactions, filters);
  }],
  ['/api/summary', (params, { options }) => {
    const month = queryMonth(params);
    const { data: { transactions, budgets } } = loadData(options);
    return summarizeMonth(transactions, budgets, month);
  }],
  ['/api/report', (params, { options }) => {
    const { year } = queryOptions(params, ['year']);
    const parsedYear = parseYear(year ?? currentYear());
    const { data: { transactions } } = loadData(options);
    return summarizeYear(transactions, parsedYear);
  }],
]);

export function createServer(options) {
  const token = randomBytes(32).toString('hex');
  return createHttpServer((request, response) => {
    const queryStart = request.url.indexOf('?');
    const pathname = queryStart === -1 ? request.url : request.url.slice(0, queryStart);
    const html = pathname === reportPath;
    const contentType = html ? 'text/html' : 'application/json';

    function send(status, value, headers) {
      const body = html ? value : JSON.stringify(value);
      response.writeHead(status, { 'content-type': `${contentType}; charset=utf-8`, ...headers });
      response.end(body);
    }

    function sendError(status, message, headers) {
      send(status, html ? renderErrorPage(status, message) : { error: message }, headers);
    }

    try {
      const route = routes.get(pathname);
      if (!route) {
        sendError(404, `없는 경로입니다: ${pathname}`);
      } else if (request.method !== 'GET') {
        sendError(405, `GET만 받습니다: ${request.method}`, { allow: 'GET' });
      } else {
        const query = queryStart === -1 ? '' : request.url.slice(queryStart);
        send(200, route(new URLSearchParams(query), { options, token }));
      }
    } catch (error) {
      if (error instanceof UsageError) {
        sendError(400, error.message);
      } else if (error instanceof DataError) {
        sendError(500, error.message);
      } else {
        console.error(error);
        sendError(500, '서버 내부 오류입니다');
      }
    }
  });
}
