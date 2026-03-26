import { createUnitScope } from '#shared/unitScope.js';
import {
  findSetorByIdRepo,
  findSetorDupByNomeNormalizadoExcludingIdRepo,
} from '#modules/gestor/app/repositories/SetorReadRepository.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function normalizeSetorNome(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function updateSetorScopedService({ setorId, canonicalUnitId = null, changes = {} }) {
  const scopedUnitId = normalizeUnitId(canonicalUnitId) || null;
  const unitScope = scopedUnitId
    ? createUnitScope({ unidadeId: scopedUnitId })
    : { type: 'global', unidadeId: null };

  const setor = await findSetorByIdRepo({
    unitScope,
    id: setorId,
    unidadeId: scopedUnitId,
  });

  if (!setor) {
    return { kind: 'not_found' };
  }

  const { nome, descricao } = changes;

  if (nome) {
    const nomeNormalizado = normalizeSetorNome(nome);
    const duplicado = await findSetorDupByNomeNormalizadoExcludingIdRepo({
      unitScope: createUnitScope({ unidadeId: String(setor.unidade_id) }),
      setorId: setor._id,
      unidadeId: setor.unidade_id,
      nomeNormalizado,
    });

    if (duplicado) {
      return { kind: 'duplicate_name' };
    }

    setor.nome = nome;
    setor.nome_normalizado = nomeNormalizado;
  }

  setor.descricao = descricao || '';
  await setor.save();

  return { kind: 'updated' };
}

export default updateSetorScopedService;