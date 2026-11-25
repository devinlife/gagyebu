const HEADER = 'id,date,type,amount,category,account,memo,tags';

function protectText(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
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
