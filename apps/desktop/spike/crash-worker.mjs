import { queue, push } from './outbox-model.mjs';
const [mode, client, server, opId, student, stop] = process.argv.slice(2);
const checkpoint = stage => {
  if (stage === stop) process.kill(process.pid, 'SIGKILL');
};
if (mode === 'queue') {
  queue(client, opId, { student, status: 'PRESENT', baseVersion: 0 }, checkpoint);
} else {
  push(client, server, checkpoint);
}
