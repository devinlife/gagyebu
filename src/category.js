export function findCategoryIndex(categories, type, name) {
  if (type !== 'expense' && type !== 'income') {
    return -1;
  }
  return categories[type].indexOf(name);
}
