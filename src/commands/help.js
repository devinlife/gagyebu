export const summary = '사용법과 명령 목록을 보여 준다.';

export function run(_argv, { commands }) {
  const names = Object.keys(commands);
  const width = Math.max(...names.map((name) => name.length));

  console.log('사용법: gagyebu <명령> [인자] [--옵션 값]');
  console.log('');
  for (const name of names) {
    console.log(`  ${name.padEnd(width)}  ${commands[name].summary}`);
  }

  return 0;
}
