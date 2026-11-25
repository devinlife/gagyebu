import pkg from '../package.json' with { type: 'json' };
import { DataError, UsageError, unexpectedArgument } from './errors.js';
import { parseOptions } from './options.js';
import { commands } from './registry.js';

export function reportError(error) {
  if (error instanceof UsageError || error instanceof DataError) {
    const message = error.message.replaceAll('\r', '\\r').replaceAll('\n', '\\n');
    console.error(`오류: ${message}`);
    if (error instanceof UsageError) {
      console.error(error.usage);
      return 2;
    }
    return 1;
  }

  console.error(error);
  return 1;
}

export async function run(argv) {
  try {
    const [name, ...args] = argv;
    if (name === '--version') {
      const { args: operands, error } = parseOptions(args, {});
      if (error || operands.length) {
        const usage = '사용법: gagyebu --version';
        throw error ? new UsageError(error, usage) : unexpectedArgument(operands[0], usage);
      }

      console.log(pkg.version);
      return 0;
    }

    const command = name === undefined || name === '--help' ? 'help' : name;
    if (!Object.hasOwn(commands, command)) {
      throw new UsageError(`알 수 없는 명령입니다: ${command}`, '사용법은 gagyebu help를 보세요.');
    }

    return await commands[command].run(args, { commands });
  } catch (error) {
    return reportError(error);
  }
}
