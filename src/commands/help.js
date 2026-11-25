import { UsageError, unexpectedArgument } from '../errors.js';
import { parseOptions } from '../options.js';

export const name = 'help';
export const order = 10;
export const summary = '사용법과 명령 목록을 보여 줍니다.';

export function run(argv, { commands }) {
  const { args, error } = parseOptions(argv, { flags: ['help'] });
  if (error || args.length) {
    const usage = '사용법: gagyebu help';
    throw error ? new UsageError(error, usage) : unexpectedArgument(args[0], usage);
  }

  const names = Object.keys(commands);
  const width = Math.max(...names.map((name) => name.length));

  console.log('사용법: gagyebu <명령> [인자] [--옵션 값]');
  console.log('');
  for (const name of names) {
    console.log(`  ${name.padEnd(width)}  ${commands[name].summary}`);
  }

  return 0;
}
