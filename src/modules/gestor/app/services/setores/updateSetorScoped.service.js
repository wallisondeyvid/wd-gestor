import {
  findSetorById,
  findSetorDupByNomeNormalizadoExcludingId,
  saveSetor,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function normalizeSetorNome(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function updateSetorScopedService({ setorId, canonicalUnitId = null, changes = {} }) {
  const scopedUnitId = normalizeUnitId(canonicalUnitId) || null;
  const setor = await findSetorById(setorId, scopedUnitId);

  if (!setor) {
    return { kind: 'not_found' };
  }

  const { nome, descricao } = changes;

  if (nome) {
    const nomeNormalizado = normalizeSetorNome(nome);
    const duplicado = await findSetorDupByNomeNormalizadoExcludingId(
      setor._id,
      setor.unidade_id,
      nomeNormalizado,
    );

    if (duplicado) {
      return { kind: 'duplicate_name' };
    }

    setor.nome = nome;
    setor.nome_normalizado = nomeNormalizado;
  }

  setor.descricao = descricao || '';
  await saveSetor(setor);

  return { kind: 'updated' };
}

export default updateSetorScopedService;