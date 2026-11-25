import { UsageError } from '../errors.js';
import { showTransactions } from '../listing.js';

export const name = 'search';
export const order = 40;
export const summary = '글이나 태그로 거래를 찾습니다.';

const USAGE = '사용법: gagyebu search <글> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--tag <태그>] [--json] [--data <경로>]';

export function run(argv) {
  return showTransactions(argv, USAGE, (args) => {
    if (args.length === 0) {
      throw new UsageError('검색할 글이 없습니다', USAGE);
    }
    if (args.length > 1) {
      throw new UsageError(`예상하지 않은 인자 ${args[1]}`, USAGE);
    }

    const query = args[0];
    if (!query.trim()) {
      throw new UsageError('검색할 글이 비었습니다', USAGE);
    }

    return query;
  });
}
