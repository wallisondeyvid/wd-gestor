import { ok, badRequest, serverError } from '#core/utils/apiResponse.js';
import fs from 'fs';
import path from 'path';
import {
	findUnidadeByIdOrRawLean,
	findClusterUnidadesByAnchorLean,
} from '#modules/gestor/app/services/legacy/apiDbBridgeService.js';
let ibgeIndex = null; let ibgeIndexLoadError = null;
function stripDiacritics(s=''){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function normalizeName(str){
	// remove acentos, compacta espaços, remove pontuação supérflua, minúsculas
	const s = stripDiacritics(String(str||''))
		.replace(/[`´'’]/g,'')
		.replace(/[^a-zA-Z0-9]+/g,' ')
		.trim()
		.replace(/\s+/g,' ')
		.toLowerCase();
	return s;
}
function normalizeUF(uf){
	if(!uf) return '';
	const map = {
		'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR','santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO'
	};
	const key = normalizeName(uf);
	return (map[key] || String(uf).trim().toUpperCase());
}
function ensureIbgeIndex(){ if(ibgeIndex || ibgeIndexLoadError) return; try { const datasetPath = path.resolve(process.cwd(),'public','data','municipios_ibge.json'); const raw = fs.readFileSync(datasetPath,'utf8'); const arr = JSON.parse(raw); ibgeIndex = {}; for(const m of arr){ const uf = (m.uf||'').toUpperCase(); if(!uf) continue; if(!ibgeIndex[uf]) ibgeIndex[uf] = {}; const nNorm = normalizeName(m.nome); if(nNorm) ibgeIndex[uf][nNorm] = m.codigo || ''; } } catch(e){ ibgeIndexLoadError = e; } }
export function obterCodigoIbge(req,res){
	try {
		const { estado, cidade } = req.query;
		if(!estado || !cidade) return badRequest(res,'Parâmetros estado e cidade obrigatórios');
		ensureIbgeIndex();

		let codigoIbge='';
		if(ibgeIndex){
			const uf = normalizeUF(estado);
			const cityNorm = normalizeName(cidade);
			codigoIbge = ibgeIndex[uf]?.[cityNorm] || '';
			if(!codigoIbge && /\bmunicipio\s+de\s+/i.test(cityNorm)){
				const simplified = cityNorm.replace(/\bmunicipio\s+de\s+/i,'').trim();
				codigoIbge = ibgeIndex[uf]?.[simplified] || '';
			}
		}
		return ok(res,{ estado, cidade, codigoIbge, fonte: ibgeIndex? 'dataset' : 'fallback', erroCarregamento: !!ibgeIndexLoadError });
	} catch(e){
		return serverError(res,e);
	}
}
export async function obterClusterUnidades(req,res){ try { const { unidade_id } = req.query; if(!unidade_id) return ok(res,{ unidades: [] }); const base = await findUnidadeByIdOrRawLean(unidade_id); if(!base) return ok(res,{ unidades: [] }); const anchorRaw = base.matriz_id || base.unidade_principal_id || base._id; const unidades = await findClusterUnidadesByAnchorLean(anchorRaw); return ok(res,{ unidades }); } catch(e){ return serverError(res,e); } }
