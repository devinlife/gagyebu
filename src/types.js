export const EXPENSE = 'expense';
export const INCOME = 'income';
export const TRANSFER = 'transfer';
export const TYPES = [EXPENSE, INCOME];
export const RECORD_TYPES = [...TYPES, TRANSFER];
export const TYPE_LABELS = { [EXPENSE]: '지출', [INCOME]: '수입', [TRANSFER]: '이체' };
