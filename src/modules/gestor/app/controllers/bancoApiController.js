// Controller para bancos – serve o conteúdo de public/data/bancos.json com cache leve em memória
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Localiza raiz do projeto a partir de modules/gestor/app/controllers
const ROOT = process.cwd();
const BANCOS_FILE = path.join(ROOT, 'public', 'data', 'bancos.json');

let cache = { data: null, ts: 0 };
const TTL_MS = 1000 * 60 * 10; // 10 minutos

export async function listarBancos(req, res, next) {
  try {
    const now = Date.now();
    if (!cache.data || (now - cache.ts) > TTL_MS) {
      let json;
      try {
        const raw = await readFile(BANCOS_FILE, 'utf8');
        json = JSON.parse(raw);
        if (!Array.isArray(json)) throw new Error('Formato inválido: esperado array');
      } catch (err) {
        console.warn('[bancos][api] falha ao ler arquivo, usando fallback básico:', err.message);
        json = [];
      }
      cache = { data: json.map(normalizarBanco).filter(v=>v.codigo && v.nome), ts: now };
    }
    return res.json({ ok: true, bancos: cache.data, total: cache.data.length, cached: true });
  } catch (err) {
    next(err);
  }
}

function normalizarBanco(x) {
  return {
    codigo: String(x.codigo ?? x.cod ?? x.code ?? x.id ?? '').padStart(3,'0'),
    nome: String(x.nome ?? x.name ?? x.label ?? x.descricao ?? '').trim()
  };
}

export default { listarBancos };
