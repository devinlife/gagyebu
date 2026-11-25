export function parseOptions(argv, { values = [], flags = [] }) {
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
      if (equals !== -1) {
        options.set(name, token.slice(equals + 1));
        continue;
      }
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        error = `--${name} 값이 없다`;
        break;
      }
      options.set(name, value);
      index += 1;
    } else if (flags.includes(name)) {
      if (equals !== -1) {
        error = `--${name}은 값을 받지 않는다`;
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
