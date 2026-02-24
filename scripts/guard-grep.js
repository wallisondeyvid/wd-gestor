import { spawnSync } from 'node:child_process';

const [pattern, targetPath, messageOnFail, ...allowedFilesRaw] = process.argv.slice(2);

if (!pattern || !targetPath || !messageOnFail) {
  console.error('Uso: node scripts/guard-grep.js "<pattern>" "<path>" "<messageOnFail>"');
  process.exit(2);
}

const result = spawnSync('git', ['grep', '-n', pattern, '--', targetPath], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
});

if (result.error) {
  console.error(String(result.error.message || result.error));
  process.exit(2);
}

const stdout = String(result.stdout || '').trim();
const stderr = String(result.stderr || '').trim();
const allowedFiles = new Set(
  allowedFilesRaw
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => item.replace(/\\/g, '/'))
);

const lines = stdout ? stdout.split(/\r?\n/).filter(Boolean) : [];
const blockedLines = lines.filter(line => {
  const filePart = String(line).split(':', 1)[0].replace(/\\/g, '/');
  return !allowedFiles.has(filePart);
});

if (result.status === 0) {
  if (blockedLines.length) {
    process.stdout.write(`${blockedLines.join('\n')}\n`);
    console.log(`❌ ${messageOnFail}`);
    process.exit(1);
  }
  if (lines.length) {
    console.log('✅ Guard OK (somente exceções permitidas)');
    process.exit(0);
  }
  console.log(`❌ ${messageOnFail}`);
  process.exit(1);
}

if (result.status === 1) {
  console.log('✅ Guard OK');
  process.exit(0);
}

if (stdout) process.stdout.write(`${stdout}\n`);
if (stderr) process.stderr.write(`${stderr}\n`);
console.error(`❌ Falha ao executar git grep (exit ${result.status ?? 'desconhecido'})`);
process.exit(2);
