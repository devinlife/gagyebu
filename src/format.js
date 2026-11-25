export function formatWon(amount) {
  return `${amount.toLocaleString('en-US')}원`;
}

export function formatMonthName(month) {
  return `${Number(month.slice(5))}월`;
}

export function formatPercent(amount, total) {
  return `${(Math.round(amount * 1000 / total) / 10).toFixed(1)}%`;
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
