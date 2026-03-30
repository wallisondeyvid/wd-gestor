export async function processBulkUpdateFuncoesItems({
  itens,
  contextPrincipalUnitId,
  findFuncaoById,
  saveFuncao,
  normalizeUnitId,
}) {
  const results = [];
  let updated = 0;

  for (const item of itens) {
    const id = item?._id || item?.id;
    if (!id) {
      results.push({ ok: false, motivo: 'Sem _id' });
      continue;
    }

    const funcao = await findFuncaoById(id, contextPrincipalUnitId || null);
    if (!funcao) {
      results.push({ _id: id, ok: false, motivo: 'Nao encontrada' });
      continue;
    }

    if (contextPrincipalUnitId && normalizeUnitId(funcao.unidade_principal_id) !== contextPrincipalUnitId) {
      results.push({ _id: id, ok: false, motivo: 'Nao encontrada' });
      continue;
    }

    let changed = false;
    if (item.nome && item.nome !== funcao.nome) {
      funcao.nome = item.nome;
      changed = true;
    }
    if (item.descricao !== undefined && item.descricao !== funcao.descricao) {
      funcao.descricao = item.descricao;
      changed = true;
    }

    if (changed) {
      await saveFuncao(funcao);
      updated += 1;
    }

    results.push({ _id: funcao._id, ok: true, changed });
  }

  return { updated, results };
}