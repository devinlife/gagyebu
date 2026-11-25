import pkg from '../package.json' with { type: 'json' };

const commands = {
  help: await import('./commands/help.js'),
};

export function run(argv) {
  const [name, ...args] = argv;
  if (name === '--version') {
    console.log(pkg.version);
    return 0;
  }

  const command = name === undefined || name === '--help' ? 'help' : name;
  if (!Object.hasOwn(commands, command)) {
    console.error(`오류: 알 수 없는 명령 ${command}`);
    console.error('사용법은 gagyebu help를 보세요.');
    return 2;
  }

  return commands[command].run(args, { commands });
}
