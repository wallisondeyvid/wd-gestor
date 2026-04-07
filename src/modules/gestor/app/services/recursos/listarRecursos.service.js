import { createRecursoContextPolicyCore } from '#modules/gestor/app/services/recursos/createRecursoContextPolicyCore.js';
import {
  findRecursosByFiltroComUnidadeLeanFromDb,
  findUnidadeUserBaseLean,
  findUnidadesByCondLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

const recursoContextPolicy = createRecursoContextPolicyCore({
  findUnidadeUserBaseLean,
  findUnidadesByCondLean,
});

export async function findRecursosByFiltroComUnidadeService(filtro) {
  return findRecursosByFiltroComUnidadeLeanFromDb(filtro);
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
  const context = {
    currentUser: user || null,
    sessionUser: session?.user || null,
    scopedUnitId: unitScope?.unidadeId || null,
  };
  let placaTermNorm = null;

  if (placa && placa.length >= 2) {
    placaTermNorm = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  const scope = await recursoContextPolicy.buildListScope({
    ...context,
    requestedUnitId: query?.unidadeId || null,
  });
  if (scope.blocked) {
    return { blocked: true, data: null };
  }
  if (scope.empty) {
    return { blocked: false, data: [] };
  }

  const filtro = scope.filter || {};

  let recursos = await findRecursosByFiltroComUnidadeService(filtro);

  if (placaTermNorm) {
    recursos = recursos.filter((recurso) => (
      (recurso.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().includes(placaTermNorm)
    ));
  }

  return { blocked: false, data: recursos.map(mapRecurso) };
}