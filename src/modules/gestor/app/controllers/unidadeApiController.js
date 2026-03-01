import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
  findAllUnidadesLean,
  findUnidadeUserBaseLean,
  findUnidadesByCondLeanFull,
  findUltimaUnidadePorCodigo,
  findUnidadeByCodigo,
  findUnidadeByCpf,
  findUnidadeByCnpj,
  findUnidadeById,
  findSubunidadesByUnidadePrincipal,
  createUnidadeDoc,
  saveUnidadeDoc,
  updateUserUnidadeById,
  findUnidadeByCpfExcludingId,
  findUnidadeByCnpjExcludingId,
  updateUnidadeByIdWithValidators,
  findUnidadesPrincipaisByIds,
  updateManyUnidadesAccessByIds,
  findUnidadesPermitidasByMatrizRef,
  findDiretorAtivoByUnidadeSelectId,
  findUnidadeByIdWithModulosAcessiveis,
  findUnidadeByIdLean,
  deleteUnidadeById,
} from '#modules/gestor/app/db/api.db.js';
import { validarCnpj, calcularDigitoVerificador } from '#modules/gestor/app/utils/cnpj.js';
// Dependências para upload de logo
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import { put, del } from '@vercel/blob';

// Converte datas no formato BR (dd/mm/aaaa) ou ISO (yyyy-mm-dd[THH:mm:ssZ]) para Date válido
function parseDateBRorISO(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  // ISO puro yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  // Tentativa nativa (ISO completo ou outros formatos aceitos pelo engine)
  const dtAuto = new Date(str);
  if (!isNaN(dtAuto.getTime())) return dtAuto;
  // BR dd/mm/aaaa
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mm = Number(m[2]);
    const y = Number(m[3]);
    if (mm >= 1 && mm <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mm - 1, d));
      return isNaN(dt.getTime()) ? null : dt;
    }
  }
  return null;
}

const AUTH_MODES = ['', 'api-key-header', 'api-key-query', 'basic', 'oauth2', 'mtls'];
const AUTH_MODE_SET = new Set(AUTH_MODES);
const API_BANCARIA_FIELDS = [
  'tipoAutenticacaoAPI',
  'apiHeaderName',
  'apiHeaderValue',
  'apiQueryParamName',
  'apiQueryParamValue',
  'apiBasicUser',
  'apiBasicPassword',
  'apiOauthClientId',
  'apiOauthClientSecret',
  'apiOauthScope',
  'apiOauthTokenUrl',
  'apiBaseUrl',
  'apiTokenUrlGenerica',
  'apiMtlsCertFileName',
  'apiMtlsCertFileData',
  'apiMtlsPassword'
];

function sanitizeApiBancariaInput(raw = {}) {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const output = {};
  for (const field of API_BANCARIA_FIELDS) {
    if (!(field in source)) continue;
    const value = source[field];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      output[field] = trimmed;
    } else {
      output[field] = value;
    }
  }
  if (output.tipoAutenticacaoAPI && !AUTH_MODE_SET.has(output.tipoAutenticacaoAPI)) {
    output.tipoAutenticacaoAPI = '';
  }
  return output;
}

function buildApiBancariaForResponse(doc) {
  if (!doc) return {};
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  if (plain.apiMtlsCertFileData) {
    delete plain.apiMtlsCertFileData;
  }
  return plain;
}

// Lista unidades acessíveis ao usuário atual (fallback JSON para hidratar a página quando o SSR vier vazio)
export async function listUnidades(req, res) {
  try {
    // Modo sem DB: retorna lista vazia para evitar 500
    if (req?.app?.locals?.skipDb) {
      return ok(res, { unidades: [], principalUnits: [] });
    }
    const user = req.user || {};
    const isMaster = user.isMaster === true || user.role === 'master' || user.role === 'admin';
    let unidades = [];
    if (isMaster) {
      unidades = await findAllUnidadesLean();
    } else {
      // Determinar escopo por matriz do usuário
      let principalId = user.unidade_principal_id || null;
      try {
        if (!principalId && user.unidade_id) {
          const u = await findUnidadeUserBaseLean(user.unidade_id);
          if (u) principalId = u.is_principal ? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
        }
      } catch(_) {}
      const cond = principalId
        ? { $or: [ { _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId } ] }
        : { _id: user.unidade_id || null };
      unidades = await findUnidadesByCondLeanFull(cond);
    }
    // Normalizações leves para manter compat em front
    const safe = (unidades || []).map(u => ({
      ...u,
      naturezaJuridica: u.naturezaJuridica || '',
      modulosAcessiveis: Array.isArray(u.modulosAcessiveis) ? u.modulosAcessiveis : [],
      apiBancaria: buildApiBancariaForResponse(u.apiBancaria)
    }));
    let principalUnits = safe.filter(u => u.is_principal);
    // Se não houver principais explícitas, tenta inferir por subunidade=false
    if (!principalUnits.length) principalUnits = safe.filter(u => u.subunidade === false || u.subunidade === 'false');
    return ok(res, { unidades: safe, principalUnits });
  } catch (e) {
    console.error('[API UNIDADES][list] Erro:', e);
    return ok(res, { unidades: [], principalUnits: [] });
  }
}

