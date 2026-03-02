import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import {
	existsUnidadeByCond,
	findSubunidadesLean,
	findUnidadeByCodigoLean,
	findUnidadeByIdLean,
	findUnidadesByCondLean,
	findUnidadeUserBaseLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let municipiosCache = null; let municipiosMtimeMs = 0;
async function loadMunicipios() { if (municipiosCache) return municipiosCache; const filePath = path.resolve(process.cwd(), 'public', 'data', 'municipios_ibge.json'); try { const stat = await fs.stat(filePath); if (!municipiosCache || stat.mtimeMs !== municipiosMtimeMs) { const raw = await fs.readFile(filePath, 'utf-8'); municipiosCache = JSON.parse(raw); municipiosMtimeMs = stat.mtimeMs; } } catch (e) { console.error('[ibge] Falha ao carregar municipios_ibge.json:', e.message); municipiosCache = []; } return municipiosCache; }
export async function unidadesCluster(req, res) {
	try {
		const { unidade_id } = req.query;
		if (!unidade_id) return res.status(400).json({ ok: false, error: 'Parametro unidade_id ausente' });

		// Localiza a unidade base por id (ObjectId) ou código
		let unidadeBase = null;
		if (/^[0-9a-fA-F]{24}$/.test(unidade_id)) unidadeBase = await findUnidadeByIdLean(unidade_id);
		if (!unidadeBase) unidadeBase = await findUnidadeByCodigoLean(unidade_id);
		if (!unidadeBase) return res.status(404).json({ ok: false, error: 'Unidade base nao encontrada' });

		// Determina escopo do usuário
		const isPrivileged = req.user?.isMaster || req.user?.role === 'admin';
		let condAcessiveis = null;
		if (!isPrivileged) {
			// ancora do usuário: matriz ou principal; fallback unidade atual
			let anchor = req.user?.unidade_principal_id || null;
			if (!anchor && req.user?.unidade_id) {
				const u = await findUnidadeUserBaseLean(req.user.unidade_id);
				if (u) anchor = u.is_principal ? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
			}
			if (anchor) {
				condAcessiveis = { $or: [ { _id: anchor }, { unidade_principal_id: anchor }, { matriz_id: anchor } ] };
			} else if (req.user?.unidade_id) {
				condAcessiveis = { _id: req.user.unidade_id };
			} else {
				// Sem escopo definido: não retorna nada
				return res.json({ ok: true, total: 0, unidades: [] });
			}
			// Se unidade solicitada estiver fora do escopo, não retornar dados
			let filtroBase = { _id: unidadeBase._id };
			if (condAcessiveis.$or) filtroBase = { ...filtroBase, $or: condAcessiveis.$or };
			else filtroBase = { ...filtroBase, ...condAcessiveis };
			const existeBaseDentroEscopo = await existsUnidadeByCond(filtroBase);
			if (!existeBaseDentroEscopo) return res.json({ ok: true, total: 0, unidades: [] });
		}

		// Monta cluster: base + filiais diretas
		const subunidades = await findSubunidadesLean(unidadeBase._id);
		let todas = [unidadeBase, ...subunidades];
		// Caso não privilegiado, filtra pelo escopo
		if (condAcessiveis) {
			const acessiveis = await findUnidadesByCondLean(condAcessiveis);
			const ids = new Set(acessiveis.map(u => String(u._id)));
			todas = todas.filter(u => ids.has(String(u._id)));
		}
		return res.json({ ok: true, total: todas.length, unidades: todas.map(u => ({ id: u._id, codigo: u.codigo, nome: u.nome, is_principal: u.is_principal, subunidade: u.subunidade, unidade_principal_id: u.unidade_principal_id, cidade: u.cidade, estado: u.estado })) });
	} catch (err) {
		console.error('[unidadesCluster] Erro:', err);
		return res.status(500).json({ ok: false, error: 'Erro interno' });
	}
}
export async function debugSession(req, res) { res.json({ hasCookie: Boolean(req.headers.cookie), sessionID: req.sessionID || null, user: req.user ? { id: req.user._id || req.user.id, email: req.user.email, role: req.user.role } : null }); }
export async function debugWhoami(req, res) { res.json({ ok: true, user: req.user }); }
export async function ibge(req, res) { try { const { estado, cidade } = req.query; if (!estado) return res.status(400).json({ ok: false, error: 'Parametro estado requerido' }); const uf = String(estado).toUpperCase(); const municipios = await loadMunicipios(); const filtrados = municipios.filter(m => m.uf === uf); if (cidade) { const cNorm = cidade.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(); let encontrado = null; for (const m of filtrados) { if (m.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase() === cNorm) { encontrado = m; break; } } if (!encontrado) return res.status(404).json({ ok: false, error: 'Cidade nao encontrada para UF' }); return res.json({ ok: true, ibge: encontrado.codigo, cidade: encontrado.nome, uf }); } res.json({ ok: true, total: filtrados.length, municipios: filtrados }); } catch (err) { console.error('[ibge] Erro:', err); res.status(500).json({ ok: false, error: 'Erro interno' }); } }
export async function favicon(req, res) { try { const publicDir = path.resolve(process.cwd(), 'public'); const candidates = [ path.join(publicDir, 'favicon.ico'), path.resolve(process.cwd(), 'images', 'logoWDGestor.png') ]; let found = null; for (const f of candidates) { try { const st = await fs.stat(f); if (st.isFile()) { found = f; break; } } catch (_) { } } if (!found) return res.status(204).end(); const ext = path.extname(found).toLowerCase(); const mime = ext === '.ico' ? 'image/x-icon' : 'image/png'; res.setHeader('Content-Type', mime); res.setHeader('Cache-Control', 'public, max-age=86400'); res.sendFile(found); } catch (err) { console.error('[favicon] Erro:', err); res.status(500).end(); } }
