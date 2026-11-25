import { DataError } from '../errors.js';
import { withParticle } from '../format.js';
import { parsePort } from '../input.js';
import { parseCommand } from '../options.js';
import { createServer } from '../server.js';
import { validateDataOption } from '../store.js';

export const name = 'serve';
export const order = 110;
export const summary = 'JSON API와 보고서 화면 웹 서버를 띄웁니다.';

const USAGE = '사용법: gagyebu serve [--port <번호>] [--data <경로>]';
const DEFAULT_PORT = 4780;
const HOST = '127.0.0.1';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['port'],
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { options } = parsed;
  const port = options.port === undefined ? DEFAULT_PORT : parsePort(options.port, USAGE);
  validateDataOption(options, USAGE);

  const server = createServer(options);
  function stop() {
    server.close();
    server.closeAllConnections();
  }

  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        reject(new DataError(`포트 ${withParticle(String(port), '을/를')} 쓸 수 없습니다`));
      } else {
        reject(error);
      }
    });
    server.once('close', () => resolve(0));
    server.once('listening', () => {
      console.log(`http://${HOST}:${server.address().port} 에서 듣고 있습니다 (Ctrl+C로 끝냅니다)`);
    });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    server.listen(port, HOST);
  }).finally(() => {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  });
}