export async function createUnidade(req, res) {
  try {
    if (req.user.role === 'user') return badRequest(res, 'Você não tem permissão para criar unidades.');

    const {
      nomeFantasia,
      razaoSocial,
      cnpj,
      cpf,
      pessoaTipo,
      inscricaoEstadual,
      inscricaoMunicipal,
      cnaePrincipal,
      cnaeSecundarios,
      regimeTributario,
      naturezaJuridica,
      principal,
      subunidade,
      unidadePrincipal,
      dataAbertura,
      endereco,
      telefoneFixo,
      telefoneCelular,
      emailPrincipal,
      emailFiscal,
      site,
      banco,
      agencia,
      contaCorrente,
      pixChave,
      modulosAcessiveis,
      diretor_usuario_id,
    } = req.body;

    const apiBancariaPayload = sanitizeApiBancariaInput(req.body.apiBancaria || {});
    const isPrincipal = (principal === true || principal === 'true');
    const isSubunidade = (subunidade === true || subunidade === 'true');
    const canCreatePrincipal = req.user.isMaster || req.user.role === 'admin';

    if (isSubunidade && !unidadePrincipal) return badRequest(res, 'Uma subunidade deve ter uma unidade principal associada.');
    if (!canCreatePrincipal && isPrincipal) return badRequest(res, 'Apenas Master/Admin podem criar unidades principais.');
    if (!canCreatePrincipal && !isSubunidade) return badRequest(res, 'Selecione a Matriz para a Filial.');
    if (!nomeFantasia || !emailPrincipal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPrincipal)) {
      return badRequest(res, 'Nome Fantasia e e-mail principal são obrigatórios e válidos.');
    }
    if (!pessoaTipo || !['pf', 'pj'].includes(pessoaTipo)) {
      return badRequest(res, 'Tipo de pessoa deve ser Pessoa Física (PF) ou Pessoa Jurídica (PJ).');
    }

    let codigo = 'M0001';
    const ultimaUnidade = await findUltimaUnidadePorCodigo();
    if (ultimaUnidade) {
      let ultimoNumero = parseInt((ultimaUnidade.codigo || 'M0000').replace('M', ''), 10) || 0;
      do {
        ultimoNumero += 1;
        codigo = `M${ultimoNumero.toString().padStart(4, '0')}`;
      } while (await findUnidadeByCodigo(codigo));
    }

    let cleanedCnpj = cnpj ? cnpj.replace(/\D/g, '') : null;
    if (pessoaTipo === 'pf') {
      const cleanedCpf = cpf ? cpf.replace(/\D/g, '') : null;
      if (!cleanedCpf || cleanedCpf.length !== 11) return badRequest(res, 'CPF é obrigatório para Pessoa Física e deve ter 11 dígitos.');
      const cpfExistente = await findUnidadeByCpf(cleanedCpf);
      if (cpfExistente) return badRequest(res, 'CPF já cadastrado no banco de dados.');
    } else if (pessoaTipo === 'pj') {
      if (isSubunidade && !unidadePrincipal) return badRequest(res, 'Subunidade precisa de unidade principal.');
      if (isSubunidade) cleanedCnpj = null;
      if (cleanedCnpj && cleanedCnpj.length !== 14) return badRequest(res, 'CNPJ é obrigatório para Pessoa Jurídica e deve ter 14 dígitos.');
      const cnpjExistente = await findUnidadeByCnpj(cleanedCnpj);
      if (cnpjExistente) return badRequest(res, 'CNPJ já cadastrado no banco de dados.');
    }

    let finalCnpj = cleanedCnpj;
    if (pessoaTipo === 'pj' && isSubunidade) {
      const unidadePrincipalDoc = await findUnidadeById(unidadePrincipal);
      if (!unidadePrincipalDoc || !unidadePrincipalDoc.is_principal) return badRequest(res, 'Unidade principal inválida.');
      const baseCnpj = (unidadePrincipalDoc.cnpj || '').replace(/\D/g, '').slice(0, 8);
      if (baseCnpj.length !== 8) return badRequest(res, 'CNPJ da unidade principal inválido.');
      const existingSubunidades = await findSubunidadesByUnidadePrincipal(unidadePrincipal);
      const maxSuffix = existingSubunidades.reduce((max, sub) => Math.max(max, parseInt(sub.cnpj.slice(8, 12)) || 1), 1);
      const newSuffix = (maxSuffix + 1).toString().padStart(4, '0');
      const cnpjParcial = `${baseCnpj}${newSuffix}`;
      const dv1 = calcularDigitoVerificador(cnpjParcial, [5,4,3,2,9,8,7,6,5,4,3,2]);
      const dv2 = calcularDigitoVerificador(cnpjParcial + dv1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
      finalCnpj = `${cnpjParcial}${dv1}${dv2}`;
    } else if (pessoaTipo === 'pj' && isPrincipal && cleanedCnpj) {
      if (!validarCnpj(cleanedCnpj)) return badRequest(res, 'Dígitos verificadores do CNPJ inválidos.');
      finalCnpj = cleanedCnpj.replace(/\D/g, '');
    }

    let tipoPix = req.body.tipoPix || null;
    if (!tipoPix && pixChave) {
      const chave = pixChave.trim();
      if (/^\d{2}\.\d{3}\.\d{003}\/\d{4}-\d{2}$/.test(chave)) tipoPix = 'cnpj';
      else if (/^\d{3}\.\d{3}\.\d{003}-\d{2}$/.test(chave)) tipoPix = 'cpf';
      else if (/^.+@.+\..+$/.test(chave)) tipoPix = 'email';
      else if (/^(\(\d{2}\)\s?\d{4,5}-\d{4}|\d{4,5}-\d{4}|\d{11})$/.test(chave.replace(/\s/g, ''))) tipoPix = 'telefone';
      else tipoPix = 'aleatoria';
    }

    const novaUnidade = createUnidadeDoc({
      codigo,
      nome: nomeFantasia,
      razaoSocial: razaoSocial || null,
      cnpj: finalCnpj,
      cpf: cpf ? cpf.replace(/\D/g, '') : null,
      pessoaTipo,
      inscricaoEstadual: inscricaoEstadual || null,
      inscricaoMunicipal: inscricaoMunicipal || null,
      cnaePrincipal: cnaePrincipal || null,
      cnaeSecundarios: cnaeSecundarios || null,
      regimeTributario: regimeTributario || null,
      naturezaJuridica: naturezaJuridica || null,
      is_principal: isPrincipal,
      subunidade: isSubunidade,
      unidade_principal_id: isSubunidade ? unidadePrincipal : null,
      dataAbertura: parseDateBRorISO(dataAbertura),
      endereco: endereco || null,
      telefoneFixo: telefoneFixo || null,
      telefoneCelular: telefoneCelular || null,
      emailPrincipal: emailPrincipal || null,
      emailFiscal: emailFiscal || null,
      site: site || null,
      banco: banco || null,
      agencia: agencia || null,
      contaCorrente: contaCorrente || null,
      pixChave: pixChave || null,
      tipoPix,
      modulosAcessiveis: Array.isArray(modulosAcessiveis) ? modulosAcessiveis : (modulosAcessiveis ? [modulosAcessiveis] : []),
      diretor_usuario_id: isPrincipal && diretor_usuario_id ? diretor_usuario_id : null,
      is_active: true,
      logo: null,
      apiBancaria: apiBancariaPayload,
    });

    const unidadeSalva = await saveUnidadeDoc(novaUnidade);
    if (isPrincipal && diretor_usuario_id) {
      try {
        await updateUserUnidadeById(diretor_usuario_id, unidadeSalva._id);
      } catch (e) {
        console.warn('[API UNIDADES][create] Falha ao vincular diretor à unidade:', e.message);
      }
    }

    const serialized = unidadeSalva.toObject();
    serialized.logo = unidadeSalva.logo || null;
    serialized.apiBancaria = buildApiBancariaForResponse(serialized.apiBancaria);
    return created(res, unidadeSalva._id, { data: serialized });
  } catch (error) {
    console.error('[API UNIDADES][create] Erro:', error);
    if (error.code === 11000) return badRequest(res, 'Código ou CNPJ já cadastrado no banco de dados.');
    return serverError(res, error);
  }
}
export async function updateUnidade(req, res) {
  try {
    if (req.user.role === 'user') return badRequest(res, 'Você não tem permissão para editar unidades.');

    const { id: unidadeId } = req.params;
    const unidadeExistente = await findUnidadeById(unidadeId);
    if (!unidadeExistente) return notFound(res, 'Unidade não encontrada.');

    const {
      nomeFantasia,
      razaoSocial,
      cnpj,
      cpf,
      pessoaTipo,
      subunidade,
      unidadePrincipal,
      dataAbertura,
      tipoLogradouro,
      logradouro,
      numero,
      complemento,
      bairro,
      cep,
      cidade,
      estado,
      codigoIbgeMunicipio,
      telefoneFixo,
      telefoneCelular,
      emailPrincipal,
      emailFiscal,
      site,
      banco,
      agencia,
      contaCorrente,
      pixChave,
      modulosAcessiveis,
      inscricaoEstadual,
      inscricaoMunicipal,
      cnaePrincipal,
      cnaeSecundarios,
      regimeTributario,
      naturezaJuridica,
    } = req.body;

    const apiBancariaPayload = sanitizeApiBancariaInput(req.body.apiBancaria || {});

    if (!pessoaTipo || !['pf', 'pj'].includes(pessoaTipo)) {
      return badRequest(res, 'Tipo de pessoa deve ser Pessoa Física (PF) ou Pessoa Jurídica (PJ).');
    }

    const cleanedCnpj = cnpj ? cnpj.replace(/\D/g, '') : null;
    if (pessoaTipo === 'pf') {
      const cleanedCpf = cpf ? cpf.replace(/\D/g, '') : null;
      if (!cleanedCpf || cleanedCpf.length !== 11) return badRequest(res, 'CPF é obrigatório para Pessoa Física e deve ter 11 dígitos.');
      const cpfExistente = await findUnidadeByCpfExcludingId(cleanedCpf, unidadeId);
      if (cpfExistente) return badRequest(res, 'CPF já cadastrado no banco de dados.');
    } else if (pessoaTipo === 'pj') {
      if (!cleanedCnpj || cleanedCnpj.length !== 14) return badRequest(res, 'CNPJ é obrigatório para Pessoa Jurídica e deve ter 14 dígitos.');
      const cnpjExistente = await findUnidadeByCnpjExcludingId(cleanedCnpj, unidadeId);
      if (cnpjExistente) return badRequest(res, 'CNPJ já cadastrado no banco de dados.');
      if (!validarCnpj(cleanedCnpj)) return badRequest(res, 'Dígitos verificadores do CNPJ inválidos.');
    }

    let tipoPix = req.body.tipoPix || null;
    if (!tipoPix && pixChave) {
      const chave = pixChave.trim();
      if (/^\d{2}\.\d{3}\.\d{003}\/\d{4}-\d{2}$/.test(chave)) tipoPix = 'cnpj';
      else if (/^\d{3}\.\d{3}\.\d{003}-\d{2}$/.test(chave)) tipoPix = 'cpf';
      else if (/^.+@.+\..+$/.test(chave)) tipoPix = 'email';
      else if (/^(\(\d{2}\)\s?\d{4,5}-\d{4}|\d{4,5}-\d{4}|\d{11})$/.test(chave.replace(/\s/g, ''))) tipoPix = 'telefone';
      else tipoPix = 'aleatoria';
    }

    if (!nomeFantasia || !emailPrincipal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPrincipal)) {
      return badRequest(res, 'Nome Fantasia e e-mail principal são obrigatórios e válidos.');
    }

    const updated = {
      nome: nomeFantasia,
      razaoSocial: razaoSocial || null,
      cnpj: pessoaTipo === 'pj' ? cleanedCnpj : null,
      cpf: pessoaTipo === 'pf' ? (cpf ? cpf.replace(/\D/g, '') : null) : null,
      pessoaTipo,
      dataAbertura: parseDateBRorISO(dataAbertura),
      inscricaoEstadual: inscricaoEstadual || null,
      inscricaoMunicipal: inscricaoMunicipal || null,
      cnaePrincipal: cnaePrincipal || null,
      cnaeSecundarios: cnaeSecundarios || null,
      regimeTributario: regimeTributario || null,
      naturezaJuridica: naturezaJuridica || null,
      tipoLogradouro: tipoLogradouro || null,
      logradouro: logradouro || null,
      numero: numero || null,
      complemento: complemento || null,
      bairro: bairro || null,
      cep: cep || null,
      cidade: cidade || null,
      estado: estado || null,
      codigoIbgeMunicipio: codigoIbgeMunicipio || null,
      telefoneFixo: telefoneFixo || null,
      telefoneCelular: telefoneCelular || null,
      emailPrincipal: emailPrincipal || null,
      emailFiscal: emailFiscal || null,
      site: site || null,
      banco: banco || null,
      agencia: agencia || null,
      contaCorrente: contaCorrente || null,
      pixChave: pixChave || null,
      tipoPix,
      modulosAcessiveis: Array.isArray(modulosAcessiveis) ? modulosAcessiveis : (modulosAcessiveis ? [modulosAcessiveis] : []),
      diretor_usuario_id: unidadeExistente.diretor_usuario_id,
      is_principal: subunidade === 'false',
      subunidade: subunidade === 'true',
      unidade_principal_id: subunidade === 'true' ? unidadePrincipal : null,
      endereco: req.body.endereco || null,
      apiBancaria: apiBancariaPayload,
    };

    updated.logo = unidadeExistente.logo || null;

    const unidade = await updateUnidadeByIdWithValidators(unidadeId, updated);
    if (!unidade) return notFound(res, 'Unidade não encontrada.');

    const serialized = unidade.toObject();
    serialized.logo = unidade.logo || null;
    serialized.apiBancaria = buildApiBancariaForResponse(serialized.apiBancaria);

    return ok(res, { updated: true, unidade: serialized });
  } catch (error) {
    console.error('[API UNIDADES][update] Erro:', error);
    return serverError(res, error);
  }
}
export async function toggleAccessUnidades(req, res) { try { if (req.user.role === 'user') return badRequest(res,'Você não tem permissão para alterar o acesso de unidades.'); const { unitIds, activate } = req.body; if (!Array.isArray(unitIds) || typeof activate !== 'boolean') return badRequest(res,'Parâmetros inválidos.'); if (req.user.role === 'diretor') { const unidadesPrincipais = await findUnidadesPrincipaisByIds(unitIds); if (unidadesPrincipais.length > 0) return badRequest(res,'Diretores não podem alterar o acesso de unidades principais.'); } const result = await updateManyUnidadesAccessByIds(unitIds, activate); if (result.modifiedCount === 0) return badRequest(res,'Nenhuma unidade atualizada.'); return ok(res, { newStatus: activate }); } catch (error) { console.error('[API UNIDADES][toggle-access] Erro:', error); return serverError(res, error); } }
export async function getUnidadeById(req, res) { try { const unidadeId = req.params.id; const unidade = await findUnidadeById(unidadeId); if (!unidade) return notFound(res,'Unidade não encontrada'); if (!req.user.isMaster) { const matrizRef = req.user.unidade_principal_id || req.user.unidade_id; if (matrizRef) { const unidadesPermitidas = await findUnidadesPermitidasByMatrizRef(matrizRef); const permitidoIds = new Set(unidadesPermitidas.map(u => String(u._id))); if (!permitidoIds.has(String(unidade._id))) return badRequest(res,'Acesso à unidade não autorizado'); } else return badRequest(res,'Acesso não autorizado'); }
  // Fallback: se for unidade principal e não houver diretor_usuario_id salvo,
  // tentar descobrir pelo usuário diretor vinculado via unidade_id
  let diretorId = unidade.diretor_usuario_id;
  if (unidade.is_principal && !diretorId) {
    try {
      const diretor = await findDiretorAtivoByUnidadeSelectId(unidade._id);
      if (diretor) diretorId = diretor._id;
    } catch (e) {
      console.warn('[API UNIDADES][getById] Fallback diretor falhou:', e.message);
    }
  }
  const unidadeData = { _id: unidade._id, codigo: unidade.codigo, nome: unidade.nome, razaoSocial: unidade.razaoSocial, cnpj: unidade.cnpj, cpf: unidade.cpf, pessoaTipo: unidade.pessoaTipo, inscricaoEstadual: unidade.inscricaoEstadual, inscricaoMunicipal: unidade.inscricaoMunicipal, cnaePrincipal: unidade.cnaePrincipal, cnaeSecundarios: unidade.cnaeSecundarios, regimeTributario: unidade.regimeTributario, naturezaJuridica: unidade.naturezaJuridica, is_principal: unidade.is_principal, subunidade: unidade.subunidade, unidade_principal_id: unidade.unidade_principal_id, dataAbertura: unidade.dataAbertura, telefoneFixo: unidade.telefoneFixo, telefoneCelular: unidade.telefoneCelular, emailPrincipal: unidade.emailPrincipal, emailFiscal: unidade.emailFiscal, site: unidade.site, banco: unidade.banco, agencia: unidade.agencia, contaCorrente: unidade.contaCorrente, pixChave: unidade.pixChave, tipoPix: unidade.tipoPix, modulosAcessiveis: unidade.modulosAcessiveis, diretor_usuario_id: diretorId || null, endereco: unidade.endereco, logo: unidade.logo || null, apiBancaria: buildApiBancariaForResponse(unidade.apiBancaria) };
  return ok(res, unidadeData); } catch (error) { console.error('[API UNIDADES][getById] Erro:', error); return serverError(res, error); } }
