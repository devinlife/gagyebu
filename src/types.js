export const EXPENSE = 'expense';
export const INCOME = 'income';
export const TYPES = [EXPENSE, INCOME];
export const RECORD_TYPES = [...TYPES, 'transfer'];
export const TYPE_LABELS = { [EXPENSE]: '지출', [INCOME]: '수입', transfer: '이체' };
