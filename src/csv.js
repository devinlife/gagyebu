import { DataError } from './errors.js';

const HEADER = 'id,date,type,amount,category,account,memo,tags';
const formulaText = /^'*[=+\-@]/;
const requiredColumns = ['date', 'amount', 'type'];
const textColumns = ['category', 'account', 'memo'];

function protectText(value) {
  const text = String(value ?? '');
  return formulaText.test(text) ? `'${text}` : text;
}

export function unprotectText(text) {
  return text.startsWith("'") && formulaText.test(text) ? text.slice(1) : text;
}

function escapeCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(transactions) {
  const rows = transactions.map(({ id, date, type, amount, category, account, memo, tags }) => {
    const tagText = Array.isArray(tags) ? tags.map(protectText).join(';') : '';
    const cells = [
      String(id), date ?? '', type ?? '', String(amount),
      protectText(category), protectText(account), protectText(memo), tagText,
    ];
    return cells.map(escapeCell).join(',');
  });
  return [HEADER, ...rows, ''].join('\r\n');
}

export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '');
  const records = [];
  let line = 1;
  let startLine = 1;
  let cells = [];
  let cell = '';
  let quoted = false;
  let closed = false;

  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === undefined) {
        throw new DataError(`CSV 형식이 잘못되었습니다: ${startLine}행: 따옴표가 닫히지 않았습니다`);
      }
      if (char === '"') {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === '\n') {
          line += 1;
        }
      }
    } else if (char === undefined || char === '\n' || (char === '\r' && next === '\n')) {
      if (cells.length > 0 || cell !== '' || closed) {
        records.push({ line: startLine, cells: [...cells, cell] });
      }
      if (char === '\r') {
        index += 1;
      }
      line += 1;
      startLine = line;
      cells = [];
      cell = '';
      closed = false;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
      closed = false;
    } else if (closed) {
      throw new DataError(`CSV 형식이 잘못되었습니다: ${startLine}행: 닫는 따옴표 뒤에 쉼표나 줄 끝이 필요합니다`);
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === '"' || char === '\r') {
      throw new DataError(`CSV 형식이 잘못되었습니다: ${startLine}행: 따옴표로 감싸지 않은 칸에 따옴표나 줄바꿈이 있습니다`);
    } else {
      cell += char;
    }
  }
  return records;
}

export function readCsvRows(records) {
  const [header, ...rows] = records;
  const columns = header?.cells.map((name) => name.trim()) ?? [];
  const missing = requiredColumns.filter((name) => !columns.includes(name));
  if (missing.length > 0) {
    throw new DataError(`필요한 칸이 없습니다: ${missing.join(', ')}`);
  }

  const indexes = new Map([...requiredColumns, ...textColumns, 'tags']
    .map((name) => [name, columns.indexOf(name)]));
  return rows.map(({ line, cells }) => {
    if (cells.length !== columns.length) {
      return { line, error: `칸 수가 머리 줄과 다릅니다(${cells.length}개, 머리 줄 ${columns.length}개)` };
    }
    const fields = {};
    for (const name of requiredColumns) {
      fields[name] = cells[indexes.get(name)];
    }
    for (const name of textColumns) {
      const index = indexes.get(name);
      if (index !== -1) {
        fields[name] = unprotectText(cells[index]);
      }
    }
    const tags = cells[indexes.get('tags')];
    fields.tags = tags ? tags.split(';').map(unprotectText) : [];
    return { line, fields };
  });
}
