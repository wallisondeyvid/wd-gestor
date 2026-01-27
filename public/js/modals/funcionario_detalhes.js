(function () {
  'use strict';

  // ============================================================================
  // Modal Detalhes do Funcionário
  // Ajuste: Exibir campos codificados como "codigo - descrição".
  // 2025-09: Grupos expansíveis (RG, Endereço, CTPS, PCD, Banco, FGTS, Certificado Militar,
  // Título, CNH, Órgão Prof.) foram implementados diretamente no EJS como linhas da tabela
  // contendo um botão (.doc-group-toggle) que abre uma <div class="collapse"> com subcampos.
  // Este script apenas adiciona rotação de ícone e continua populando cada subcampo via
  // atributo data-field normalmente. Duplicações (ex.: rg dentro do cabeçalho e dentro do
  // painel expandido) são intencionais e não afetam performance relevante.
  // Campos suportados atualmente:
  //  - sexo (tratado por mapSexo)
  //  - estado_civil
  //  - raca_cor
  //  - escolaridade
  //  - categoria_trabalhador (placeholder – preencher ENUM_MAPS.categoria_trabalhador)
  //  - tipo_admissao (placeholder)
  //  - tipo_contrato (placeholder)
  //  - regime_contratacao (placeholder)
  //  - regime_jornada (placeholder)
  //  - tipo_salario (placeholder)
  //  - forma_pagamento (placeholder)
  //  - tipo_conta (placeholder)
  //  - regime_previdenciario (placeholder)
  //  - tipo_especial (placeholder)
  // Para adicionar novo campo enumerado: incluir chave em ENUM_MAPS e garantir
  // que o data-field do modal corresponde ao nome da chave.
  // ============================================================================

  const FALLBACK_AVATAR =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
         <rect width="96" height="96" rx="12" fill="#f1f5f9"/>
         <circle cx="48" cy="36" r="18" fill="#cbd5e1"/>
         <rect x="20" y="60" width="56" height="20" rx="10" fill="#cbd5e1"/>
       </svg>`
    );

  const BASE_PATH = (window._basePath || window.basePath || '/gestor').replace(/\/$/, '');

  function resetBackdrops() {
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  const get = (obj, path) =>
    !obj || !path ? '' : String(path.split('.').reduce((o, k) => (o && o[k]) ?? undefined, obj) ?? '');

  function toBrDate(v) {
    if (!v) return '';
    // aceita Date, ISO, yyyy-mm-dd, etc.
    const d = new Date(v);
    if (isNaN(d)) return v;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  function formatCPF(v) {
    const s = String(v || '').replace(/\D/g, '').padStart(11, '0').slice(-11);
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function formatMoneyBR(v) {
    if (v === null || v === undefined || v === '') return '';
    const n = typeof v === 'number' ? v : Number(String(v).toString().replace(',', '.'));
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function mapSexo(s) {
    const m = { F: 'Feminino', M: 'Masculino', N: 'Não informado' };
    return m[s] || s || '';
  }

  // Mapas estáticos de enums (poderiam ser carregados via fetch se necessário)
  const ENUM_MAPS = {
    estado_civil: {
      '1': 'Solteiro(a)', '2': 'Casado(a)', '3': 'Divorciado(a)', '4': 'Viúvo(a)', '5': 'Separado(a)', '6': 'União Estável'
    },
    raca_cor: {
      '1': 'Branca', '2': 'Preta', '3': 'Parda', '4': 'Amarela', '5': 'Indígena', '6': 'Não informado'
    },
    escolaridade: {
      '01': 'Analfabeto',
      '02': 'Até o 5º ano incompleto do ensino fundamental',
      '03': '5º ano completo do ensino fundamental',
      '04': '6º ao 9º ano incompleto do ensino fundamental',
      '05': 'Ensino fundamental completo',
      '06': 'Ensino médio incompleto',
      '07': 'Ensino médio completo',
      '08': 'Educação superior incompleta',
      '09': 'Educação superior completa',
      '10': 'Pós-graduação completa – Mestrado',
      '11': 'Pós-graduação completa – Doutorado',
      '12': 'Pós-graduação completa – Especialização'
    },
    categoria_trabalhador: {
      // Placeholder – adicionar conforme tabela oficial
    },
    tipo_admissao: {
      '1': 'Admissão Normal', '2': 'Reintegração'
    },
    tipo_contrato: {
      '1': 'Prazo Indeterminado', '2': 'Prazo Determinado', '3': 'Experiência'
    },
    regime_contratacao: {
      '1': 'CLT', '2': 'Estatutário', '3': 'Temporário', '4': 'Estagiário', '5': 'Autônomo'
    },
    regime_jornada: {
      '1': 'Integral', '2': 'Meio Período', '3': 'Escala', '4': 'Intermitente', '5': 'Teletrabalho', '6': 'Sobreaviso', '7': 'Outro'
    },
    tipo_salario: {
      '1': 'Mensalista', '2': 'Horista', '3': 'Tarefa', '4': 'Comissionado'
    },
    forma_pagamento: {
      '1': 'Depósito em Conta', '2': 'Dinheiro', '3': 'PIX', '4': 'Cheque', '99': 'Outra forma'
    },
    tipo_conta: {
      '1': 'Corrente', '2': 'Poupança', '3': 'Salário'
    },
    regime_previdenciario: {
      '1': 'RGPS', '2': 'RPPS'
    },
    tipo_especial: {
      '1': 'Não', '2': 'Aposentadoria Especial'
    },
    nacionalidade: {
      '1': 'Brasileiro(a)', '2': 'Estrangeiro(a)'
    },
    pcd: { 'S': 'Sim', 'N': 'Não' }
    , clausula_assecuratoria: { 'S': 'Sim', 'N': 'Não' }
    , tipo_deficiencia: {
      '1': 'Física',
      '2': 'Auditiva',
      '3': 'Visual',
      '4': 'Intelectual',
      '5': 'Múltipla',
      '6': 'Reabilitado',
      '7': 'Transtorno do Espectro Autista',
      '8': 'Outra'
    }
  };

  const REMOTE_ENUM_FILES = {
    estado_civil: '/data/estado_civil.json',
    raca_cor: '/data/raca_cor.json',
    escolaridade: '/data/escolaridades.json'
    // expandir aqui se necessário
  };

  const enumFetchCache = {}; // field -> Promise

  async function loadEnumRemote(field) {
    if (enumFetchCache[field]) return enumFetchCache[field];
    const url = REMOTE_ENUM_FILES[field];
    if (!url) return null;
    enumFetchCache[field] = fetch(url).then(r => r.ok ? r.json() : null).then(json => {
      if (Array.isArray(json)) {
        // converte array de objetos {codigo, descricao}
        const map = json.reduce((acc, it) => {
          if (it && it.codigo != null) acc[String(it.codigo)] = it.descricao || '';
          return acc;
        }, {});
        // mescla apenas se ainda não temos
        ENUM_MAPS[field] = Object.assign({}, map, ENUM_MAPS[field]);
        return ENUM_MAPS[field];
      }
      return null;
    }).catch(() => null);
    return enumFetchCache[field];
  }

  const ENUM_FIELDS = ['estado_civil','raca_cor','escolaridade','categoria_trabalhador','tipo_admissao','tipo_contrato','regime_contratacao','regime_jornada','tipo_salario','forma_pagamento','tipo_conta','regime_previdenciario','tipo_especial','nacionalidade','pcd','clausula_assecuratoria','tipo_deficiencia'];

  async function applyEnumDescriptions(modal) {
    // primeiro tenta aplicação imediata
    ENUM_FIELDS.forEach(field => {
      modal.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
        const raw = (el.textContent || '').trim();
        if (!raw || raw === '—' || raw.includes(' - ')) return;
        const map = ENUM_MAPS[field];
        if (map && map[raw] !== undefined) {
          el.textContent = `${raw} - ${map[raw]}`;
        }
      });
    });

    // depois busca remotos para os que permaneceram só com código
    const needsRemote = ENUM_FIELDS.filter(f => (ENUM_MAPS[f] && Object.keys(ENUM_MAPS[f]).length === 0) || !ENUM_MAPS[f] || modal.querySelectorAll(`[data-field="${f}"]`).length > 0);
    await Promise.all(needsRemote.map(loadEnumRemote));
    ENUM_FIELDS.forEach(field => {
      modal.querySelectorAll(`[data-field="${field}"]`).forEach(el => {
        const raw = (el.textContent || '').trim();
        if (!raw || raw === '—' || raw.includes(' - ')) return;
        const map = ENUM_MAPS[field];
        if (map && map[raw] !== undefined) {
          el.textContent = `${raw} - ${map[raw]}`;
        }
      });
    });
  }

  /**
   * Retorna string "codigo - descricao" quando descrição existir.
   * Mantém apenas o código se descrição ausente ou já houver traço.
   */
  function codeWithDescription(field, code) {
    if (code === null || code === undefined || code === '') return '';
    const str = String(code);
    // Se já contém ' - ' assume que já está formatado
    if (str.includes(' - ')) return str;
    const map = ENUM_MAPS[field];
    if (map && map[str] !== undefined) return `${str} - ${map[str]}`;
    return str; // fallback
  }

  function formatEndereco(end) {
    if (!end || typeof end !== 'object') return '';
    const p = (k) => (end[k] ? String(end[k]) : '');
    const ped = [
      [p('tipo_logradouro'), p('logradouro')].filter(Boolean).join(' '),
      p('numero'),
      p('complemento')
    ].filter(Boolean).join(', ');
    const bairroCidade = [p('bairro'), [p('cidade'), p('estado')].filter(Boolean).join(' - ')].filter(Boolean).join(' • ');
    const cep = p('cep') ? `CEP: ${p('cep')}` : '';
    const ibge = p('codigo_ibge') ? `IBGE: ${p('codigo_ibge')}` : '';
    return [ped, bairroCidade, [cep, ibge].filter(Boolean).join(' • ')].filter(Boolean).join(' — ');
  }

  async function fetchFuncionarioById(id) {
    const basePath = BASE_PATH;
    async function tryUrl(u) {
      try {
        const r = await fetch(u, { headers: { Accept: 'application/json' } });
        if (!r.ok) return null;
        const j = await r.json();
        return j.funcionario || j.data || j;
      } catch {
        return null;
      }
    }
    return (await tryUrl(`${basePath}/api/funcionarios/${id}`)) ||
           (await tryUrl(`${basePath}/api/funcionarios/${id}/detalhes`)) ||
           (await tryUrl(`${basePath}/funcionarios/${id}.json`)) ||
           Promise.reject(new Error('Nenhum endpoint respondeu'));
  }

  function setField(modal, path, value) {
    const nodes = modal.querySelectorAll(`[data-field="${path}"]`);
    if (!nodes || !nodes.length) return;
    nodes.forEach(el => { el.textContent = (value ?? '') || '—'; });
  }

  function render(data) {
    const modal = document.getElementById('modalFuncionarioDetalhes');
    if (!modal) return;

    // foto
    const img = modal.querySelector('#detalheFoto');
    console.log('[MODAL DETALHES] Elemento img encontrado:', !!img);
    const rawFoto = data.foto_url || data.foto || data.extra_foto_url || '';
    console.log('[MODAL DETALHES] Foto data:', { rawFoto, foto_url: data.foto_url, foto: data.foto });

    // Preferir SEMPRE a rota de API que resolve Blob/placeholder e permite cache-busting
    let apiFotoUrl = '';
    try {
      if (data && (data._id || data.id)) {
        const fid = data._id || data.id;
        apiFotoUrl = `${BASE_PATH}/api/funcionarios/${fid}/foto?cb=${Date.now()}`;
      }
    } catch {}

    function buildCandidates(path){
      if(!path) return [];
      let p = String(path).trim();
      // remove query/hash
      p = p.split('?')[0].split('#')[0];
      const clean = p.replace(/^[.\/]+/,'');
      const candidates = [];
      if(/^https?:/i.test(p) || p.startsWith('data:')) return [p];
      if(p.startsWith('/')) candidates.push(p); else candidates.push('/'+clean);
      // basePath prefix
      if(!p.startsWith(BASE_PATH)) candidates.push(`${BASE_PATH}/${clean}`.replace(/\/+/g,'/'));
      // uploads prefix normalizado
      if(!/^(\/)?uploads\//.test(p)) candidates.push('/uploads/'+clean);
      return [...new Set(candidates)];
    }

  const fotoCandidates = apiFotoUrl ? [apiFotoUrl] : buildCandidates(rawFoto);
    console.log('[MODAL DETALHES] Candidatos foto:', fotoCandidates);

    function applyFoto(src){
      if(!img) return;
      img.onerror = () => {
        const next = fotoCandidates.shift();
        if(next){
          console.log('[MODAL DETALHES] Tentando próximo candidato de foto:', next);
          img.onerror = null; // evitar loop duplo, será reatribuído dentro
          setTimeout(()=>applyFoto(next), 10);
        } else {
          console.log('[MODAL DETALHES] Todos candidatos falharam, usando fallback');
          img.src = FALLBACK_AVATAR;
          updateFotoStatus(false);
        }
      };
      img.onload = () => {
        console.log('[MODAL DETALHES] Foto carregada com sucesso:', src);
        updateFotoStatus(true);
      };
      img.src = src;
    }

    function updateFotoStatus(ok){
      const fotoStatus = modal.querySelector('#detalheFotoStatus');
      if(!fotoStatus) return;
      fotoStatus.innerHTML = ok ? '<span class="badge bg-success">Foto cadastrada</span>' : '';
    }

    if(img){
      if(fotoCandidates.length){
        applyFoto(fotoCandidates.shift());
      } else {
        console.log('[MODAL DETALHES] Nenhum caminho de foto fornecido, fallback direto');
        img.src = FALLBACK_AVATAR;
        updateFotoStatus(false);
      }
    } else {
      console.error('[MODAL DETALHES] Elemento #detalheFoto não encontrado!');
    }

    // preenchimento básico por data-field
    modal.querySelectorAll('[data-field]').forEach(el => {
      const path = el.getAttribute('data-field');
      let v = get(data, path);

      // formatações por campo
      if (['data_nascimento','data_admissao','data_termino','rg_data_expedicao','fgts_data','cert_militar_data','cnh_validade','data_chegada_brasil','updatedAt','createdAt'].includes(path)) {
        v = v ? toBrDate(v) : '';
      }
      if (path === 'cpf' && v) v = formatCPF(v);
      if (path === 'salario_base' && v !== undefined && v !== null && v !== '') v = formatMoneyBR(v);
      if (path === 'sexo' && v) v = mapSexo(v);
      if (['estado_civil','raca_cor','escolaridade','categoria_trabalhador','tipo_admissao','tipo_contrato','regime_contratacao','regime_jornada','tipo_salario','forma_pagamento','tipo_conta','regime_previdenciario','tipo_especial','nacionalidade','clausula_assecuratoria','tipo_deficiencia'].includes(path)) {
        v = codeWithDescription(path, v);
      }
      if (path === 'pcd' && v) v = codeWithDescription('pcd', v);
      if (path === 'fgts_optante' && v) {
        const fgtsMap = { '1': 'Optante pelo FGTS', '2': 'Não optante pelo FGTS', '3': 'Não optante – trabalhador com idade igual ou superior a 70 anos' };
        v = fgtsMap[v] || v;
      }

      el.textContent = v || '—';
    });

    // endereço formatado
    const detEnd = modal.querySelector('#det_endereco');
    if (detEnd) detEnd.textContent = formatEndereco(data.endereco) || '—';

    // Nenhum JS adicional necessário para fld-toggle (CSS usa aria-expanded) – bloco reservado.

  // Aplica enums após preenchimento base (async, mas sem bloquear)
  applyEnumDescriptions(modal).catch(e => console.warn('applyEnumDescriptions falhou:', e));

  // Dependentes
    const depTbody = modal.querySelector('#listaDependentes');
    if (depTbody) {
      const deps = Array.isArray(data.dependentes) ? data.dependentes : [];
      if (deps.length) {
        depTbody.innerHTML = deps.map(d => {
          const nome = d.nome || '—';
          const cpf  = d.cpf ? formatCPF(d.cpf) : '—';
          const par  = d.parentesco || '—';
          const nasc = d.data_nascimento ? toBrDate(d.data_nascimento) : '—';
          return `<tr><td>${nome}</td><td>${cpf}</td><td>${par}</td><td>${nasc}</td></tr>`;
        }).join('');
      } else {
        depTbody.innerHTML = `<tr><td colspan="4" class="text-muted">—</td></tr>`;
      }
    }

    // Benefícios
    const benTbody = modal.querySelector('#listaBeneficios');
    if (benTbody) {
      const bens = Array.isArray(data.beneficios) ? data.beneficios : [];
      if (bens.length) {
        benTbody.innerHTML = bens.map(b => {
          const tipo  = b.tipo || '—';
          const desc  = b.nome || b.descricao || '—';
          const valor = (b.valor !== undefined && b.valor !== null && b.valor !== '') ? formatMoneyBR(b.valor) : '—';
          const inicio = b.inicio ? (String(b.inicio).toLowerCase() === 'admissão' || String(b.inicio).toLowerCase() === 'admissao' ? 'Admissão' : 'Outra data') : '—';
          const dataIni = b.data_inicio ? toBrDate(b.data_inicio) : (inicio === 'Admissão' ? '' : '—');
          return `<tr><td>${tipo}</td><td>${desc}</td><td>${valor}</td><td>${inicio}</td><td>${dataIni}</td></tr>`;
        }).join('');
      } else {
        benTbody.innerHTML = `<tr><td colspan="5" class="text-muted">—</td></tr>`;
      }
    }

    // Anexos
    try {
      const ul = modal.querySelector('#detalheAnexosList');
      const vazio = modal.querySelector('#detalheAnexosVazio');
      if (ul) {
        const anexos = Array.isArray(data.anexos) ? data.anexos : [];
        if (anexos.length) {
          ul.innerHTML = anexos.map((ax, idx) => {
            const nome = ax?.nome || ax?.originalname || ax?.filename || `Arquivo ${idx + 1}`;
            const size = ax?.size ? formatSize(ax.size) : '';
            const ext = (nome.split('.').pop() || '').toLowerCase();
            let href = ax?.url || ax?.download_url || '';
            if (!href) {
              // tenta construir rota padrão de download
              const id = data._id || data.id || data.codigo || '';
              if (id) href = `${BASE_PATH}/api/funcionarios/${id}/anexo/${idx}`;
              else if (ax?.path) href = '/' + String(ax.path).replace(/^\//,'');
            }
            const isImg = /(jpe?g|png|gif|webp|bmp|svg)$/i.test(ext);
            const badgeSize = size ? `<span class="ms-2 text-muted">${size}</span>` : '';
            const previewBtn = isImg && href ? `<a class="btn btn-sm btn-outline-secondary ms-2" target="_blank" rel="noopener" href="${href}"><i class="bi bi-eye"></i></a>` : '';
            return `<li class="list-group-item d-flex justify-content-between align-items-center">`+
                   `<span class="text-truncate" style="max-width:70%">${nome}</span>`+
                   `<span class="d-flex align-items-center">`+
                   `${badgeSize}`+
                   (href ? `<a class="btn btn-sm btn-primary ms-2" target="_blank" rel="noopener" href="${href}"><i class="bi bi-download"></i></a>` : '')+
                   `${previewBtn}`+
                   `</span>`+
                   `</li>`;
          }).join('');
          if (vazio) vazio.style.display = 'none';
        } else {
          ul.innerHTML = '';
          if (vazio) vazio.style.display = 'block';
        }
      }
    } catch(anxErr) {
      console.warn('[MODAL DETALHES] Falha ao renderizar anexos:', anxErr);
    }
  }

  function formatSize(bytes){
    if(!bytes && bytes !== 0) return '';
    const units=['B','KB','MB','GB'];
    let v=bytes, i=0; while(v>=1024 && i<units.length-1){ v/=1024; i++; }
    return `${v.toFixed(v<10&&i>0?1:0)} ${units[i]}`;
  }

  async function openDetalhes(id) {
    const modalEl = document.getElementById('modalFuncionarioDetalhes');
    if (!modalEl) return;

    // move para <body> para evitar CSS ancestral com overflow/transform/z-index
    if (modalEl.parentNode !== document.body) document.body.appendChild(modalEl);

    // cura “tela cinza”
    resetBackdrops();

    // estado inicial
    render({ nome: 'Carregando…' });

    // abre
    const bs = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true, focus: true });
    if (!modalEl.classList.contains('show')) bs.show();

    // busca e preenche
    try {
      const data = await fetchFuncionarioById(id);
      render(data || {});
    } catch (e) {
      console.error('[detalhes] erro:', e);
      // Fallback: ainda assim renderiza com o ID para que a foto via API funcione
      try { render({ _id: id, nome: '—' }); } catch {}
      setField(modalEl, 'nome', 'Erro ao carregar dados');
    }
  }

  // binding do botão Detalhes (na tabela de funcionários)
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.wdg-emp-table')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.btn-detalhes-func');
      if (!btn) return;
      const id  = btn.dataset.funcId || btn.closest('tr')?.getAttribute('data-func-id');
      if (id) openDetalhes(id);
    });
  });

  // opcional: expor global
  window.openFuncionarioDetalhes = openDetalhes;
})();