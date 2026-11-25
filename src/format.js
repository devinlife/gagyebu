export const NO_TRANSACTIONS = '거래가 없습니다.';

export function formatLocalDateTime(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function formatWon(amount) {
  return `${amount.toLocaleString('en-US')}원`;
}

export function formatMonthName(month) {
  return `${Number(month.slice(5))}월`;
}

export function formatYearMonth(month) {
  return `${month.slice(0, 4)}년 ${formatMonthName(month)}`;
}

export function formatBudgetOverage(amount) {
  return `초과 ${formatWon(amount)}`;
}

export function formatBalanceDate(date) {
  return `${date} 기준`;
}

export function formatTag(tag) {
  return `#${tag}`;
}

export function formatPercent(amount, total) {
  return `${(Math.round(amount * 1000 / total) / 10).toFixed(1)}%`;
}

const partialBlocks = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

export function renderBars(values, width) {
  const max = values.reduce((largest, value) => Math.max(largest, value), 0);
  return values.map((value) => {
    if (value === 0) {
      return '';
    }
    const eighths = Math.max(1, Math.round(value * width * 8 / max));
    return '█'.repeat(Math.floor(eighths / 8)) + partialBlocks[eighths % 8];
  });
}

export function withParticle(word, pair) {
  const last = word.slice(-1).toLowerCase();
  const code = last.charCodeAt(0);
  const [withFinal, withoutFinal] = pair.split('/');
  let hasFinal;
  let hasRieul;

  if (code >= 0xAC00 && code <= 0xD7A3) {
    const final = (code - 0xAC00) % 28;
    hasFinal = final !== 0;
    hasRieul = final === 8;
  } else {
    // ponytail: 영문 끝 철자로 짐작하므로 out(아웃), type(타입)에는 맞지 않습니다.
    hasRieul = /[l178]/.test(last);
    hasFinal = hasRieul || /[mn036]/.test(last) || /ng$/i.test(word);
  }

  return word + (hasFinal && !(pair === '으로/로' && hasRieul) ? withFinal : withoutFinal);
}

const wideCharacter = /[\u1100-\u115F\u2E80-\u303E\u3040-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;

export function displayWidth(text) {
  let width = 0;
  for (const character of text) {
    width += wideCharacter.test(character) ? 2 : 1;
  }
  return width;
}

export function formatTable(rows, { right = [] } = {}) {
  const cellWidths = rows.map((row) => row.map(displayWidth));
  const columnWidths = (rows[0] ?? []).map(() => 0);
  for (const rowWidths of cellWidths) {
    for (const [column, width] of rowWidths.entries()) {
      columnWidths[column] = Math.max(columnWidths[column], width);
    }
  }

  return rows.map((row, index) => row.map((cell, column) => {
    const padding = ' '.repeat(columnWidths[column] - cellWidths[index][column]);
    return right.includes(column) ? padding + cell : cell + padding;
  }).join('  ').trimEnd()).join('\n');
}
