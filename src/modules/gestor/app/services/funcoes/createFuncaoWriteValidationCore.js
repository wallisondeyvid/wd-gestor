export function createFuncaoWriteValidationCore({
  findFuncaoByNome,
  findOutraFuncaoByNomeExcludingId,
  findUnidadeByIdWithModulosAcessiveis,
  normalizarListaModulos,
} = {}) {
  function defaultNormalizarListaModulos(input) {
    if (input === undefined || input === null) return [];
    if (Array.isArray(input)) return input.filter(Boolean);
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return [trimmed];
        }
      }
      if (trimmed.includes(',')) return trimmed.split(',').map((value) => value.trim()).filter(Boolean);
      return [trimmed];
    }
    return [];
  }

  const normalizeModuloList = typeof normalizarListaModulos === 'function'
    ? normalizarListaModulos
    : defaultNormalizarListaModulos;

  async function validateCreate({ nome, descricao, canonicalPrincipalUnitId, modulosHabilitados } = {}) {
    const dup = await findFuncaoByNome(nome, canonicalPrincipalUnitId || null);
    if (dup) {
      return { error: 'Função já cadastrada' };
    }

    const unidade = await findUnidadeByIdWithModulosAcessiveis(canonicalPrincipalUnitId || null);
    if (!unidade) {
      return { error: 'Unidade inválida' };
    }

    const lista = normalizeModuloList(modulosHabilitados);
    const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
    const modsFiltrados = lista.filter((id) => permitidos.has(String(id)));

    return {
      data: {
        nome,
        descricao,
        unidade_principal_id: canonicalPrincipalUnitId,
        modulos_habilitados: modsFiltrados,
      },
    };
  }

  async function validateUpdate({
    id,
    nome,
    descricao,
    unidade_principal_id,
    modulos_habilitados,
    contextPrincipalUnitId,
    existente,
    normalizeUnitId,
  } = {}) {
    const unidadePrincipalExistenteId = normalizeUnitId(existente?.unidade_principal_id);
    const targetPrincipalUnitId = contextPrincipalUnitId || normalizeUnitId(unidade_principal_id || unidadePrincipalExistenteId);

    if (nome && nome !== existente?.nome) {
      const dup = await findOutraFuncaoByNomeExcludingId(
        id,
        nome,
        targetPrincipalUnitId || unidadePrincipalExistenteId || null,
      );
      if (dup) return { error: 'Já existe uma função com este nome' };
    }

    const updates = {};
    if (nome) updates.nome = nome;
    if (descricao !== undefined) updates.descricao = descricao;

    if (targetPrincipalUnitId) {
      const unidade = await findUnidadeByIdWithModulosAcessiveis(targetPrincipalUnitId);
      if (!unidade) return { error: 'Unidade inválida' };

      updates.unidade_principal_id = targetPrincipalUnitId;
      if (modulos_habilitados !== undefined) {
        const lista = normalizeModuloList(modulos_habilitados);
        const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
        updates.modulos_habilitados = lista.filter((moduloId) => permitidos.has(String(moduloId)));
      }
    } else if (modulos_habilitados !== undefined) {
      const unidade = await findUnidadeByIdWithModulosAcessiveis(unidadePrincipalExistenteId);
      const lista = normalizeModuloList(modulos_habilitados);
      const permitidos = new Set((unidade.modulosAcessiveis || []).map((modulo) => String(modulo._id)));
      updates.modulos_habilitados = lista.filter((moduloId) => permitidos.has(String(moduloId)));
    }

    return {
      data: updates,
      targetPrincipalUnitId: targetPrincipalUnitId || unidadePrincipalExistenteId || null,
    };
  }

  return {
    validateCreate,
    validateUpdate,
  };
}

export default createFuncaoWriteValidationCore;