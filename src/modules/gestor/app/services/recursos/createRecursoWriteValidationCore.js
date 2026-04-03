export function createRecursoWriteValidationCore({
  findRecursosByFiltroComUnidadeLean,
  findOutroRecursoByPlacaUpper,
  findOutroRecursoByChassiUpper,
  findOutroRecursoByRenavam,
} = {}) {
  const placaRegexAntiga = /^[A-Z]{3}-[0-9]{4}$/;
  const placaRegexMercosul = /^[A-Z]{3}-[0-9][A-Z][0-9]{2}$/;

  function normalizePlaca(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeChassi(value) {
    return String(value || '').trim().toUpperCase();
  }

  function ensurePlacaFormat(placa) {
    const normalizedPlaca = normalizePlaca(placa);
    if (!normalizedPlaca) return { ok: true, normalizedPlaca: '' };

    const isValid = placaRegexAntiga.test(normalizedPlaca) || placaRegexMercosul.test(normalizedPlaca);
    if (!isValid) return { ok: false, error: 'invalid_placa_format' };

    return { ok: true, normalizedPlaca };
  }

  async function validateCreate({ requestedUnitId, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor }) {
    const placaResult = ensurePlacaFormat(placa);
    if (!placaResult.ok) return { error: placaResult.error };

    const normalizedPlaca = placaResult.normalizedPlaca;
    const normalizedChassi = normalizeChassi(chassi);

    if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, placa: normalizedPlaca })).length > 0) {
      return { error: 'duplicate_placa' };
    }
    if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, chassi: normalizedChassi })).length > 0) {
      return { error: 'duplicate_chassi' };
    }
    if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, renavam })).length > 0) {
      return { error: 'duplicate_renavam' };
    }

    return {
      data: {
        unidade_id: requestedUnitId,
        tipo,
        placa: normalizedPlaca,
        chassi: normalizedChassi,
        renavam,
        ano: parseInt(ano),
        mod: parseInt(mod),
        marca,
        modelo,
        cor,
        ativo: true,
      },
    };
  }

  async function validateUpdate({ id, unidadeEfetiva, recurso, tipo, placa, chassi, renavam, ano, mod, marca, modelo, cor, ativo }) {
    const placaResult = placa ? ensurePlacaFormat(placa) : { ok: true, normalizedPlaca: recurso?.placa || '' };
    if (!placaResult.ok) return { error: placaResult.error };

    const normalizedPlaca = placa ? placaResult.normalizedPlaca : recurso.placa;
    const normalizedChassi = chassi ? normalizeChassi(chassi) : recurso.chassi;

    if (placa && normalizedPlaca !== recurso.placa && await findOutroRecursoByPlacaUpper(id, normalizedPlaca, unidadeEfetiva)) {
      return { error: 'duplicate_placa' };
    }
    if (chassi && normalizedChassi !== recurso.chassi && await findOutroRecursoByChassiUpper(id, normalizedChassi, unidadeEfetiva)) {
      return { error: 'duplicate_chassi' };
    }
    if (renavam && renavam !== recurso.renavam && await findOutroRecursoByRenavam(id, renavam, unidadeEfetiva)) {
      return { error: 'duplicate_renavam' };
    }

    return {
      data: {
        unidade_id: unidadeEfetiva,
        tipo,
        placa: normalizedPlaca,
        chassi: normalizedChassi,
        renavam,
        ano: ano ? parseInt(ano) : recurso.ano,
        mod: mod ? parseInt(mod) : recurso.mod,
        marca,
        modelo,
        cor,
        ativo: ativo !== undefined ? ativo : recurso.ativo,
      },
    };
  }

  return {
    ensurePlacaFormat,
    validateCreate,
    validateUpdate,
  };
}

export default createRecursoWriteValidationCore;