export async function getUnidadeModulos(req, res) {
  try {
    const unidade = await findUnidadeByIdWithModulosAcessiveis(req.params.id);
    if (!unidade) return notFound(res,'Unidade não encontrada');
    const payload = (unidade.modulosAcessiveis || []).map(m => ({ _id: m._id, nome: m.nome, status: m.status }));
    return ok(res, payload);
  } catch (e) {
    console.error('[API UNIDADES][getModulos] Erro:', e);
    return serverError(res, e);
  }
}

export async function getUnidadePublic(req, res) {
  try {
    if (req?.app?.locals?.skipDb) {
      return ok(res, {});
    }
    const { id } = req.params;
    if (!id) return badRequest(res, 'ID da unidade é obrigatório.');
    const unidade = await findUnidadeByIdLean(id);
    if (!unidade) return notFound(res, 'Unidade não encontrada.');
    if (unidade.is_active === false) return notFound(res, 'Unidade inativa.');
    const payload = {
      _id: unidade._id,
      nome: unidade.nome || '',
      razaoSocial: unidade.razaoSocial || '',
      endereco: unidade.endereco || '',
      telefone: unidade.telefoneCelular || unidade.telefoneFixo || '',
      emailPrincipal: unidade.emailPrincipal || '',
      banco: unidade.banco || '',
      agencia: unidade.agencia || '',
      contaCorrente: unidade.contaCorrente || '',
      pixChave: unidade.pixChave || '',
      tipoPix: unidade.tipoPix || '',
      is_principal: !!unidade.is_principal,
      subunidade: !!unidade.subunidade
    };
    if (typeof unidade.logo === 'string' && unidade.logo) {
      if (/^https?:\/\//i.test(unidade.logo)) {
        payload.logoUrl = unidade.logo;
      } else if (/^data:/i.test(unidade.logo)) {
        payload.logoDataUrl = unidade.logo;
      } else {
        payload.logoUrl = `/api/unidades/${unidade._id}/logo`;
      }
    } else {
      payload.logoUrl = null;
    }
    return ok(res, payload);
  } catch (error) {
    console.error('[API UNIDADES][getPublic] Erro:', error);
    return serverError(res, error);
  }
}
export async function deleteUnidade(req, res) { try { const unidadeId = req.params.id; if (req.user.role === 'user') return badRequest(res,'Você não tem permissão para excluir unidades.'); const unidade = await findUnidadeById(unidadeId); if (!unidade) return notFound(res,'Unidade não encontrada'); if (unidade.is_principal) { if (req.user.role === 'diretor') return badRequest(res,'Diretores não podem excluir unidades principais.'); if (!req.user.isMaster) return badRequest(res,'Apenas Master pode excluir unidades principais'); } await deleteUnidadeById(unidadeId); return ok(res, { deleted:true, id:unidadeId }); } catch (error) { console.error('[API UNIDADES][delete] Erro:', error); return serverError(res, error); } }

