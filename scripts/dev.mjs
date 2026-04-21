import { spawn } from 'node:child_process';

const children = [];

function startProcess(name, args) {
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      process.exitCode = code ?? 1;
    }
  });

  children.push({ name, child });
}

function shutdown(signal) {
  for (const { child } of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startProcess('server', ['--workspace', 'server', 'run', 'dev']);
startProcess('client', ['--workspace', 'client', 'run', 'dev']);
