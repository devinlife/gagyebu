import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { accountBalances } from './account.js';
import { DataError, UsageError } from './errors.js';
import { currentMonth, currentYear, monthEnd, parseId, parseMonth, parseYear } from './input.js';
import { parseListingFilters } from './listing.js';
import { summarizeMonth, summarizeYear } from './report.js';
import { describeCommand, loadData, writeData } from './store.js';
import { appendTransaction, buildTransaction, describeAddedTransaction, filterTransactions, parseTransactionFields } from './transaction.js';
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

function parseReportMonth(month) {
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
    const month = parseReportMonth(query.month);
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
    const { month } = queryOptions(params, ['month']);
    const parsedMonth = parseReportMonth(month);
    const { data: { transactions, budgets } } = loadData(options);
    return summarizeMonth(transactions, budgets, parsedMonth);
  }],
  ['/api/report', (params, { options }) => {
    const { year } = queryOptions(params, ['year']);
    const parsedYear = parseYear(year ?? currentYear());
    const { data: { transactions } } = loadData(options);
    return summarizeYear(transactions, parsedYear);
  }],
]);

const transactionsPath = '/transactions';
const MAX_FORM_BYTES = 10 * 1024;
const formFields = ['amount', 'type', 'category', 'date', 'account', 'memo', 'tags', 'csrf', 'month'];

async function readFormBody(request) {
  if (Number(request.headers['content-length']) > MAX_FORM_BYTES) {
    return null;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_FORM_BYTES) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function postTransaction(request, { options, token, port }, send, sendError) {
  const { origin } = request.headers;
  if (origin !== undefined && origin !== `http://127.0.0.1:${port}`) {
    return sendError(403, `요청 출처가 이 서버가 아닙니다: ${origin}`);
  }
  const body = await readFormBody(request);
  if (body === null) {
    return sendError(413, '폼 본문은 10KB를 넘을 수 없습니다', { connection: 'close' });
  }
  const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/x-www-form-urlencoded') {
    return sendError(415, '폼 본문 형식은 application/x-www-form-urlencoded여야 합니다');
  }
  const params = new URLSearchParams(body);
  const { csrf, month: reportMonth, tags, ...raw } = queryOptions(params, formFields);
  if (csrf !== token) {
    return sendError(403, '폼 토큰이 맞지 않습니다');
  }
  const month = parseReportMonth(reportMonth);

  let loaded;
  let transaction;
  try {
    const fields = parseTransactionFields({ ...raw, tags: tags === undefined ? [] : [tags] });
    loaded = loadData(options);
    transaction = buildTransaction(loaded.data, fields, loaded.filePath);
  } catch (error) {
    if (!(error instanceof UsageError || error instanceof DataError) || error.field === undefined) {
      throw error;
    }
    const { data } = loaded ?? loadData(options);
    return send(400, reportPage(month, data, {
      token, values: Object.fromEntries(params), error: { message: error.message, field: error.field },
    }));
  }

  const { filePath, data } = loaded;
  const { id, date, amount, type, category, account, memo, tags: parsedTags } = transaction;
  const command = describeCommand([
    'web', 'add', String(amount), '--type', type, '--category', category, '--account', account, '--date', date,
    ...(memo ? ['--memo', memo] : []),
    ...(parsedTags.length ? ['--tag', parsedTags.join(',')] : []),
  ]);
  appendTransaction(data, transaction);
  writeData(filePath, data, command);
  send(303, '', { location: `/?month=${date.slice(0, 7)}&added=${id}` });
}

export function createServer(options) {
  const token = randomBytes(32).toString('hex');
  const server = createHttpServer((request, response) => {
    const queryStart = request.url.indexOf('?');
    const pathname = queryStart === -1 ? request.url : request.url.slice(0, queryStart);
    const html = pathname === reportPath || pathname === transactionsPath;
    const contentType = html ? 'text/html' : 'application/json';

    function send(status, value, headers) {
      const body = html ? value : JSON.stringify(value);
      response.writeHead(status, { 'content-type': `${contentType}; charset=utf-8`, ...headers });
      response.end(body);
    }

    function sendError(status, message, headers) {
      send(status, html ? renderErrorPage(status, message) : { error: message }, headers);
    }

    function handleError(error) {
      if (response.destroyed) {
        return;
      }
      if (error instanceof UsageError) {
        sendError(400, error.message);
      } else if (error instanceof DataError) {
        sendError(500, error.message);
      } else {
        console.error(error);
        sendError(500, '서버 내부 오류입니다');
      }
    }

    try {
      if (pathname === transactionsPath) {
        if (request.method !== 'POST') {
          sendError(405, `POST만 받습니다: ${request.method}`, { allow: 'POST' });
        } else {
          const { port } = server.address();
          postTransaction(request, { options, token, port }, send, sendError).catch(handleError);
        }
        return;
      }
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
      handleError(error);
    }
  });
  return server;
}
