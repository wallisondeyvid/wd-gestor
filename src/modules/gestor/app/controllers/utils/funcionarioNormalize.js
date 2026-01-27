// Utilitário de normalização de payload de Funcionário
// Centraliza limpeza de strings, datas e números para reduzir risco de regressões
import { asStr } from './sharedStrings.js';

// Fallback local se sharedStrings não existir
function _asStr(v){ return (v == null ? '' : (Array.isArray(v) ? String(v[0] ?? '') : String(v))); }
const _as = typeof asStr === 'function' ? asStr : _asStr;

export function toISODateMaybe(v){
  const s = _as(v).trim();
  if(!s) return undefined;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m) return `${m[3]}-${m[2]}-${m[1]}`;
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s; // já ISO
  return undefined;
}

export function cleanNumberBR(raw){
  if(raw == null) return undefined;
  const s = _as(raw).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',', '.');
  if(!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeCargaSemanal(v){
  if(v == null || v === '') return undefined;
  const num = Number(String(v).replace(/[^0-9.,-]/g,'').replace(',','.'));
  return Number.isFinite(num) ? num : undefined;
}

export function stripDigits(value){
  return _as(value).replace(/\D/g,'');
}

// Campos de data esperados para conversão automática
export const DATE_FIELDS = [
  'rg_data_expedicao','data_nascimento','data_chegada_brasil','data_admissao','data_termino',
  'fgts_data','cert_militar_data','cnh_validade'
];

export function normalizeFuncionarioPayload(raw){
  const out = { ...raw };
  // Datas
  DATE_FIELDS.forEach(f=>{ if(Object.prototype.hasOwnProperty.call(out,f)){ const iso = toISODateMaybe(out[f]); out[f] = iso || undefined; } });
  // CPF / PIS
  if(out.cpf) out.cpf = stripDigits(out.cpf);
  if(out.pis) out.pis = stripDigits(out.pis);
  // Telefones (mantém formato original se já formatado no front; apenas remove lixo extremo)
  if(out.telefone) out.telefone = out.telefone.toString().trim();
  if(out.telefone2) out.telefone2 = out.telefone2.toString().trim();
  // Salário base
  if(out.salario_base !== undefined) out.salario_base = cleanNumberBR(out.salario_base);
  // Carga semanal
  if(out.carga_semanal !== undefined) out.carga_semanal = normalizeCargaSemanal(out.carga_semanal);
  return out;
}
