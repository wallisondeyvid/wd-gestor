import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';
import { findRecursosByFiltroComUnidadeLeanRepo } from '#modules/gestor/app/repositories/RecursoReadRepository.js';
import {
  findUnidadeUserBaseLeanRepo,
  findUnidadesByCondLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function isMasterOrAdmin(user) {
  return user?.isMaster || user?.role === 'admin';
}

function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = normalizeUnitId(unidadeId);
  return unidadeIdNorm && mongoose.isValidObjectId(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

function extractSingleScopedUnitId(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const inValues = Array.isArray(value.$in)
    ? [...new Set(value.$in.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];

  return inValues.length === 1 ? inValues[0] : '';
}

function scopeFromRecursoListFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) return GLOBAL_SCOPE;

  const unidadeId = extractSingleScopedUnitId(filtro?.unidade_id);
  return unidadeId ? scopeFromUnidadeId(unidadeId) : GLOBAL_SCOPE;
}

function getCanonicalContextUnitId({ user, session, unitScope }) {
  return normalizeUnitId(unitScope?.unidadeId || user?.unidade_id || session?.user?.unidade_id);
}

function shouldBlockForMissingContext({ user, session, unitScope }) {
  return !isMasterOrAdmin(user) && !getCanonicalContextUnitId({ user, session, unitScope });
}

function extractScopedClusterAnchorFromUnidadesCond(cond) {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) return '';

  const clauses = Array.isArray(cond.$or) ? cond.$or : null;
  if (!clauses || clauses.length !== 3) return '';

  const allowedKeys = new Set(['_id', 'unidade_principal_id', 'matriz_id']);
  const matchedKeys = new Set();
  const anchors = new Set();

  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object' || Array.isArray(clause)) return '';

    const entries = Object.entries(clause)
      .map(([key, value]) => [key, String(value || '').trim()])
      .filter(([, value]) => value);

    if (entries.length !== 1) return '';

    const [key, value] = entries[0];
    if (!allowedKeys.has(key)) return '';

    matchedKeys.add(key);
    anchors.add(value);
  }

  if (matchedKeys.size !== 3 || anchors.size !== 1) return '';
  return [...anchors][0];
}

async function findUnidadeUserBaseLean(id) {
  return findUnidadeUserBaseLeanRepo({ unitScope: scopeFromUnidadeId(id), id });
}

async function findUnidadesByCondLean(cond) {
  const anchor = extractScopedClusterAnchorFromUnidadesCond(cond);
  return findUnidadesByCondLeanRepo({
    unitScope: anchor ? scopeFromUnidadeId(anchor) : GLOBAL_SCOPE,
    cond,
  });
}

export async function findRecursosByFiltroComUnidadeService(filtro) {
  return findRecursosByFiltroComUnidadeLeanRepo({
    unitScope: scopeFromRecursoListFiltro(filtro),
    filtro,
  });
}

function mapRecurso(recurso) {
  return {
    id: recurso._id,
    _id: recurso._id,
    placa: recurso.placa,
    tipo: recurso.tipo,
    marca: recurso.marca,
    modelo: recurso.modelo,
    ano: recurso.ano,
    mod: recurso.mod,
    cor: recurso.cor,
    ativo: recurso.ativo,
    unidade_id: recurso.unidade_id
      ? { _id: recurso.unidade_id._id, codigo: recurso.unidade_id.codigo, nome: recurso.unidade_id.nome }
      : null,
    descricao: [recurso.marca, recurso.modelo].filter(Boolean).join(' ') || recurso.modelo || recurso.marca || '',
    unidadeFormatada: recurso.unidade_id
      ? ((recurso.unidade_id.codigo ? recurso.unidade_id.codigo + ' - ' : '') + (recurso.unidade_id.nome || ''))
      : '',
  };
}

export async function listarRecursosService({ query, user, session, unitScope }) {
  const placa = String(query?.placa || '').trim();
  const unidadeId = String(query?.unidadeId || '').trim();

  if (shouldBlockForMissingContext({ user, session, unitScope })) {
    return { blocked: true, data: null };
  }

  const scopedUnitId = getCanonicalContextUnitId({ user, session, unitScope });
  const filtro = {};
  let placaTermNorm = null;

  if (placa && placa.length >= 2) {
    placaTermNorm = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  if (isMasterOrAdmin(user)) {
    if (unidadeId) {
      filtro.unidade_id = unidadeId;
    }
  } else {
    let principalId = null;
    const anchorUnitId = scopedUnitId;

    if (!anchorUnitId) {
      return { blocked: false, data: [] };
    }

    const unidadeAnchor = await findUnidadeUserBaseLean(anchorUnitId);
    if (unidadeAnchor) {
      principalId = unidadeAnchor.is_principal
        ? unidadeAnchor._id
        : (unidadeAnchor.unidade_principal_id || unidadeAnchor.matriz_id || unidadeAnchor._id);
    }

    const cond = principalId
      ? { $or: [{ _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId }] }
      : { _id: anchorUnitId || null };
    const unidadesAcessiveis = await findUnidadesByCondLean(cond);
    const ids = unidadesAcessiveis.map((unidade) => String(unidade._id));

    if (unidadeId) {
      if (!ids.includes(String(unidadeId))) {
        return { blocked: false, data: [] };
      }
      filtro.unidade_id = unidadeId;
    } else {
      filtro.unidade_id = { $in: ids };
    }
  }

  let recursos = await findRecursosByFiltroComUnidadeService(filtro);

  if (placaTermNorm) {
    recursos = recursos.filter((recurso) => (
      (recurso.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().includes(placaTermNorm)
    ));
  }

  return { blocked: false, data: recursos.map(mapRecurso) };
}