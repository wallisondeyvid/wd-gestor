function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createLoginModuleAccessCore({
  findModuloByOr,
  findUnidadeByIdSelect,
  findFuncionarioByIdSelect,
  findFuncaoByIdSelect,
} = {}) {
  async function evaluateModuleAccess({ userDoc, moduloAlvoNome, basePath, authContext = null } = {}) {
    try {
      if (!userDoc) return { permitido: false, motivo: 'usuario_invalido' };
      if (!moduloAlvoNome) return { permitido: false, motivo: 'modulo_nao_informado' };

      const role = userDoc.role;
      if (role === 'master' || role === 'admin') {
        return { permitido: true };
      }

      const nomeRx = new RegExp('^' + escapeRegex(moduloAlvoNome) + '$', 'i');
      const or = [{ nome: nomeRx }];
      const bp = String(basePath || '').trim();
      if (bp) or.push({ url_base: bp });
      if (moduloAlvoNome && !String(moduloAlvoNome).startsWith('/')) {
        or.push({ url_base: '/' + String(moduloAlvoNome).trim() });
      }
      if (String(moduloAlvoNome).toLowerCase() === 'portal_morador') {
        or.push({ nome: /^portal-morador$/i });
        or.push({ url_base: '/portal-morador' });
      }

      const alvoLower = String(moduloAlvoNome || '').trim().toLowerCase();
      if (alvoLower === 'condominios' || alvoLower === 'condominio') {
        or.push({ nome: /^condom[ií]nios$/i });
        or.push({ nome: /^gest[aã]o de condom[ií]nios$/i });
        or.push({ nome: /^m[oó]dulo condom[ií]nios$/i });
      }

      const modulo = await findModuloByOr({
        or,
        maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
      });
      if (!modulo) return { permitido: false, motivo: 'modulo_inexistente' };

      if (role === 'diretor') {
        const unidadeIdCanonica = authContext?.source === 'auth-context-v1'
          ? (authContext.activeContext?.unidadeId || authContext.active_unidade_id || null)
          : null;
        const unidadeIdEfetiva = unidadeIdCanonica || userDoc.unidade_id || null;
        if (!unidadeIdEfetiva) return { permitido: false, motivo: 'diretor_sem_unidade' };
        const unidade = await findUnidadeByIdSelect({
          id: unidadeIdEfetiva,
          select: 'modulosAcessiveis',
          maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
        });
        if (!unidade) return { permitido: false, motivo: 'unidade_inexistente' };
        const possui = unidade.modulosAcessiveis?.some(m => m.toString() === modulo._id.toString());
        return possui ? { permitido: true } : { permitido: false, motivo: 'modulo_nao_habilitado_unidade' };
      }

      if (role === 'user') {
        if (!userDoc.funcionario_id) return { permitido: false, motivo: 'user_sem_funcionario' };
        const funcionario = await findFuncionarioByIdSelect({
          id: userDoc.funcionario_id,
          select: 'funcao_id unidade_id',
          maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
        });
        if (!funcionario) return { permitido: false, motivo: 'funcionario_inexistente' };
        if (!funcionario.funcao_id) return { permitido: false, motivo: 'user_sem_funcao' };
        const funcao = await findFuncaoByIdSelect({
          id: funcionario.funcao_id,
          select: 'modulos_habilitados ativa',
          maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
        });
        if (!funcao || funcao.ativa === false) return { permitido: false, motivo: 'funcao_inativa' };
        const moduloNaFuncao = funcao.modulos_habilitados?.some(m => m.toString() === modulo._id.toString());
        if (!moduloNaFuncao) return { permitido: false, motivo: 'modulo_nao_habilitado_funcao' };

        if (funcionario.unidade_id) {
          const unidade = await findUnidadeByIdSelect({
            id: funcionario.unidade_id,
            select: 'modulosAcessiveis',
            maxTimeMS: Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000),
          });
          if (unidade) {
            const moduloUnidade = unidade.modulosAcessiveis?.some(m => m.toString() === modulo._id.toString());
            if (!moduloUnidade) return { permitido: false, motivo: 'modulo_nao_habilitado_unidade' };
          }
        }
        return { permitido: true };
      }

      return { permitido: false, motivo: 'role_desconhecida' };
    } catch (error) {
      console.error('[evaluateModuleAccess] erro:', error.message);
      return { permitido: false, motivo: 'erro_interno' };
    }
  }

  return {
    evaluateModuleAccess,
  };
}