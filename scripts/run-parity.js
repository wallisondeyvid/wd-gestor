import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--test', 'tests/condominios.v2.parity.test.js', 'tests/condominios.v2.parity.matrix.test.js'], {
  env: {
    ...process.env,
    MONGO_MEMORY: String(process.env.MONGO_MEMORY ?? '1')
  },
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
