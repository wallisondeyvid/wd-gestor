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
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { validarCnpj, calcularDigitoVerificador } from '#modules/gestor/app/utils/cnpj.js';
import {
  ensureUnitProvisioned,
  inspectUnitProvisioning,
  listUnitProvisioningAuditEvents,
  isUnitProvisioningValidationError,
  retryUnitProvisioning,
} from '#modules/gestor/app/services/UnitProvisioningService.js';
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

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function isPrivilegedGestorUser(user) {
  return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function getScopedUnitId(req) {
  return normalizeUnitId(req?.unitScope?.unidadeId);
}

async function loadScopedUnitAccessContext(req) {
  const scopedUnitId = getScopedUnitId(req);
  if (!scopedUnitId) {
    return {
      scopedUnitId: '',
      scopedUnit: null,
      principalUnitId: '',
    };
  }

  const [scopedUnit, scopedUnitBase] = await Promise.all([
    findUnidadeByIdLean(scopedUnitId),
    findUnidadeUserBaseLean(scopedUnitId),
  ]);

  const principalUnitId = normalizeUnitId(
    scopedUnitBase?.is_principal
      ? scopedUnitBase?._id
      : scopedUnitBase?.unidade_principal_id || scopedUnitBase?.matriz_id || scopedUnitId,
  );

  return {
    scopedUnitId,
    scopedUnit,
    principalUnitId,
  };
}

async function loadScopedAccessibleUnidades(req) {
  const scopedContext = await loadScopedUnitAccessContext(req);
  if (!scopedContext.scopedUnitId) {
    return {
      ...scopedContext,
      unidades: [],
    };
  }

  let unidades = scopedContext.principalUnitId
    ? await findUnidadesByCondLeanFull({
      $or: [
        { _id: scopedContext.principalUnitId },
        { unidade_principal_id: scopedContext.principalUnitId },
        { matriz_id: scopedContext.principalUnitId },
      ],
    })
    : [];

  if ((!unidades || unidades.length === 0) && scopedContext.scopedUnit) {
    unidades = [scopedContext.scopedUnit];
  }

  return {
    ...scopedContext,
    unidades,
  };
}

async function resolveRequestedPrincipalUnitId(req, requestedPrincipalUnitId = '', fallbackPrincipalUnitId = '') {
  const scopedContext = await loadScopedUnitAccessContext(req);
  const requestedPrincipalId = normalizeUnitId(requestedPrincipalUnitId);
  const fallbackPrincipalId = normalizeUnitId(fallbackPrincipalUnitId);
  const scopedPrincipalId = normalizeUnitId(scopedContext.principalUnitId);

  if (requestedPrincipalId && scopedPrincipalId && requestedPrincipalId !== scopedPrincipalId) {
    return { ok: false, principalUnitId: '', scopedContext };
  }

  return {
    ok: true,
    principalUnitId: scopedPrincipalId || requestedPrincipalId || fallbackPrincipalId,
    scopedContext,
  };
}

// Lista unidades acessíveis ao usuário atual (fallback JSON para hidratar a página quando o SSR vier vazio)
export async function listUnidades(req, res) {
  try {
    // Modo sem DB: retorna lista vazia para evitar 500
    if (req?.app?.locals?.skipDb) {
      return ok(res, { unidades: [], principalUnits: [] });
    }
    const user = req.user || {};
    const scopedContext = await loadScopedAccessibleUnidades(req);
    const isMaster = isPrivilegedGestorUser(user);
    let unidades = [];
    if (scopedContext.scopedUnitId) {
      unidades = scopedContext.unidades;
    } else if (isMaster) {
      unidades = await findAllUnidadesLean();
    } else {
      unidades = [];
    }
    // Normalizações leves para manter compat em front
    const safe = (unidades || []).map((u) => {
      const plain = u?.toObject ? u.toObject() : { ...u };
      return {
        ...plain,
        naturezaJuridica: plain.naturezaJuridica || '',
        modulosAcessiveis: Array.isArray(plain.modulosAcessiveis) ? plain.modulosAcessiveis : [],
        apiBancaria: buildApiBancariaForResponse(plain.apiBancaria),
      };
    });
    let principalUnits = safe.filter(u => u.is_principal);
    if (!principalUnits.length && scopedContext.principalUnitId) {
      principalUnits = safe.filter((u) => normalizeUnitId(u?._id) === scopedContext.principalUnitId);
    }
    if (!principalUnits.length && scopedContext.scopedUnitId) {
      principalUnits = safe.filter((u) => normalizeUnitId(u?._id) === scopedContext.scopedUnitId);
    }
    // Se não houver principais explícitas, tenta inferir por subunidade=false
    if (!principalUnits.length) principalUnits = safe.filter(u => u.subunidade === false || u.subunidade === 'false');
    return ok(res, { unidades: safe, principalUnits });
  } catch (e) {
    console.error('[API UNIDADES][list] Erro:', e);
    return ok(res, { unidades: [], principalUnits: [] });
  }
}

function resolveTipoUnidadeProvisionada(unidade) {
  if (unidade?.is_principal) return 'principal';
  if (unidade?.subunidade) return 'subunidade';
  return 'filial';
}

async function ensureCanAccessUnidade(req, unidadeId) {
  const scopedContext = await loadScopedAccessibleUnidades(req);
  if (scopedContext.scopedUnitId) {
    const permitidoIds = new Set((scopedContext.unidades || []).map((u) => normalizeUnitId(u?._id)).filter(Boolean));
    if (permitidoIds.size > 0) {
      return permitidoIds.has(normalizeUnitId(unidadeId));
    }

    return normalizeUnitId(unidadeId) === scopedContext.scopedUnitId;
  }

  if (isPrivilegedGestorUser(req?.user)) return true;

  return false;
}

function normalizeProvisioningSnapshotResponse(snapshot) {
  const safeSnapshot = (snapshot && typeof snapshot === 'object') ? snapshot : {};
  const modulosIds = Array.isArray(safeSnapshot.modulosHabilitados)
    ? safeSnapshot.modulosHabilitados.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const modulosDisplay = Array.isArray(safeSnapshot.modulosHabilitadosDisplay)
    ? safeSnapshot.modulosHabilitadosDisplay.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    ...safeSnapshot,
    modulosHabilitados: modulosIds,
    modulosHabilitadosDisplay: modulosDisplay.length > 0 ? modulosDisplay : modulosIds,
  };
}

