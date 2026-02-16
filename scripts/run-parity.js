import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--test', 'tests/condominios.v2.parity.matrix.test.js'], {
  stdio: 'inherit',
  shell: false
});

child.on('error', (err) => {
  console.error('[parity] falha ao iniciar runner:', err);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
  }
  console.error('[parity] processo encerrado por sinal:', signal || 'desconhecido');
  process.exit(1);
});
