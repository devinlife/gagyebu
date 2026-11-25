import { UsageError, unexpectedArgument } from './errors.js';
import { withParticle } from './format.js';

export function parseOptions(argv, { values = [], flags = [], repeatable = [] }) {
  const args = [];
  const options = new Map();
  let error = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args.push(token);
      continue;
    }

    const equals = token.indexOf('=');
    const name = equals === -1 ? token.slice(2) : token.slice(2, equals);
    if (values.includes(name)) {
      let value = token.slice(equals + 1);
      if (equals === -1) {
        value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
          error = `--${name} 값이 없습니다`;
          break;
        }
        index += 1;
      }
      if (repeatable.includes(name)) {
        const collected = options.get(name) ?? [];
        collected.push(value);
        options.set(name, collected);
      } else {
        options.set(name, value);
      }
    } else if (flags.includes(name)) {
      if (equals !== -1) {
        error = `${withParticle(`--${name}`, '은/는')} 값을 받지 않습니다`;
        break;
      }
      options.set(name, true);
    } else {
      error = `알 수 없는 옵션입니다: --${name}`;
      break;
    }
  }

  return { args, options: Object.fromEntries(options), error };
}

export function parseCommand(argv, { values = [], flags = [], repeatable = [], positional = false }, usage) {
  const { args, options, error } = parseOptions(argv, {
    values: ['data', ...values],
    flags: ['help', ...flags],
    repeatable,
  });
  if (error) {
    throw new UsageError(error, usage);
  }
  if (options.help) {
    return { help: usage };
  }
  if (!positional && args.length > 0) {
    throw unexpectedArgument(args[0], usage);
  }
  return { args, options };
}

export function validateListJson(options, usage) {
  if (options.json && !options.list) {
    throw new UsageError('--json은 --list와 함께 써야 합니다', usage);
  }
}

export function parseSubcommand(argv, {
  label, usage, usages, values = {}, flags = {}, repeatable = {},
}) {
  const [command, ...operands] = argv;
  if (command === '--help') {
    const parsed = parseOptions(operands, {});
    if (parsed.error) {
      throw new UsageError(parsed.error, usage);
    }
    if (parsed.args.length > 0) {
      throw unexpectedArgument(parsed.args[0], usage);
    }
    return { help: Object.values(usages).join('\n') };
  }
  if (command === undefined) {
    throw new UsageError(`${label} 하위 명령이 없습니다`, usage);
  }
  if (!Object.hasOwn(usages, command)) {
    throw new UsageError(`알 수 없는 ${label} 하위 명령입니다: ${command}`, usage);
  }

  const commandUsage = usages[command];
  const parsed = parseCommand(operands, {
    values: values[command],
    flags: [...(command === 'list' ? ['json'] : []), ...(flags[command] ?? [])],
    repeatable: repeatable[command],
    positional: true,
  }, commandUsage);
  if (parsed.help) {
    return parsed;
  }
  return { command, usage: commandUsage, ...parsed };
}
