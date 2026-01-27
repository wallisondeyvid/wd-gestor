// Modal Selecionar Função - Versão relacionamento principal/filial
// Objetivo: listar SOMENTE as funções da unidade selecionada, mas permitir escolher
// no select entre a unidade principal e suas filiais OU, se a base for uma filial,
// listar a própria filial + a principal.
// Endpoint funções: GET /api/funcoes?unidade_id=<id>&q=<termo>
// Requisitos UI: busca incremental, seleção via radio, nota de origem simples, estado de carregamento e erro.
(() => {
	const MODAL_FUNCAO_VERSION = '1.3.0';
	console.info('[modal_funcao][gestor] versão', MODAL_FUNCAO_VERSION);
	// Utilitários definidos antes de qualquer uso
	const byId = (id) => document.getElementById(id);
	const escapeHtml = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
	const escapeAttr = (s='') => escapeHtml(s).replace(/"/g,'&quot;');
	const debounce = (fn, wait=300) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); }; };

	if (window.__WDSelecionarFuncaoInit) {
		console.info('[SelecionarFunção] Já inicializado (flag).');
		return;
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initSelecionarFuncao, { once: true });
	} else {
		initSelecionarFuncao();
	}

	let retryCount = 0;
	function initSelecionarFuncao() {
		const modalEl = byId('modalSelecionarFuncao');
		const abrirBtn = byId('btnSelecionarFuncao');
		const mainUnidadeSel = byId('unidade');
		if (!modalEl || !abrirBtn || !mainUnidadeSel) {
			if (retryCount < 7) { // aumenta tentativas
				retryCount++;
				console.warn(`[SelecionarFunção] Elementos não presentes ainda (tentativa ${retryCount}). Retentando em 250ms.`);
				return setTimeout(initSelecionarFuncao, 250);
			}
			console.error('[SelecionarFunção] Falha ao inicializar: modal?', !!modalEl, 'botão?', !!abrirBtn, 'select unidade?', !!mainUnidadeSel);
			// Adiciona delegation mesmo assim se o botão surgir depois
			document.addEventListener('click', delegationHandler, true);
			return;
		}
		window.__WDSelecionarFuncaoInit = true;
		console.info('[SelecionarFunção] Inicializando modal (unidade).');
		montarLogica(modalEl, abrirBtn, mainUnidadeSel);
	}

	function delegationHandler(ev) {
		if (ev.target && (ev.target.id === 'btnSelecionarFuncao' || ev.target.closest && ev.target.closest('#btnSelecionarFuncao'))) {
			const modalEl = byId('modalSelecionarFuncao');
			const mainUnidadeSel = byId('unidade');
			if (!modalEl || !mainUnidadeSel) return;
			console.info('[SelecionarFunção][Delegation] Clique detectado (fallback).');
			if (!window.__WDSelecionarFuncaoInit) {
				// tenta montar lógica agora
				const btn = byId('btnSelecionarFuncao');
				if (btn && modalEl) {
					window.__WDSelecionarFuncaoInit = true;
					montarLogica(modalEl, btn, mainUnidadeSel);
				}
			}
		}
	}

		function montarLogica(modalEl, abrirBtn, mainUnidadeSel) {
			const selUnidade = modalEl.querySelector('#modalSelectUnidade');
			const inpBusca = modalEl.querySelector('#funcaoPesquisa');
			const ulFuncoes = modalEl.querySelector('#listaFuncoes');
			const btnConfirmar = byId('btnConfirmarFuncao');
			const notaOrigem = modalEl.querySelector('[data-note-origem]');
			let ultimoTermo='';

			function getBase(){ const b=document.body?.getAttribute('data-base-path')||window.__WD_BASE_PATH||'/gestor'; return b.endsWith('/')?b.slice(0,-1):b; }
			const API={
				async funcoesDiretas(unidadeId, q='') { // rota específica /api/funcoes/unidade/:id
					const bp=getBase();
					const url=`${bp}/api/funcoes/unidade/${encodeURIComponent(unidadeId)}${q?`?q=${encodeURIComponent(q)}`:''}`;
					console.info('[modal_funcao][REQ funcoes/unidade]', url);
					const r=await fetch(url,{headers:{'Accept':'application/json'}});
					console.info('[modal_funcao][RESP funcoes/unidade]', r.status);
					if(!r.ok) return [];
					const j=await r.json();
					return Array.isArray(j)?j:(j.data||j.funcoes||[]);
				},
				async funcoesQuery(unidadeId, q='') { // rota genérica /api/funcoes?unidade_id=
					const bp=getBase();
					const url=`${bp}/api/funcoes?unidade_id=${encodeURIComponent(unidadeId)}${q?`&q=${encodeURIComponent(q)}`:''}`;
					console.info('[modal_funcao][REQ funcoes?unidade_id]', url);
					const r=await fetch(url,{headers:{'Accept':'application/json'}});
					console.info('[modal_funcao][RESP funcoes?unidade_id]', r.status);
					if(!r.ok) return [];
					const j=await r.json();
					return Array.isArray(j)?j:(j.data||j.funcoes||[]);
				}
			};

			function descobrirPrincipalId(unidadeId){
				// Sem endpoint de cluster: usar window.__WD.unidades se existir para achar a principal
				const all=(window.__WD&&Array.isArray(window.__WD.unidades))?window.__WD.unidades:[];
				if(!all.length) return unidadeId; // fallback: assume a própria
				const atual=all.find(u=>String(u._id)===String(unidadeId));
				if(!atual) return unidadeId;
				// principal é quem não tem unidade_principal_id/matriz_id ou o apontado por eles
				if(atual.unidade_principal_id){
					const principal=all.find(u=>String(u._id)===String(atual.unidade_principal_id));
					if(principal) return principal._id; }
				if(atual.matriz_id){
					const principal=all.find(u=>String(u._id)===String(atual.matriz_id));
					if(principal) return principal._id; }
				return atual._id;
			}

	function renderFuncoes(funcoes) {
		if (!Array.isArray(funcoes) || !funcoes.length) {
			ulFuncoes.innerHTML = `\n        <li class="list-group-item"><div class="item-row">\n          <span class="col-sel"></span>\n          <span class="col-cod">—</span>\n          <span class="col-desc">Nenhuma função encontrada.</span>\n        </div></li>`;
			btnConfirmar.disabled = true;
			return;
		}
		// Instrumentação de debug (apenas primeira chamada por abertura):
		if (!renderFuncoes._debugOnce) {
			console.debug('[modal_funcao][gestor][debug] total funcoes:', funcoes.length, 'amostra (5):', funcoes.slice(0,5));
			window.__LAST_FUNCOES_MODAL = funcoes; // exposição global p/ inspeção manual
			renderFuncoes._debugOnce = true;
		}
		// Debug explícito para confirmar valores de nome vs descricao (apenas 1a vez)
		if(!renderFuncoes._nomeDebug && funcoes.length){
			console.debug('[modal_funcao][gestor][debug_nome] primeira função recebida:', { keys:Object.keys(funcoes[0]), amostra: funcoes.slice(0,3).map(x=>({codigo:x.codigo,nome:x.nome,descricao:x.descricao,descricao_final:x.descricao_final})) });
			renderFuncoes._nomeDebug = true;
		}
		ulFuncoes.innerHTML = funcoes.map(f => {
			const id   = f._id || f.id || '';
			const cod  = (f.codigo || f.cod || f.cbo || '').trim();
			// Exibir sempre o NOME da função (campo 'nome' no model). Se ausente, fallback para descricao e por último código.
			const nome = (f.nome && String(f.nome).trim()) || (f.descricao && String(f.descricao).trim()) || cod || '(sem nome)';
			const label = `${cod ? cod+' - ' : ''}${nome}`.trim();
			return `\n        <li class="list-group-item" data-funcao-id="${escapeAttr(id)}">\n          <div class="item-row mb-0">\n            <span class="col-sel">\n              <input type="radio" class="form-check-input" name="optFuncao" value="${escapeAttr(id)}" data-label="${escapeAttr(label)}">\n            </span>\n            <span class="col-cod text-center">${escapeHtml(cod || '—')}</span>\n            <span class="col-nome" data-nome>${escapeHtml(nome)}</span>\n          </div>\n        </li>`;
		}).join('');
		btnConfirmar.disabled = true;
	}

	function setLoading() {
		ulFuncoes.innerHTML = `\n      <li class="list-group-item"><div class="item-row">\n        <span class="col-sel"></span>\n        <span class="col-cod">…</span>\n        <span class="col-desc">Carregando funções…</span>\n      </div></li>`;
		btnConfirmar.disabled = true;
	}

		async function carregarFuncoesUnidade(unidadeId, q='') {
			if(!unidadeId){ ulFuncoes.innerHTML='<li class="list-group-item">Selecione uma unidade.</li>'; btnConfirmar.disabled=true; return; }
			setLoading();
			let funcoes=[];
			const principalId=descobrirPrincipalId(unidadeId);
			// Sempre buscar SOMENTE as funções diretamente vinculadas à unidade selecionada
			funcoes = await API.funcoesDiretas(unidadeId, q);
			// Se ainda vazio, tentar a rota genérica somente para a própria unidade (não mais para a principal automaticamente)
			if((!funcoes||!funcoes.length)){
				funcoes = await API.funcoesQuery(unidadeId, q);
			}
			// Fallback memória agora estrito à unidade selecionada
			if((!funcoes||!funcoes.length) && window.__WD && Array.isArray(window.__WD.funcoes)){
				console.info('[modal_funcao] fallback memória apenas unidade selecionada');
				funcoes = (window.__WD.funcoes||[]).filter(f=>String(f.unidade_principal_id||f.unidade_id||'')===String(unidadeId))
				  .map(f=>({ _id:f._id, codigo:f.codigo||'', nome:f.nome||f.descricao }));
			}
			// Se continuou vazio e unidade detectada difere do principal, NÃO importar funções da principal automaticamente
			if((!funcoes||!funcoes.length) && principalId && principalId!==unidadeId){
				console.debug('[modal_funcao] nenhuma função cadastrada para a filial', unidadeId, 'não exibiremos funções da matriz', principalId);
			}
			console.debug('[modal_funcao] resultado final', { unidadeId, principalId, q, total: funcoes.length });
			renderFuncoes(funcoes);
			if(notaOrigem){
				if(funcoes.length){
					notaOrigem.textContent = 'Listando funções da unidade selecionada';
				}else{
					notaOrigem.textContent = 'Nenhuma função cadastrada para esta unidade.';
				}
			}
		}

    function carregarUnidadeSimples(baseId){
      // Sem cluster: só coloca a própria unidade no select
      if(!selUnidade) return;
      const texto = mainUnidadeSel.options[mainUnidadeSel.selectedIndex]?.text || baseId;
      selUnidade.innerHTML = `<option value="${escapeAttr(baseId)}">${escapeHtml(texto)}</option>`;
      selUnidade.disabled=false;
      selUnidade.value=baseId;
      carregarFuncoesUnidade(baseId, inpBusca?.value.trim()||'');
    }

    abrirBtn.addEventListener('click', async ()=>{
      const baseId=mainUnidadeSel.value;
      if(!baseId){ alert('Selecione uma Unidade antes.'); return; }
      console.info('[modal_funcao] Abrindo modal baseId=', baseId);
      carregarUnidadeSimples(baseId);
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });

    selUnidade?.addEventListener('change', ()=>{
      const id=selUnidade.value; if(!id){ renderFuncoes([]); return; }
      carregarFuncoesUnidade(id, inpBusca?.value.trim()||'');
    });

    inpBusca?.addEventListener('input', debounce(()=>{
      const termo=inpBusca.value.trim(); ultimoTermo=termo; const id=selUnidade?.value; if(!id) return; carregarFuncoesUnidade(id, termo); },350));

	ulFuncoes?.addEventListener('change', (ev) => {
		if (ev.target && ev.target.matches('input[name="optFuncao"]')) {
			btnConfirmar.disabled = false;
		}
	});

	btnConfirmar?.addEventListener('click', () => {
		const checked = ulFuncoes.querySelector('input[name="optFuncao"]:checked');
		if (!checked) { alert('Selecione uma função para confirmar.'); return; }
		const id = checked.value;
		const label = checked.dataset.label || '';
		const out = byId('funcao');
		if (out) {
			out.value = label; // exibe texto amigável
			out.dataset.funcaoId = id;
			out.title = label;
			let hidden = byId('funcao_id_hidden');
			if (!hidden) {
				hidden = document.createElement('input');
				hidden.type = 'hidden';
				hidden.name = 'funcao_id';
				hidden.id = 'funcao_id_hidden';
				out.parentNode.appendChild(hidden);
			}
			hidden.value = id;
		}
		bootstrap.Modal.getInstance(modalEl)?.hide();
	});
	}
})();
