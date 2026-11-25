import { UsageError, unexpectedArgument } from '../errors.js';
import { parseListingArgs, printTransactions } from '../listing.js';
import { loadData } from '../store.js';
import { filterTransactions } from '../transaction.js';

export const name = 'search';
export const order = 40;
export const summary = '글이나 태그로 거래를 찾습니다.';

const USAGE = '사용법: gagyebu search <글> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--account <계좌>] [--tag <태그>] [--json] [--data <경로>]';

export function run(argv) {
  const { options, filters } = parseListingArgs(argv, USAGE, (args) => {
    if (args.length === 0) {
      throw new UsageError('검색할 글이 없습니다', USAGE);
    }
    if (args.length > 1) {
      throw unexpectedArgument(args[1], USAGE);
    }

    const query = args[0];
    if (!query.trim()) {
      throw new UsageError('검색할 글이 비었습니다', USAGE);
    }

    return query;
  });
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const { data } = loadData(options, USAGE);
  printTransactions(filterTransactions(data.transactions, filters), options);
  return 0;
}
