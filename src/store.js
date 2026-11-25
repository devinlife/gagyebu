import os from 'node:os';
import path from 'node:path';

export function resolveDataPath(dataOption, env = process.env, home = os.homedir()) {
  const candidate = dataOption || env.GAGYEBU_DATA || '~/.gagyebu/data.json';
  if (candidate === '~') {
    return path.resolve(home);
  }
  if (candidate.startsWith('~/')) {
    return path.resolve(path.join(home, candidate.slice(2)));
  }
  return path.resolve(candidate);
}
