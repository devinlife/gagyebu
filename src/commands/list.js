import { UsageError } from '../errors.js';
import { showTransactions } from '../listing.js';

export const summary = '거래 목록을 보여 줍니다.';

const USAGE = '사용법: gagyebu list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--tag <태그>] [--json] [--data <경로>]';

export function run(argv) {
  return showTransactions(argv, USAGE, (args) => {
    if (args.length > 0) {
      throw new UsageError(`예상하지 않은 인자 ${args[0]}`, USAGE);
    }
  });
}
