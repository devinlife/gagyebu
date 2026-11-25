import { createServer as createHttpServer } from 'node:http';
import { DataError, UsageError } from './errors.js';
import { currentMonth, currentYear, parseMonth, parseYear } from './input.js';
import { parseListingFilters } from './listing.js';
import { summarizeMonth, summarizeYear } from './report.js';
import { loadData } from './store.js';
import { filterTransactions } from './transaction.js';

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

const routes = new Map([
  ['/api/transactions', (params, options) => {
    const filters = parseListingFilters(queryOptions(params, ['from', 'to', 'type', 'category', 'account', 'tag']));
    const { data: { transactions } } = loadData(options);
    return filterTransactions(transactions, filters);
  }],
  ['/api/summary', (params, options) => {
    const { month } = queryOptions(params, ['month']);
    const parsedMonth = parseMonth(month ?? currentMonth());
    const { data: { transactions, budgets } } = loadData(options);
    return summarizeMonth(transactions, budgets, parsedMonth);
  }],
  ['/api/report', (params, options) => {
    const { year } = queryOptions(params, ['year']);
    const parsedYear = parseYear(year ?? currentYear());
    const { data: { transactions } } = loadData(options);
    return summarizeYear(transactions, parsedYear);
  }],
]);

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(body);
}

export function createServer(options) {
  return createHttpServer((request, response) => {
    try {
      const queryStart = request.url.indexOf('?');
      const pathname = queryStart === -1 ? request.url : request.url.slice(0, queryStart);
      const route = routes.get(pathname);
      if (!route) {
        sendJson(response, 404, { error: `없는 경로입니다: ${pathname}` });
      } else if (request.method !== 'GET') {
        sendJson(response, 405, { error: `GET만 받습니다: ${request.method}` }, { allow: 'GET' });
      } else {
        const query = queryStart === -1 ? '' : request.url.slice(queryStart);
        sendJson(response, 200, route(new URLSearchParams(query), options));
      }
    } catch (error) {
      if (error instanceof UsageError) {
        sendJson(response, 400, { error: error.message });
      } else if (error instanceof DataError) {
        sendJson(response, 500, { error: error.message });
      } else {
        console.error(error);
        sendJson(response, 500, { error: '서버 내부 오류입니다' });
      }
    }
  });
}
