import pkg from '../package.json' with { type: 'json' };
import { DataError, UsageError } from './errors.js';
import { parseOptions } from './options.js';

const commands = {
  help: await import('./commands/help.js'),
  add: await import('./commands/add.js'),
  list: await import('./commands/list.js'),
  search: await import('./commands/search.js'),
  edit: await import('./commands/edit.js'),
  rm: await import('./commands/rm.js'),
  category: await import('./commands/category.js'),
  summary: await import('./commands/summary.js'),
  budget: await import('./commands/budget.js'),
};

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
        throw new UsageError(
          error ?? `예상하지 않은 인자 ${operands[0]}`,
          '사용법: gagyebu --version',
        );
      }

      console.log(pkg.version);
      return 0;
    }

    const command = name === undefined || name === '--help' ? 'help' : name;
    if (!Object.hasOwn(commands, command)) {
      throw new UsageError(`알 수 없는 명령 ${command}`, '사용법은 gagyebu help를 보세요.');
    }

    return await commands[command].run(args, { commands });
  } catch (error) {
    return reportError(error);
  }
}
