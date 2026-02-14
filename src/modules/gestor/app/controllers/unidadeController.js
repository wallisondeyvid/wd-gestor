// Controller de Unidades (migrado do legado)
import Unidade from '#models/unidade.js';
import User from '#models/user.js';
import Funcionario from '#models/Funcionario.js';
import { callBankApi, getOAuthTokenFromConfig } from '#services/bank/bankClient.js';

export async function listarUnidades(req, res) {
  try {
    if (!req.user) return res.redirect('/login');
    let unidadesFiltradas;
    if (req.user.isMaster) {
      unidadesFiltradas = await Unidade.find();
      try {
        const principais = unidadesFiltradas.filter(u => u.is_principal);
        if (principais.length === 1) {
          const idsExistentes = new Set(unidadesFiltradas.map(u => u._id.toString()));
            const orfas = unidadesFiltradas.filter(u => !u.is_principal && u.unidade_principal_id && !idsExistentes.has(u.unidade_principal_id.toString()));
            if (orfas.length) {
              await Promise.all(orfas.map(async f => { f.unidade_principal_id = principais[0]._id; try { await f.save(); } catch {} }));
              unidadesFiltradas = await Unidade.find();
            }
        }
      } catch {}
    } else {
      const matrizRef = req.user.unidade_principal_id || req.user.unidade_id;
      if (matrizRef) {
        unidadesFiltradas = await Unidade.find({ $or: [ { _id: matrizRef }, { unidade_principal_id: matrizRef } ] });
      } else {
        unidadesFiltradas = [];
      }
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && req.user.unidade_id) {
        const unica = await Unidade.find({ _id: req.user.unidade_id });
        unidadesFiltradas = unica;
      }
    }
    unidadesFiltradas = unidadesFiltradas.map(u => {
      const plain = u.toObject();
      const apiBancaria = plain.apiBancaria ? { ...plain.apiBancaria } : {};
      if (apiBancaria.apiMtlsCertFileData) delete apiBancaria.apiMtlsCertFileData;
      return {
        ...plain,
        naturezaJuridica: u.naturezaJuridica || '',
        tipoPix: u.tipoPix || null,
        pixChave: u.pixChave || null,
        banco: u.banco || null,
        agencia: u.agencia || null,
        contaCorrente: u.contaCorrente || null,
        modulosAcessiveis: Array.isArray(u.modulosAcessiveis) ? u.modulosAcessiveis : [],
        apiBancaria
      };
    });
    let principalUnits = unidadesFiltradas.filter(u => u.is_principal);
    if (principalUnits.length === 0 && req.user.unidade_principal_id) {
      const principalDoc = await Unidade.findById(req.user.unidade_principal_id).lean();
      if (principalDoc) principalUnits = [principalDoc];
    }
    if (principalUnits.length === 0 && req.user.unidade_id) {
      const doc = await Unidade.findById(req.user.unidade_id).lean();
      if (doc) principalUnits = [doc];
    }
    const modulos = req.user.isMaster || req.user.role === 'admin'
      ? await Unidade.find().lean()
      : await Unidade.find({ status: 'ativo' }).lean();
    let usuariosDiretor = [];
    if (req.user.isMaster || req.user.role === 'admin') {
      usuariosDiretor = await User.find({ ativo: true, role: 'diretor' })
        .populate('funcionario_id', 'nome email')
        .lean();
      const faltando = usuariosDiretor.filter(u => !((u.nome && u.nome.trim()) || (u.funcionario_id && u.funcionario_id.nome) || u.email));
      let mapaFuncPorEmail = {};
      if (faltando.length){
        const emails = [...new Set(faltando.map(f=>f.email?.toLowerCase()).filter(Boolean))];
        try {
          const funcs = await Funcionario.find({ email: { $in: emails } }).select('email nome').lean();
          funcs.forEach(f => { if(f.email) mapaFuncPorEmail[f.email.toLowerCase()] = f.nome; });
        } catch {}
      }
      usuariosDiretor = usuariosDiretor.map(u => {
        let nomeFinal = (u.nome && u.nome.trim()) ? u.nome.trim() : '';
        if (!nomeFinal && u.funcionario_id?.nome) nomeFinal = u.funcionario_id.nome.trim();
        if (!nomeFinal && u.email) {
          const viaMapa = mapaFuncPorEmail[u.email.toLowerCase()];
          if (viaMapa) nomeFinal = viaMapa.trim();
        }
        if (!nomeFinal && u.email) {
          try {
            const base = (u.email).split('@')[0].replace(/[._-]+/g,' ').replace(/\d+$/,'').trim();
            nomeFinal = base ? base.replace(/\b\w/g,m=>m.toUpperCase()) : '';
          } catch {}
        }
        u.nome = nomeFinal || '';
        return u;
      });
    }
    return res.render('unidades', { unidadesFiltradas, principalUnits, isMaster: req.user?.isMaster || false, user: req.user, estados: [], modulos, usuariosDiretor });
  } catch (error) {
    console.error('[listarUnidades] Erro ao carregar unidades:', error?.stack || error);
    return res.status(500).send('Erro ao carregar unidades');
  }
}

export async function testarBanco(req, res) {
  try {
    const { id: unidadeId } = req.params || {};
    if (!unidadeId) {
      return res.status(400).json({ ok: false, message: 'ID da unidade é obrigatório.' });
    }

    const unidade = await Unidade.findById(unidadeId);
    if (!unidade) {
      return res.status(404).json({ ok: false, message: 'Unidade não encontrada.' });
    }

    const cfg = unidade.apiBancaria || {};
    if (!cfg.apiBaseUrl) {
      return res.status(400).json({ ok: false, message: 'Base URL da API bancária não configurada para esta unidade.' });
    }

    const tipo = cfg.tipoAutenticacaoAPI || '';
    let detalhe = '';
    let resultado = null;

    if (tipo === 'oauth2') {
      const token = await getOAuthTokenFromConfig(cfg);
      detalhe = 'Token OAuth2 obtido com sucesso.';
      resultado = { tokenPreview: token ? `${token.slice(0, 10)}...` : null };
    } else {
      const path = (req.body?.path || '/');
      const method = (req.body?.method || 'GET');
      const data = req.body?.data;
      resultado = await callBankApi(unidadeId, { method, path, data });
      detalhe = `${method.toUpperCase()} ${path} executado com sucesso.`;
    }

    return res.json({ ok: true, message: 'Conexão com o banco testada com sucesso.', detalhe, resultado });
  } catch (err) {
    console.error('[unidades][testarBanco] Erro ao testar conexão bancária:', err);
    return res.status(400).json({ ok: false, message: err?.message || 'Falha ao testar conexão com o banco.' });
  }
}

export default { listarUnidades, testarBanco };