function normalizeRetryModulesInput(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const normalized = [];
  const known = new Set();

  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;

    const tokens = text
      .split(',')
      .map((token) => String(token || '').trim())
      .filter(Boolean);

    for (const token of tokens) {
      if (known.has(token)) continue;
      known.add(token);
      normalized.push(token);
    }
  }

  return normalized;
}

function resolveRetryModulesFromRequest(req) {
  const modules = [];
  const known = new Set();

  const collect = (value) => {
    const normalizedValues = normalizeRetryModulesInput(value);
    for (const item of normalizedValues) {
      if (known.has(item)) continue;
      known.add(item);
      modules.push(item);
    }
  };

  collect(req?.body?.modulo);
  collect(req?.body?.moduloKey);
  collect(req?.body?.moduleKey);
  collect(req?.body?.modulosRetry);
  collect(req?.body?.modulosRetryKeys);
  collect(req?.query?.modulo);
  collect(req?.query?.moduloKey);
  collect(req?.query?.moduleKey);
  collect(req?.query?.modulosRetry);
  collect(req?.query?.modulosRetryKeys);

  return modules;
}

function normalizeProvisioningEventsLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return 100;
  }

  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(Math.trunc(parsed), 500);
}

function normalizeProvisioningEventsScope(rawScope) {
  const normalized = String(rawScope || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'unit' || normalized === 'module') return normalized;
  return null;
}

function normalizeProvisioningEventsModuleKey(rawModuleKey) {
  const normalized = String(rawModuleKey || '').trim();
  return normalized || null;
}

function normalizeProvisioningEventsOperation(rawOperation) {
  const normalized = String(rawOperation || '').trim().toLowerCase();
  return normalized || null;
}

function normalizeProvisioningEventsStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'started' || normalized === 'success' || normalized === 'error' || normalized === 'info') {
    return normalized;
  }
  return null;
}

function normalizeProvisioningEventsBefore(rawBefore) {
  const raw = String(rawBefore || '').trim();
  if (!raw) return null;

  const [rawDate, rawEventId = ''] = raw.split('|', 2);
  const dateText = String(rawDate || '').trim();
  if (!dateText) return null;

  const parsedDate = new Date(dateText);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const eventId = String(rawEventId || '').trim().toLowerCase();
  if (eventId && !/^[a-f\d]{24}$/i.test(eventId)) return null;

  return eventId
    ? `${parsedDate.toISOString()}|${eventId}`
    : parsedDate.toISOString();
}

