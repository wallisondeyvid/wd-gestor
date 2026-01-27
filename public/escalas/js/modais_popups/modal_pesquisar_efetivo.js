// JS do modal de pesquisa de efetivo (versão consolidada - nome final)
(function(){
  const modalId = 'modalPesquisarEfetivo';
  let modalEl, modal, selBtn, tabelaBody, unidadeSel, codigoInput, nomeInput, form, btnLimpar, chkFiliais;
    let cpfInput;
  let unidadesCarregadas=false;
  let selecionado=null; // modo single
  let selecionadosMulti={}; // modo multi: { id: {id,nome,codigo} }
  let openOptions={ mode:'single', onSelect:null };

  function basePath(){
    let base='/escalas';
    try { const parts=location.pathname.split('/').filter(Boolean); const idx=parts.indexOf('escalas'); if(idx!==-1) base='/' + parts[idx]; } catch(_){ }
    return base;
  }

  async function carregarUnidades(){
    if(unidadesCarregadas) return; unidadesCarregadas=true;
  unidadeSel.innerHTML='<option value="" selected>Selecione...</option>';
    try {
      // Tenta com basePath e sem basePath para máxima compatibilidade
      let res = await fetch(basePath() + '/api/unidades-relacionadas',{credentials:'same-origin'});
      if(!res.ok){ try { res = await fetch('/api/unidades-relacionadas', { credentials:'same-origin' }); } catch(_f){} }
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      const list=Array.isArray(data.data)?data.data:[];
      unidadeSel.innerHTML='<option value="" selected>Selecione...</option>' + list.map(u=>`<option value="${u.id}">${u.codigo? u.codigo+' - ':''}${u.nome}${u.is_principal?' (Matriz)':''}</option>`).join('');
      try {
        // Se a página principal já tem unidade selecionada, refletir
        const principalSelect = document.getElementById('unidadeEscala');
        if(principalSelect && principalSelect.value && Array.from(unidadeSel.options).some(o=> o.value===principalSelect.value)){
          unidadeSel.value = principalSelect.value;
        } else if(list.length===1) {
          unidadeSel.value = String(list[0].id);
        }
      } catch(_pref){ }
    } catch(e){ console.warn('[modalEfetivo] falha carregar unidades', e); unidadeSel.innerHTML='<option value="" selected>(erro)</option>'; }
  }

  function sanitizeCodigo(v){ return (v||'').trim().toUpperCase().slice(0,30); }
  function formatarCPF(c){ const d=(c||'').replace(/\D/g,''); if(d.length!==11) return c||''; return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }

  async function pesquisar(e){
    e && e.preventDefault();
    selecionado=null; selecionadosMulti={}; atualizarBotaoInserir();
    const unidade=unidadeSel.value||''; const codigo=sanitizeCodigo(codigoInput.value); const nome=(nomeInput.value||'').trim();
  const cpfDigits=(cpfInput? cpfInput.value:'').replace(/\D/g,'');
  const params=new URLSearchParams(); if(unidade) params.append('unidade',unidade); if(codigo) params.append('codigo',codigo); if(nome) params.append('nome',nome); if(cpfDigits) params.append('cpf',cpfDigits); if(chkFiliais && chkFiliais.checked) params.append('incluirFiliais','1');
  tabelaBody.innerHTML='<tr><td colspan="5" class="text-center text-muted small py-3">Carregando...</td></tr>';
    try {
      const res=await fetch(basePath()+ '/api/funcionarios-responsaveis?'+params.toString(), {credentials:'same-origin'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const json=await res.json();
      const list=Array.isArray(json.data)?json.data:[];
  if(!list.length){ tabelaBody.innerHTML='<tr><td colspan="5" class="text-center text-muted small py-3">Nenhum resultado encontrado.</td></tr>'; return; }
      const inputType = openOptions.mode==='multi' ? 'checkbox' : 'radio';
      const groupName = openOptions.mode==='multi' ? 'selEfetivoEscalaMulti' : 'selEfetivoEscala';
      tabelaBody.innerHTML=list.map(f=>`<tr data-id="${f.id}" data-nome="${escapeHtml(f.nome)}" data-codigo="${escapeHtml(f.codigo||'')}">
        <td class="text-center"><input type="${inputType}" name="${groupName}" value="${f.id}"></td>
        <td>${escapeHtml(f.nome)}</td>
        <td>${escapeHtml(f.codigo||'')}</td>
  <td>${formatarCPF(f.cpf)||''}</td>
  <td>${escapeHtml(f.unidade_nome||'')}</td>
      </tr>`).join('');
  } catch(err){ console.error('[modalEfetivo] erro pesquisa', err); tabelaBody.innerHTML='<tr><td colspan="5" class="text-danger small text-center py-3">Erro ao pesquisar.</td></tr>'; }
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
  function onChangeTabela(e){
    const input=e.target.closest('input[type=radio],input[type=checkbox]');
    if(!input) return;
    const tr=input.closest('tr'); if(!tr) return;
    // Sanitiza payload para o consumidor do Efetivo
    const item={ id: tr.dataset.id, nome: tr.dataset.nome, codigo: tr.dataset.codigo };
    if(openOptions.mode==='multi'){
      if(input.checked){ selecionadosMulti[item.id]=item; } else { delete selecionadosMulti[item.id]; }
    } else {
      if(input.type==='radio' && input.checked){ selecionado=item; }
    }
    atualizarBotaoInserir();
  }
  function atualizarBotaoInserir(){
    if(!selBtn) return;
    if(openOptions.mode==='multi') selBtn.disabled = Object.keys(selecionadosMulti).length===0; else selBtn.disabled = !selecionado;
  }
  function limpar(){ form.reset(); codigoInput.value=''; nomeInput.value=''; selecionado=null; selecionadosMulti={}; atualizarBotaoInserir(); tabelaBody.innerHTML=''; }
  function aplicarSelecao(){
    let arr = openOptions.mode==='multi' ? Object.values(selecionadosMulti) : (selecionado? [selecionado]: []);
    // Fallback: se por algum motivo o estado interno estiver vazio, ler direto do DOM
    if(!arr.length){
      try {
        const marcados = modalEl.querySelectorAll('#tabelaResultadosEfetivo tbody input[type="checkbox"]:checked, #tabelaResultadosEfetivo tbody input[type="radio"]:checked');
        arr = Array.from(marcados).map(inp=>{
          const tr = inp.closest('tr');
          return tr? { id: tr.dataset.id, nome: tr.dataset.nome, codigo: tr.dataset.codigo }: null;
        }).filter(Boolean);
      } catch(_dom){}
    }
    if(!arr.length) return;
    // Inserção direta no modal de Efetivo, quando aberto a partir dele
    try {
      if(window.__EF_PESQ_OPENED_FROM_EQ__){
        if(typeof window.__efAdicionarSelecionadoEfetivo==='function'){
          arr.forEach(it=>{ try { window.__efAdicionarSelecionadoEfetivo(it); } catch(_e){} });
        } else {
          // Fallback local: atualizar diretamente a lista e o DOM do modal de Efetivo
          const ef = document.getElementById('modalEfetivoEquipe');
          const tbody = ef && ef.querySelector && ef.querySelector('#tabelaEfetivoEquipe tbody');
          if(ef && tbody){
            const list = Array.isArray(ef.__editingList)? ef.__editingList : (ef.__editingList=[]);
            arr.forEach(sel=>{
              try {
                const key = String(sel && (sel.id||sel._id||sel.funcionario_id||sel.codigo||sel.cpf) || '').toUpperCase();
                if(!key) return;
                const exists = list.some(c=> String(c.funcionario_id||c.id||c.codigo||c.cpf).toUpperCase()===key);
                if(exists) return;
                list.push({ id: sel.id||sel._id||key, funcionario_id: sel.id||sel._id||null, matricula: sel.codigo||sel.cpf||'', nome: sel.nome||'' });
              } catch(_one){}
            });
            ef.__editingList = list;
            try {
              tbody.innerHTML = list.map((c,i)=>{
                const ident=(c.matricula||c.codigo||c.id||'') + (c.nome? ' - '+c.nome : '');
                return `<tr data-idx="${i}"><td class="align-middle small">${ident}</td><td class="align-middle small"><span class="text-muted small">(calcular)</span></td><td class="align-middle text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="rem-comp">Remover</button></td></tr>`;
              }).join('');
              try {
                if(typeof ef.__efRender==='function') ef.__efRender();
                else if(typeof ef.__efRecalc==='function') ef.__efRecalc();
              } catch(_re){}
            } catch(_render){}
          }
        }
      }
    } catch(_in){ /* noop */ }
    // Callback explícito (se fornecido)
    if(typeof openOptions.onSelect==='function'){
      try { openOptions.onSelect(openOptions.mode==='multi'? arr : arr[0]); } catch(e){ console.warn('callback onSelect erro', e); }
    }
    // Eventos globais (para outros fluxos que escutam)
    try {
      if(openOptions.mode==='multi') window.dispatchEvent(new CustomEvent('escala:efetivoSelecionadoMultiplo',{ detail: arr }));
      else window.dispatchEvent(new CustomEvent('escala:efetivoSelecionado',{ detail: arr[0] }));
      // Cálculo é disparado pelo __efAdicionarSelecionadoEfetivo
    } catch(_ev){}
    modal.hide();
  }
  function bind(){
    form.addEventListener('submit', pesquisar);
    btnLimpar.addEventListener('click', (e)=>{ e.preventDefault(); limpar(); });
    tabelaBody.addEventListener('change', onChangeTabela);
    selBtn.addEventListener('click', aplicarSelecao);
    codigoInput.addEventListener('input', ()=>{ codigoInput.value = sanitizeCodigo(codigoInput.value); });
    // Atalho de teclado: Ctrl para alternar modo (opcional, não bloqueante)
    try {
      modalEl.addEventListener('keydown', (e)=>{
        if(e.ctrlKey && e.key.toLowerCase()==='m'){
          openOptions.mode = (openOptions.mode==='multi'? 'single':'multi');
          atualizarBotaoInserir();
          e.preventDefault();
        }
      });
    } catch(_kbd){}
  }
  function init(){
    modalEl=document.getElementById(modalId); if(!modalEl) return;
    form=document.getElementById('formBuscaEfetivo');
    unidadeSel=document.getElementById('filtroEfetivoUnidade');
    codigoInput=document.getElementById('filtroEfetivoCodigo');
  cpfInput=document.getElementById('filtroEfetivoCPF');
    if(cpfInput){
      cpfInput.addEventListener('input', ()=>{
        let d=cpfInput.value.replace(/\D/g,'').slice(0,11);
        if(d.length>9) cpfInput.value=d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if(d.length>6) cpfInput.value=d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if(d.length>3) cpfInput.value=d.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        else cpfInput.value=d;
      });
    }
    nomeInput=document.getElementById('filtroEfetivoNome');
    tabelaBody=document.querySelector('#tabelaResultadosEfetivo tbody');
    selBtn=document.getElementById('btnInserirEfetivo');
    btnLimpar=document.getElementById('btnLimparFiltroEfetivo');
    chkFiliais=document.getElementById('chkEfetivoIncluirFiliais');
    modal=new bootstrap.Modal(modalEl);
    // Prevenir fechamento do Efetivo enquanto a pesquisa estiver ativa (sinalizado pela flag global)
    try {
      const ef = document.getElementById('modalEfetivoEquipe');
      if(ef && !ef.__guardHideBound){
        ef.__guardHideBound = function(e){ try { if(window.__EF_PESQ_OPENED_FROM_EQ__) e.preventDefault(); } catch(_){} };
        ef.addEventListener('hide.bs.modal', ef.__guardHideBound);
      }
    } catch(_g){}
    // Garantir empilhamento sem fechar o modal de Efetivo por baixo
    modalEl.addEventListener('show.bs.modal', ()=>{
      try {
        // Marca que foi aberto a partir do Efetivo se ele estiver visível
        const ef = document.getElementById('modalEfetivoEquipe');
        const stacked = !!(ef && ef.classList.contains('show'));
        window.__EF_PESQ_OPENED_FROM_EQ__ = stacked;
        if(stacked){
          // Prevenir que o Bootstrap feche o modal de Efetivo durante a abertura deste
          const preventHide = function(e){ try { e.preventDefault(); } catch(_){} };
          if(!ef.__preventHideBound){
            ef.addEventListener('hide.bs.modal', preventHide);
            ef.__preventHideBound = preventHide;
          }
        }
      } catch(_s){}
    });
  modalEl.addEventListener('shown.bs.modal', ()=>{
      // Se já existe outro modal visível (ex: modalEfetivoEquipe), ajustar empilhamento
      try {
        const openModals = Array.from(document.querySelectorAll('.modal.show')).filter(m=> m!==modalEl);
        if(openModals.length){
          // Bootstrap padrão usa 1055/1050 para modal/backdrop. Vamos subir este para 1065.
          modalEl.style.zIndex = 1065;
          // Ajustar backdrop mais recente
          const backdrops = document.querySelectorAll('.modal-backdrop');
          if(backdrops.length){ backdrops[backdrops.length-1].style.zIndex = 1060; }
        }
      } catch(_e){}
      // Garantir acessibilidade: remover aria-hidden se ainda marcado erroneamente
      if(modalEl.getAttribute('aria-hidden') === 'true'){
        modalEl.removeAttribute('aria-hidden');
      }
      // Foco seguro (adiado um tick) para evitar competir com outras rotinas de bootstrap
      setTimeout(()=>{
        try {
          (cpfInput && cpfInput.value==='')? cpfInput.focus(): codigoInput.focus();
        } catch(_f){}
      },0);
      try { carregarUnidades(); } catch(_cu){}
    });
    modalEl.addEventListener('hide.bs.modal', ()=>{
      // Restaura foco e libera prevenção de hide do modal Efetivo, se aplicável
      try {
        const ef = document.getElementById('modalEfetivoEquipe');
        if(window.__EF_PESQ_OPENED_FROM_EQ__ && ef){
          // Foco volta para o botão Adicionar dentro do modal Efetivo
          const addBtn = ef.querySelector('#btnAdicionarEfetivo');
          if(addBtn) addBtn.focus();
          // Remove listener de prevenção de hide
          if(ef.__preventHideBound){ ef.removeEventListener('hide.bs.modal', ef.__preventHideBound); delete ef.__preventHideBound; }
          if(ef.__guardHideBound){ /* mantém guard enquanto flag estiver ativa */ }
        } else {
          // Caso tenha sido aberto por outro fluxo, foca no botão do responsável como antes
          const opener = document.getElementById('btnSelecionarResponsavel');
          if (opener) opener.focus();
        }
      } catch(_h){}
    });
    modalEl.addEventListener('hidden.bs.modal', ()=>{
      // Limpa customização para próximas aberturas isoladas
      if(modalEl.style.zIndex) delete modalEl.style.zIndex;
      try { window.__EF_PESQ_OPENED_FROM_EQ__ = false; } catch(_f){}
      // Não alteramos backdrop aqui pois Bootstrap remove automaticamente o último.
    });
    bind();
    // Fallback: garantir que o botão de selecionar responsável abra este modal
    try {
      var btnResp = document.getElementById('btnSelecionarResponsavel');
      if(btnResp && !btnResp.__wdgBound){
        btnResp.__wdgBound=true;
        btnResp.addEventListener('click', function(){
          if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){
            window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:function(f){
              try {
                var inp = document.getElementById('responsavelNome');
                if(inp && f){ inp.value = f.nome || f.codigo || f.id || ''; }
                if(f && f.id){
                  window.__ESCALA_STATE__ = window.__ESCALA_STATE__||{};
                  window.__ESCALA_STATE__.responsavel = { id:f.id, nome:f.nome||f.codigo||f.id };
                  // Ativar o botão salvar ao alterar o responsável
                  const btn = document.getElementById('btnSalvarSecDados');
                  if(btn){
                    btn.disabled = false;
                  }
                }
              } catch(_e){}
            }});
          }
        });
      }
    } catch(_fb){ /* ignore */ }
  }
  // Inicialização: se DOM já carregou, chamar init imediatamente; senão aguardar DOMContentLoaded
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    try { init(); } catch(e){ console.warn('[modalEfetivo] falha init imediato', e); }
  }
  window.WDG = window.WDG||{};
  window.WDG.abrirModalPesquisarEfetivo = function(opts){
    if(!modal) init(); if(!modal) return;
    // Se foi aberto a partir do Efetivo (flag global), preferir modo múltiplo como padrão
    var defaultMode = (window.__EF_PESQ_OPENED_FROM_EQ__ ? 'multi' : 'single');
    openOptions = Object.assign({ mode: defaultMode, onSelect:null }, opts||{});
    // Reset seleção ao abrir
    selecionado=null; selecionadosMulti={}; atualizarBotaoInserir(); tabelaBody.innerHTML='';
  if(selBtn){ selBtn.textContent = openOptions.mode==='multi' ? 'Inserir Selecionados' : 'Inserir'; selBtn.prepend && selBtn.querySelector('i.bi')==null && (selBtn.innerHTML='<i class="bi bi-check2"></i> '+selBtn.textContent); }
  // Autopreencher unidade com a selecionada na página principal (se existir select#unidadeEscala)
    try {
  if(unidadeSel && unidadeSel.value===''){ // só se continua vazio
        const principalSelect = document.getElementById('unidadeEscala');
        if(principalSelect && principalSelect.value){
          // Garantir que as unidades foram carregadas antes de setar valor
          carregarUnidades().then(()=>{
            if(unidadeSel.value==='' && Array.from(unidadeSel.options).some(o=> o.value===principalSelect.value)){
              unidadeSel.value = principalSelect.value;
              // NÃO dispara pesquisa automática para evitar pré-seleção implícita em escala nova
              // Usuário decide quando buscar.
            }
          });
        }
      }
    } catch(_autofillErr){}
    modal.show();
    try { if(modalEl.getAttribute('aria-hidden')==='true') modalEl.removeAttribute('aria-hidden'); } catch(_a){}
  };
})();
