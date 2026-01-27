(() => {
  const MODAL_FUNCAO_VERSION = '1.3.0';
  console.info('[modal_funcao][legacy] versão', MODAL_FUNCAO_VERSION);
  const byId = (id) => document.getElementById(id);
  const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const escapeAttr = (s='') => escapeHtml(s).replace(/"/g,'&quot;');
  const debounce = (fn, wait=250) => { let t; return (...args) => { clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; };

  // BasePath dinâmico (app gestor montado em /gestor, mas pode variar)
  function getBasePath(){
    const bp = document.body?.getAttribute('data-base-path') || window.__WD_BASE_PATH || '/gestor';
    if(!bp) return '';
    return bp.endsWith('/') ? bp.slice(0,-1) : bp;
  }

  async function fetchJsonSequential(urls){
    for(const url of urls){
      try {
        console.info('[modal_funcao][legacy][FETCH]', url);
        const r = await fetch(url,{headers:{'Accept':'application/json'}});
        if(!r.ok){ console.warn('[modal_funcao][legacy][FETCH][status]', r.status, url); continue; }
        const j = await r.json();
        const arr = Array.isArray(j)?j:(j.data||j.funcoes||[]);
        if(arr && arr.length) return arr;
        // mantém arr vazio e tenta próximo se length 0
      } catch(e){ console.warn('[modal_funcao][legacy][FETCH][erro]', e.message); }
    }
    return [];
  }

  const API = {
    funcoesDiretas: async (unidadeId, q='') => {
      if(!unidadeId) return [];
      const qp = q?`?q=${encodeURIComponent(q)}`:'';
      const base = getBasePath();
      // Ordem de tentativas: com basePath, sem basePath
      const urls = [
        `${base}/api/funcoes/unidade/${encodeURIComponent(unidadeId)}${qp}`,
        `/api/funcoes/unidade/${encodeURIComponent(unidadeId)}${qp}`
      ].filter((v,i,self)=>self.indexOf(v)===i);
      return fetchJsonSequential(urls);
    },
    funcoesQuery: async (unidadeId, q='') => {
      if(!unidadeId) return [];
      const qp = `?unidade_id=${encodeURIComponent(unidadeId)}${q?`&q=${encodeURIComponent(q)}`:''}`;
      const base = getBasePath();
      const urls = [
        `${base}/api/funcoes${qp}`,
        `/api/funcoes${qp}`
      ].filter((v,i,self)=>self.indexOf(v)===i);
      return fetchJsonSequential(urls);
    }
  };

  function descobrirPrincipalId(unidadeId){
    const all=(window.__WD&&Array.isArray(window.__WD.unidades))?window.__WD.unidades:[];
    if(!all.length) return unidadeId;
    const atual = all.find(u=>String(u._id)===String(unidadeId));
    if(!atual) return unidadeId;
    // Se já é principal ou não tem referência, ele mesmo
    if(atual.is_principal || !atual.unidade_principal_id) return atual._id;
    // Senão retorna seu principal
    const principal = all.find(u=>String(u._id)===String(atual.unidade_principal_id));
    return principal ? principal._id : atual._id;
  }

  function montarGrupoUnidades(baseId){
    const all=(window.__WD&&Array.isArray(window.__WD.unidades))?window.__WD.unidades:[];
    if(!all.length || !baseId) return [{ _id: baseId, nome: 'Unidade Selecionada' }];
    const principalId = descobrirPrincipalId(baseId);
    const grupo = all.filter(u => String(u._id)===String(principalId) || String(u.unidade_principal_id||'')===String(principalId));
    // Ordena: principal primeiro depois nome
    grupo.sort((a,b)=>{
      if(String(a._id)===String(principalId)) return -1;
      if(String(b._id)===String(principalId)) return 1;
      return (a.nome||'').localeCompare(b.nome||'');
    });
    return grupo;
  }

  // (N O V O) Fallback p/ FUNCOES, lendo o que veio do EJS
function fallbackFuncoes(unidadeId, q='') {
  const all = (window.__WD && Array.isArray(window.__WD.funcoes)) ? window.__WD.funcoes : [];
  if (!all.length) return [];
  const re = q ? new RegExp(q, 'i') : null;

  return all.filter(f => {
    // unidade_id pode vir como ObjectId, string ou objeto {_id:...}
    const fid = String(
      (f.unidade_id && (f.unidade_id._id || f.unidade_id)) || ''
    );
    const matchUnidade = fid === String(unidadeId);
    if (!matchUnidade) return false;

    if (!re) return true;
    return re.test(f.codigo || '') ||
           re.test(f.nome || f.descricao || f.titulo || '') ||
           re.test(f.cbo || '');
  });
}

  document.addEventListener('DOMContentLoaded', () => {
    const modalEl   = byId('modalSelecionarFuncao');
    const abrirBtn  = byId('btnSelecionarFuncao');
    const mainSel   = byId('unidade'); // campo “Unidade” da aba Identificação

    if (!modalEl || !abrirBtn || !mainSel) {
      console.warn('[SelecionarFunção] Elementos não encontrados.');
      return;
    }

    const selUnidade   = modalEl.querySelector('#modalSelectUnidade');
    const inpBusca     = modalEl.querySelector('#funcaoPesquisa');
    const ulFuncoes    = modalEl.querySelector('#listaFuncoes');
    const btnConfirmar = byId('btnConfirmarFuncao');

    let lastLoadedUnidadeId = null;

    function renderFuncoes(funcoes) {
      if (!Array.isArray(funcoes) || !funcoes.length) {
        ulFuncoes.innerHTML = `
          <li class="list-group-item"><div class="item-row">
            <span class="col-sel"></span>
            <span class="col-cod">—</span>
            <span class="col-desc">Nenhuma função encontrada.</span>
          </div></li>`;
        btnConfirmar.disabled = true;
        return;
      }
      if (!renderFuncoes._debugOnce) {
        console.debug('[modal_funcao][legacy][debug] total funcoes:', funcoes.length, 'amostra (5):', funcoes.slice(0,5));
        window.__LAST_FUNCOES_MODAL = funcoes; // salvar para inspeção manual
        renderFuncoes._debugOnce = true;
      }
        if(!renderFuncoes._nomeDebug && funcoes.length){
          console.debug('[modal_funcao][legacy][debug_nome] primeira função:', { keys:Object.keys(funcoes[0]), amostra: funcoes.slice(0,3).map(x=>({codigo:x.codigo,nome:x.nome,descricao:x.descricao,descricao_final:x.descricao_final})) });
          renderFuncoes._nomeDebug = true;
        }
        ulFuncoes.innerHTML = funcoes.map(f => {
          const id   = f._id || f.id || '';
          const cod  = (f.codigo || f.cod || f.cbo || '').trim();
          const nome = (f.nome && String(f.nome).trim()) || (f.descricao && String(f.descricao).trim()) || cod || '(sem nome)';
          const label = `${cod ? cod+' - ' : ''}${nome}`.trim();
          return `
            <li class="list-group-item" data-funcao-id="${escapeAttr(id)}">
              <div class="item-row mb-0">
                <span class="col-sel">
                  <input type="radio" class="form-check-input" name="optFuncao" value="${escapeAttr(id)}" data-label="${escapeAttr(label)}">
                </span>
                <span class="col-cod text-center">${escapeHtml(cod || '—')}</span>
                <span class="col-nome" data-nome>${escapeHtml(nome)}</span>
              </div>
            </li>`;
        }).join('');

      btnConfirmar.disabled = true;
    }

    async function carregarFuncoes(unidadeId, q='') {
      if(!unidadeId){ renderFuncoes([]); return; }
      ulFuncoes.innerHTML=`<li class="list-group-item"><div class="item-row"><span class="col-sel"></span><span class="col-cod">…</span><span class="col-desc">Carregando funções…</span></div></li>`;
      const principalId=descobrirPrincipalId(unidadeId);
      let funcoes = await API.funcoesDiretas(unidadeId,q);
      // Não mais busca automática na principal. Mantemos estrito.
      if((!funcoes||!funcoes.length)){
        funcoes = await API.funcoesQuery(unidadeId,q);
      }
      if((!funcoes||!funcoes.length) && window.__WD && Array.isArray(window.__WD.funcoes)){
        funcoes=(window.__WD.funcoes||[]).filter(f=>{
          const fid=String(f.unidade_principal_id||f.unidade_id||'');
          return fid===String(unidadeId); // apenas a própria unidade
        }).map(f=>({_id:f._id,codigo:f.codigo||'',nome:f.nome||f.descricao,descricao:f.descricao||f.nome}));
        if(funcoes.length) console.info('[modal_funcao][legacy] fallback memória unidade', unidadeId, funcoes.length);
      }
      if((!funcoes||!funcoes.length) && principalId!==unidadeId){
        console.debug('[modal_funcao][legacy] nenhuma função para a filial', unidadeId, '(não exibiremos funções da matriz', principalId, ')');
      }
      console.debug('[modal_funcao][legacy] resultado final estrito',{unidadeId,principalId,q,total:funcoes.length});
      renderFuncoes(funcoes);
    }

    async function carregarGrupoUnidades(baseId){
      let grupo = montarGrupoUnidades(baseId);
      // Se ainda não temos dados (>1 unidade) tenta endpoint cluster
      if(grupo.length <= 1){
        try {
          const base = getBasePath();
          const url = `${base}/api/unidades/cluster?unidade_id=${encodeURIComponent(baseId)}`;
            console.info('[modal_funcao][legacy][cluster][REQ]', url);
            const r = await fetch(url,{headers:{'Accept':'application/json'}});
            if(r.ok){
              const j = await r.json();
              if(j && j.ok && Array.isArray(j.unidades)){
                // Normaliza para formato usado internamente
                const fetched = j.unidades.map(u=>({
                  _id: u.id || u._id || u.id || '',
                  nome: u.nome || u.codigo || 'Unidade',
                  unidade_principal_id: u.unidade_principal_id || null,
                  is_principal: !!u.is_principal
                }));
                // Cache leve em memória global para próximas aberturas
                window.__WD = window.__WD || {}; 
                const prev = Array.isArray(window.__WD.unidades)?window.__WD.unidades:[];
                // Evita duplicar IDs
                const map = new Map(prev.map(x=>[String(x._id), x]));
                for(const f of fetched){ map.set(String(f._id), f); }
                window.__WD.unidades = Array.from(map.values());
                grupo = montarGrupoUnidades(baseId);
              }
            } else {
              console.warn('[modal_funcao][legacy][cluster][status]', r.status);
            }
        } catch(e){ console.warn('[modal_funcao][legacy][cluster][erro]', e.message); }
      }
      if(!grupo.length){
        selUnidade.innerHTML = `<option value="${escapeAttr(baseId)}">Unidade Selecionada</option>`;
      } else {
        selUnidade.innerHTML = grupo.map(u=>`<option value="${escapeAttr(u._id)}">${escapeHtml(u.nome || u.codigo || u._id)}</option>`).join('');
      }
      selUnidade.disabled = false;
      const opt = selUnidade.querySelector(`option[value="${CSS.escape(baseId)}"]`);
      selUnidade.value = opt ? baseId : selUnidade.options[0]?.value;
      lastLoadedUnidadeId = selUnidade.value;
      carregarFuncoes(lastLoadedUnidadeId, inpBusca.value.trim());
    }

    // ===== Eventos =====
    abrirBtn.addEventListener('click', () => {
      const baseId = mainSel.value;
      if(!baseId){ alert('Selecione uma Unidade na aba Identificação antes.'); return; }
  carregarGrupoUnidades(baseId);
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });

    selUnidade.addEventListener('change', () => {
      lastLoadedUnidadeId = selUnidade.value;
      carregarFuncoes(selUnidade.value, inpBusca.value.trim());
    });

    ulFuncoes.addEventListener('change', (ev) => {
      if (ev.target && ev.target.matches('input[name="optFuncao"]')) {
        btnConfirmar.disabled = false;
      }
    });

    inpBusca.addEventListener('input', debounce(() => {
      carregarFuncoes(selUnidade.value, inpBusca.value.trim());
    }, 250));

    btnConfirmar.addEventListener('click', () => {
      const checked = ulFuncoes.querySelector('input[name="optFuncao"]:checked');
      if (!checked) {
        alert('Selecione uma função para confirmar.');
        return;
      }
      const id    = checked.value;
      const label = checked.dataset.label || '';

      // Campo existente na aba (name=funcao_id, id=funcao). Mostra o nome mas mantém o ID como valor!
      const out = byId('funcao');
      if (out) {
        out.value = id;               // mantém o ID como valor (para envio)
        out.dataset.funcaoId = id;    // guarda o ID em data attribute
        out.title = label;            // dica ao passar o mouse

        // Exibe o nome da função no campo (em vez do ID)
        // Cria um campo hidden para o ID se necessário
        let hiddenId = byId('funcao_id_hidden');
        if (!hiddenId) {
          hiddenId = document.createElement('input');
          hiddenId.type = 'hidden';
          hiddenId.name = 'funcao_id';
          hiddenId.id = 'funcao_id_hidden';
          out.parentNode.appendChild(hiddenId);
        }
        hiddenId.value = id;
        out.value = label;  // mostra o nome da função
      }

      bootstrap.Modal.getInstance(modalEl)?.hide();
    });

  });
})();