function buildProvisioningEventsNextBefore(events = []) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const last = events[events.length - 1] || {};
  const createdAt = last?.createdAt ? new Date(last.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null;

  const eventId = String(last?.eventId || '').trim().toLowerCase();
  if (!eventId) return createdAt.toISOString();
  return `${createdAt.toISOString()}|${eventId}`;
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
    const modulosSelecionados = Array.isArray(modulosAcessiveis)
      ? modulosAcessiveis
      : (modulosAcessiveis ? [modulosAcessiveis] : []);
    const resolvedPrincipal = await resolveRequestedPrincipalUnitId(req, unidadePrincipal);
    if (!resolvedPrincipal.ok) return badRequest(res, 'Acesso à unidade não autorizado.');
    const effectivePrincipalUnitId = resolvedPrincipal.principalUnitId;

    if (isSubunidade && !effectivePrincipalUnitId) return badRequest(res, 'Uma subunidade deve ter uma unidade principal associada.');
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
      if (isSubunidade && !effectivePrincipalUnitId) return badRequest(res, 'Subunidade precisa de unidade principal.');
      if (isSubunidade) cleanedCnpj = null;
      if (cleanedCnpj && cleanedCnpj.length !== 14) return badRequest(res, 'CNPJ é obrigatório para Pessoa Jurídica e deve ter 14 dígitos.');
      const cnpjExistente = await findUnidadeByCnpj(cleanedCnpj);
      if (cnpjExistente) return badRequest(res, 'CNPJ já cadastrado no banco de dados.');
    }

    let finalCnpj = cleanedCnpj;
    if (pessoaTipo === 'pj' && isSubunidade) {
      const canAccessPrincipal = await ensureCanAccessUnidade(req, effectivePrincipalUnitId);
      if (!canAccessPrincipal) return badRequest(res, 'Acesso à unidade não autorizado.');
      const unidadePrincipalDoc = await findUnidadeById(effectivePrincipalUnitId);
      if (!unidadePrincipalDoc || !unidadePrincipalDoc.is_principal) return badRequest(res, 'Unidade principal inválida.');
      const baseCnpj = (unidadePrincipalDoc.cnpj || '').replace(/\D/g, '').slice(0, 8);
      if (baseCnpj.length !== 8) return badRequest(res, 'CNPJ da unidade principal inválido.');
      const existingSubunidades = await findSubunidadesByUnidadePrincipal(effectivePrincipalUnitId);
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

    const novaUnidade = await createUnidadeDoc({
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
      unidade_principal_id: isSubunidade ? effectivePrincipalUnitId : null,
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
      modulosAcessiveis: modulosSelecionados,
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

    const tipoUnidadeProvisionada = resolveTipoUnidadeProvisionada({
      is_principal: isPrincipal,
      subunidade: isSubunidade,
    });
    await ensureUnitProvisioned({
      unidadeId: unidadeSalva._id,
      tipo: tipoUnidadeProvisionada,
      modulosHabilitados: modulosSelecionados,
    });

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
    const canAccessUnidade = await ensureCanAccessUnidade(req, unidadeExistente._id);
    if (!canAccessUnidade) return badRequest(res, 'Acesso à unidade não autorizado.');

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
    const resolvedPrincipal = await resolveRequestedPrincipalUnitId(
      req,
      unidadePrincipal,
      subunidade === 'true' ? unidadeExistente.unidade_principal_id : '',
    );
    if (!resolvedPrincipal.ok) return badRequest(res, 'Acesso à unidade não autorizado.');
    const effectivePrincipalUnitId = subunidade === 'true' ? resolvedPrincipal.principalUnitId : null;

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

    if (effectivePrincipalUnitId) {
      const canAccessPrincipal = await ensureCanAccessUnidade(req, effectivePrincipalUnitId);
      if (!canAccessPrincipal) return badRequest(res, 'Acesso à unidade não autorizado.');
      const unidadePrincipalDoc = await findUnidadeById(effectivePrincipalUnitId);
      if (!unidadePrincipalDoc || !unidadePrincipalDoc.is_principal) return badRequest(res, 'Unidade principal inválida.');
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
      unidade_principal_id: effectivePrincipalUnitId,
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
export async function toggleAccessUnidades(req, res) {
  try {
    if (req.user.role === 'user') return badRequest(res,'Você não tem permissão para alterar o acesso de unidades.');

    const { unitIds, activate } = req.body;
    if (!Array.isArray(unitIds) || typeof activate !== 'boolean') return badRequest(res,'Parâmetros inválidos.');

    const normalizedUnitIds = [...new Set(unitIds.map((unitId) => normalizeUnitId(unitId)).filter(Boolean))];
    if (normalizedUnitIds.length === 0) return badRequest(res,'Parâmetros inválidos.');

    const accessChecks = await Promise.all(normalizedUnitIds.map((unitId) => ensureCanAccessUnidade(req, unitId)));
    if (accessChecks.some((canAccess) => !canAccess)) {
      return badRequest(res,'Acesso à unidade não autorizado.');
    }

    if (req.user.role === 'diretor') {
      const unidadesPrincipais = await findUnidadesPrincipaisByIds(normalizedUnitIds);
      if (unidadesPrincipais.length > 0) return badRequest(res,'Diretores não podem alterar o acesso de unidades principais.');
    }

    const result = await updateManyUnidadesAccessByIds(normalizedUnitIds, activate);
    if (result.modifiedCount === 0) return badRequest(res,'Nenhuma unidade atualizada.');

    return ok(res, { newStatus: activate });
  } catch (error) {
    console.error('[API UNIDADES][toggle-access] Erro:', error);
    return serverError(res, error);
  }
}
export async function getUnidadeById(req, res) { try { const unidadeId = req.params.id; const unidade = await findUnidadeById(unidadeId); if (!unidade) return notFound(res,'Unidade não encontrada'); const canAccess = await ensureCanAccessUnidade(req, unidade._id); if (!canAccess) return badRequest(res,'Acesso à unidade não autorizado');
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
    const canAccess = await ensureCanAccessUnidade(req, req.params.id);
    if (!canAccess) return badRequest(res,'Acesso à unidade não autorizado');
    const unidade = await findUnidadeByIdWithModulosAcessiveis(req.params.id);
    if (!unidade) return notFound(res,'Unidade não encontrada');
    const payload = (unidade.modulosAcessiveis || []).map(m => ({ _id: m._id, nome: m.nome, status: m.status }));
    return ok(res, payload);
  } catch (e) {
    console.error('[API UNIDADES][getModulos] Erro:', e);
    return serverError(res, e);
  }
}

export async function getUnidadeProvisioningStatus(req, res) {
  try {
    const unidadeId = String(req.params.id || '').trim();
    if (!unidadeId) return badRequest(res, 'ID da unidade e obrigatorio.');

    const unidade = await findUnidadeById(unidadeId);
    if (!unidade) return notFound(res, 'Unidade nao encontrada');

    const canAccess = await ensureCanAccessUnidade(req, unidade._id);
    if (!canAccess) return badRequest(res, 'Acesso a unidade nao autorizado');

    const snapshot = await inspectUnitProvisioning({ unidadeId: unidade._id });
    return ok(res, normalizeProvisioningSnapshotResponse(snapshot));
  } catch (error) {
    console.error('[API UNIDADES][inspectProvisioning] Erro:', error);
    return serverError(res, error);
  }
}

export async function getUnidadeProvisioningEvents(req, res) {
  try {
    const unidadeId = String(req.params.id || '').trim();
    if (!unidadeId) return badRequest(res, 'ID da unidade e obrigatorio.');

    const unidade = await findUnidadeById(unidadeId);
    if (!unidade) return notFound(res, 'Unidade nao encontrada');

    const canAccess = await ensureCanAccessUnidade(req, unidade._id);
    if (!canAccess) return badRequest(res, 'Acesso a unidade nao autorizado');

    const limit = normalizeProvisioningEventsLimit(req.query?.limit);
    if (limit === null) {
      return badRequest(res, 'Parametro limit invalido. Use inteiro positivo.');
    }

    const scopeRaw = req.query?.scope;
    const scope = normalizeProvisioningEventsScope(scopeRaw);
    if (scopeRaw !== undefined && scopeRaw !== null && String(scopeRaw).trim() !== '' && !scope) {
      return badRequest(res, 'Parametro scope invalido. Use unit ou module.');
    }

    const moduleKey = normalizeProvisioningEventsModuleKey(req.query?.moduleKey);
    const operation = normalizeProvisioningEventsOperation(req.query?.operation);

    const statusRaw = req.query?.status;
    const status = normalizeProvisioningEventsStatus(statusRaw);
    if (statusRaw !== undefined && statusRaw !== null && String(statusRaw).trim() !== '' && !status) {
      return badRequest(res, 'Parametro status invalido. Use started, success, error ou info.');
    }

    const beforeRaw = req.query?.before;
    const before = normalizeProvisioningEventsBefore(beforeRaw);
    if (beforeRaw !== undefined && beforeRaw !== null && String(beforeRaw).trim() !== '' && !before) {
      return badRequest(res, 'Parametro before invalido. Use ISO date ou ISO|eventId.');
    }

    const queryLimit = limit + 1;

    const queriedEvents = await listUnitProvisioningAuditEvents({
      unidadeId: unidade._id,
      limit: queryLimit,
      scope,
      moduleKey,
      operation,
      status,
      before,
    });

    const hasMore = queriedEvents.length > limit;
    const events = hasMore ? queriedEvents.slice(0, limit) : queriedEvents;
    const nextBefore = hasMore ? buildProvisioningEventsNextBefore(events) : null;

    return ok(res, {
      unidadeId: String(unidade._id),
      filters: {
        limit,
        scope: scope || null,
        moduleKey,
        operation,
        status,
        before,
      },
      pagination: {
        hasMore,
        nextBefore,
      },
      total: events.length,
      events,
    });
  } catch (error) {
    console.error('[API UNIDADES][listProvisioningEvents] Erro:', error);
    return serverError(res, error);
  }
}

export async function retryUnidadeProvisioning(req, res) {
  try {
    if (req.user.role === 'user') {
      return badRequest(res, 'Voce nao tem permissao para reprocessar provisioning de unidades.');
    }

    const unidadeId = String(req.params.id || '').trim();
    if (!unidadeId) return badRequest(res, 'ID da unidade e obrigatorio.');

    const unidade = await findUnidadeById(unidadeId);
    if (!unidade) return notFound(res, 'Unidade nao encontrada');

    const canAccess = await ensureCanAccessUnidade(req, unidade._id);
    if (!canAccess) return badRequest(res, 'Acesso a unidade nao autorizado');

    const modulosRetry = resolveRetryModulesFromRequest(req);

    const retryResult = await retryUnitProvisioning({
      unidadeId: unidade._id,
      tipo: resolveTipoUnidadeProvisionada(unidade),
      modulosHabilitados: Array.isArray(unidade.modulosAcessiveis) ? unidade.modulosAcessiveis : [],
      modulosRetry,
    });

    return ok(res, retryResult);
  } catch (error) {
    if (isUnitProvisioningValidationError(error)) {
      return badRequest(res, String(error?.message || 'Solicitacao de retry seletivo invalida.'));
    }

    console.error('[API UNIDADES][retryProvisioning] Erro:', error);
    return serverError(res, error);
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
export async function deleteUnidade(req, res) { try { const unidadeId = req.params.id; if (req.user.role === 'user') return badRequest(res,'Você não tem permissão para excluir unidades.'); const unidade = await findUnidadeById(unidadeId); if (!unidade) return notFound(res,'Unidade não encontrada'); const canAccess = await ensureCanAccessUnidade(req, unidade._id); if (!canAccess) return badRequest(res,'Acesso à unidade não autorizado.'); if (unidade.is_principal) { if (req.user.role === 'diretor') return badRequest(res,'Diretores não podem excluir unidades principais.'); if (!req.user.isMaster) return badRequest(res,'Apenas Master pode excluir unidades principais'); } await deleteUnidadeById(unidadeId); return ok(res, { deleted:true, id:unidadeId }); } catch (error) { console.error('[API UNIDADES][delete] Erro:', error); return serverError(res, error); } }

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
    const canAccess = await ensureCanAccessUnidade(req, id);
    if (!canAccess) return badRequest(res, 'Acesso à unidade não autorizado.');
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
      const canAccess = await ensureCanAccessUnidade(req, unidade._id);
      if (!canAccess) return badRequest(res, 'Acesso à unidade não autorizado.');

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
  const canAccess = await ensureCanAccessUnidade(req, unidade._id);
  if (!canAccess) return badRequest(res, 'Acesso à unidade não autorizado.');

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
