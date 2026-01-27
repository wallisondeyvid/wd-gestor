// Remove diretórios/arquivos legados da antiga arquitetura
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());

const targets = [
  // diretórios legados
  'src/gestor',
  // arquivos legados
  'src/gestor-app.js',
  'src/gestor-app.js.backup',
  // stubs antigos
  'src/middlewares/rateLimit.js',
  'src/lib/mailer.js',
  'src/lib/mailer.cjs',
];

async function removeTarget(rel) {
  const full = path.join(ROOT, rel);
  try {
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) {
      console.log(`[clean] ausente: ${rel}`);
      return;
    }
    if (stat.isDirectory()) {
      await fs.rm(full, { recursive: true, force: true });
      console.log(`[clean] diretório removido: ${rel}`);
    } else {
      await fs.rm(full, { force: true });
      console.log(`[clean] arquivo removido: ${rel}`);
    }
  } catch (err) {
    console.warn(`[clean] falha ao remover ${rel}: ${err.message}`);
  }
}

async function main() {
  for (const t of targets) {
    await removeTarget(t);
  }
  console.log('[clean] finalizado');
}

main();
