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
        error = `--${name}은 값을 받지 않습니다`;
        break;
      }
      options.set(name, true);
    } else {
      error = `알 수 없는 옵션 --${name}`;
      break;
    }
  }

  return { args, options: Object.fromEntries(options), error };
}
