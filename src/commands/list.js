import { UsageError, unexpectedArgument } from '../errors.js';
import { parseListingArgs, printTransactions } from '../listing.js';
import { loadData } from '../store.js';
import { filterTransactions } from '../transaction.js';

export const name = 'list';
export const order = 30;
export const summary = '거래 목록을 보여 줍니다.';

const USAGE = '사용법: gagyebu list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--account <계좌>] [--tag <태그>] [--json] [--data <경로>]';

export function run(argv) {
  const { options, filters } = parseListingArgs(argv, USAGE, (args) => {
    if (args.length > 0) {
      throw unexpectedArgument(args[0], USAGE);
    }
  });
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const { data } = loadData(options, USAGE);
  printTransactions(filterTransactions(data.transactions, filters), options);
  return 0;
}
