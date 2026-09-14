import net from 'node:net';
import { DataError } from './paths.mjs';

export const pipeFor = token => `\\\\.\\pipe\\worknaru-dev-${token}`;
export function request(owner, command, milliseconds = 2000, input = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipeFor(owner.token));
    socket.setEncoding('utf8');
    let buffer = '';
    const timer = setTimeout(() => finish(new DataError('controller_unavailable', 'The development controller did not respond. Run pnpm exec worknaru doctor; do not kill a process using the saved PID alone.')), milliseconds);
    function finish(error, result) {
      clearTimeout(timer); socket.destroy(); error ? reject(error) : resolve(result);
    }
    socket.on('error', () => finish(new DataError('controller_unavailable', 'The saved development controller is unreachable. Run pnpm exec worknaru doctor and inspect the record and logs.')));
    socket.on('connect', () => socket.write(`${JSON.stringify({ token: owner.token, command, input })}\n`));
    socket.on('data', data => {
      buffer += data;
      if (buffer.length > 1024 * 1024) return finish(new DataError('ownership_conflict', 'Invalid controller response.'));
      if (!buffer.includes('\n')) return;
      try {
        const result = JSON.parse(buffer.split('\n')[0]);
        if (result.token !== owner.token || result.repository !== owner.repository || result.dataRoot !== owner.dataRoot) throw new Error();
        finish(null, result);
      } catch { finish(new DataError('ownership_conflict', 'Development controller identity does not match.')); }
    });
    socket.on('end', () => finish(new DataError('controller_unavailable', 'Development controller closed before replying.')));
  });
}