// ================= Logo da Unidade: leitura (serverless-friendly) =================
// Converte Data URL em { buffer, contentType }; retorna null se inválido
function _parseDataUrl(dataUrl){
  try {
    const m = String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/i);
    if (!m) return null;
    const contentType = m[1] || 'application/octet-stream';
    const base64 = m[2] || '';
    const buffer = Buffer.from(base64, 'base64');
    return { buffer, contentType };
  } catch { return null; }
}

// GET binário da logo da unidade; suporta logos salvas como Data URL (preferencial) ou caminho legada em disco
export async function getUnidadeLogo(req, res) {
  try {
    const { id } = req.params;
    const unidade = await findUnidadeByIdLean(id);
    if (!unidade) return notFound(res, 'Unidade não encontrada');

    const logo = unidade.logo || '';
    // 0) URL pública (Blob/S3/Cloudinary): redireciona
    if (/^https?:\/\//i.test(logo)) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.redirect(logo);
    }
    // 1) Data URL (novo formato)
    if (/^data:/i.test(logo)) {
      const parsed = _parseDataUrl(logo);
      if (!parsed) return res.status(204).end();
      res.set('Content-Type', parsed.contentType);
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(parsed.buffer);
    }

    // 2) Caminho legado em disco (melhor esforço; em ambientes serverless pode não existir)
    try {
      if (typeof logo === 'string' && logo) {
        const rel = logo.replace(/^\/*/, '');
        const ROOT = process.cwd();
        const candidates = [
          path.join(ROOT, 'public', rel),
          path.join(ROOT, rel),
          path.join(ROOT, 'public/uploads', rel),
        ];
        for (const p of candidates) {
          try {
            const st = await fs.stat(p).catch(()=>null);
            if (st && st.isFile()) {
              // Best-effort content-type
              const ext = path.extname(p).toLowerCase();
              const type = ext === '.svg' ? 'image/svg+xml'
                        : ext === '.png' ? 'image/png'
                        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                        : ext === '.webp' ? 'image/webp'
                        : 'application/octet-stream';
              res.set('Content-Type', type);
              res.set('Cache-Control', 'private, max-age=300');
              return res.sendFile(p);
            }
          } catch {}
        }
      }
    } catch {}

    // 3) Placeholder
    try {
      const ROOT = process.cwd();
      const ph = path.join(ROOT, 'public', 'img', 'placeholder-logo.svg');
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=600');
      return res.sendFile(ph, err => err ? res.status(204).end() : undefined);
    } catch { return res.status(204).end(); }
  } catch (e) {
    console.error('[API UNIDADES][getLogo] Erro:', e);
    return serverError(res, e);
  }
}

// ================= Upload de Logo da Unidade =================
// Serverless-friendly: processa imagem em memória (multer memoryStorage) e salva como Data URL (webp) no campo 'logo'.
const _logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

async function _processarLogoParaDataUrl(buffer){
  const out = await sharp(buffer)
    .resize(600, 600, { fit: 'cover', position: 'center', withoutEnlargement: true })
    .toFormat('webp', { quality: 90 })
    .toBuffer();
  const b64 = out.toString('base64');
  return `data:image/webp;base64,${b64}`;
}

// Processa o buffer e envia ao Vercel Blob, retornando URL pública
async function _processarEEnviarParaBlob(baseBuffer, { keyPrefix = 'unidades' } = {}){
  // Normaliza para WebP e limita tamanho
  const webpBuf = await sharp(baseBuffer)
    .rotate()
    .resize(600, 600, { fit: 'cover', position: 'center', withoutEnlargement: true })
    .toFormat('webp', { quality: 90 })
    .toBuffer();

  const inVercel = !!process.env.VERCEL; // Store conectada dispensa token
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    || process.env.WDGESTOR_DB_DADOS_READ_WRITE_TOKEN
    || process.env.VERCEL_BLOB_RW_TOKEN
    || '';
  if (!inVercel && !blobToken) {
    const err = new Error('Blob não configurado (conecte a Store no Vercel OU defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)');
    err.code = 'BLOB_NOT_CONFIGURED';
    throw err;
  }

  const key = `${keyPrefix}/${uuid()}.webp`;
  const putOptions = {
    access: 'public',
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
    ...(blobToken ? { token: blobToken } : {})
  };
  const { url } = await put(key, webpBuf, putOptions);
  return { url, token: blobToken };
}

export const uploadLogoUnidade = [
  // Compat: aceita tanto multipart (campo 'logo') quanto JSON { dataUrl }
  function(req,res,next){
    try {
      const ct = String(req.headers['content-type']||'').toLowerCase();
      if (ct.includes('application/json')) {
        // Não invocar multer; segue para o handler unificado
        return next();
      }
    } catch(_) {}
    console.log('[API UNIDADES][uploadLogo] middleware iniciar (multer memoryStorage)');
    _logoUpload.single('logo')(req,res,function(err){
      if(err){
        console.error('[API UNIDADES][uploadLogo] Multer erro:', err);
        return badRequest(res, 'Falha no upload: ' + (err.message||'erro'));
      }
      next();
    });
  },
  async function(req,res){
    try {
      if (req.user.role === 'user') return badRequest(res,'Você não tem permissão para alterar logos.');
      const { id } = req.params;
      const unidade = await findUnidadeById(id);
      if(!unidade) return notFound(res,'Unidade não encontrada');

      // 1) JSON dataUrl (compat serverless ou clientes antigos apontando para /logo com JSON)
      const bodyDataUrl = req.body && typeof req.body.dataUrl === 'string' ? req.body.dataUrl : '';
      if (bodyDataUrl) {
        if (!/^data:image\/(png|jpe?g|webp|gif|bmp|svg\+xml);base64,/i.test(bodyDataUrl)) {
          return badRequest(res,'dataUrl inválido (esperado data:image/*;base64,...)');
        }
        const base64 = bodyDataUrl.split(',')[1] || '';
        if (!base64) return badRequest(res,'dataUrl sem conteúdo.');
        const approxBytes = Math.floor((base64.length * 3) / 4);
        if (approxBytes > 8 * 1024 * 1024) return badRequest(res,'Imagem acima de 8MB.');
        const buffer = Buffer.from(base64, 'base64');
        let uploaded;
        try {
          uploaded = await _processarEEnviarParaBlob(buffer, { keyPrefix: `unidades/${unidade._id}` });
        } catch (err) {
          if (err && err.code === 'BLOB_NOT_CONFIGURED') return badRequest(res, err.message);
          throw err;
        }
        // Remove anterior (best-effort) se era Blob
        try {
          if (unidade.logo && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(unidade.logo)) {
            await del(unidade.logo, uploaded.token ? { token: uploaded.token } : undefined);
          }
        } catch {}
        unidade.logo = uploaded.url;
        await saveUnidadeDoc(unidade);
        console.log('[API UNIDADES][uploadLogo] JSON dataUrl salvo em Blob');
        return ok(res, { uploaded: true, logo: unidade.logo });
      }

      // 2) Multipart (campo 'logo')
      console.log('[API UNIDADES][uploadLogo] handler multipart; hasFile=', !!req.file, 'size=', req.file?.size);
      let uploaded;
      try {
        uploaded = await _processarEEnviarParaBlob(req.file.buffer, { keyPrefix: `unidades/${unidade._id}` });
      } catch (err) {
        if (err && err.code === 'BLOB_NOT_CONFIGURED') return badRequest(res, err.message);
        throw err;
      }
      // Remove anterior (best-effort) se era Blob
      try {
        if (unidade.logo && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(unidade.logo)) {
          await del(unidade.logo, uploaded.token ? { token: uploaded.token } : undefined);
        }
      } catch {}
      unidade.logo = uploaded.url;
      await saveUnidadeDoc(unidade);
      return ok(res, { uploaded: true, logo: unidade.logo });
    } catch (e) {
      console.error('[API UNIDADES][uploadLogo] Erro:', e);
      return serverError(res, e);
    }
  }
];

// Upload inline via JSON (sem multipart), recebendo DataURL e reprocessando para webp padronizado
export async function uploadLogoUnidadeInline(req, res) {
  try {
    if (req.user.role === 'user') return badRequest(res,'Você não tem permissão para alterar logos.');
    const { id } = req.params;
    const { dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') return badRequest(res,'Parâmetro dataUrl obrigatório.');
    if (!/^data:image\/(png|jpe?g|webp|gif|bmp|svg\+xml);base64,/i.test(dataUrl)) {
      return badRequest(res,'dataUrl inválido (esperado data:image/*;base64,...)');
    }
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) return badRequest(res,'dataUrl sem conteúdo.');
    // Verificação de tamanho aproximado
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > 8 * 1024 * 1024) return badRequest(res,'Imagem acima de 8MB.');

    const buffer = Buffer.from(base64, 'base64');

    const unidade = await findUnidadeById(id);
    if(!unidade) return notFound(res,'Unidade não encontrada');

    let uploaded;
    try {
      uploaded = await _processarEEnviarParaBlob(buffer, { keyPrefix: `unidades/${unidade._id}` });
    } catch (err) {
      if (err && err.code === 'BLOB_NOT_CONFIGURED') return badRequest(res, err.message);
      throw err;
    }
    // Remove anterior (best-effort) se era Blob
    try {
      if (unidade.logo && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(unidade.logo)) {
        await del(unidade.logo, uploaded.token ? { token: uploaded.token } : undefined);
      }
    } catch {}
    unidade.logo = uploaded.url;
    await saveUnidadeDoc(unidade);

    console.log('[API UNIDADES][uploadLogoInline] atualizado com sucesso para unidade', id);
    return ok(res, { uploaded: true, logo: unidade.logo });
  } catch (e) {
    console.error('[API UNIDADES][uploadLogoInline] Erro:', e);
    return serverError(res, e);
  }
}
