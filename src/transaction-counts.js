export function countTransactionsBy(transactions, field) {
  const counts = new Map();
  for (const transaction of transactions) {
    const value = transaction[field];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}
