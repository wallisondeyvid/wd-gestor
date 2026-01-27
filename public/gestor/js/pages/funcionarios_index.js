// Implementação unificada mínima funcional (sem delegação)
(function(){
  const basePath = (function(){
    try {
      const attr = document?.body?.getAttribute('data-base-path');
      if (attr && attr !== '/') return attr.replace(/\/$/, '');
      if (window.__WD_BASE_PATH && window.__WD_BASE_PATH !== '/') return String(window.__WD_BASE_PATH).replace(/\/$/, '');
    } catch(e) {}
    return '/gestor';
  })();

  console.log('[FUNC_INDEX][unificado] carregado basePath =', basePath);

  /* ================= WIZARD / ABAS (fallback) =================
   * O script completo (public/js/funcionarios/funcionarios_index.js) implementa
   * navegação entre abas e botões Próximo/Voltar. Caso ele ainda não tenha sido
   * carregado (ex: atraso de rede no fallback "v=full"), este módulo provê uma
   * versão simplificada para não quebrar a UX.
   */
  function __fallbackWizardInit(){
    if (window.__wdFuncionarioWizardInitialized) return; // idempotente
    window.__wdFuncionarioWizardInitialized = true;
    const tabsSelector = '#tabsFuncionario .nav-link';
    const btnProximo = document.getElementById('btnProximo');
    const btnVoltar  = document.getElementById('btnVoltar');
    const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
    const btnFinalizar = document.getElementById('btnFinalizar');
    if(!document.querySelector(tabsSelector)) return; // nada a fazer

    function getTabs(){ return Array.from(document.querySelectorAll(tabsSelector)); }
    function activeTab(){ return document.querySelector('#tabsFuncionario .nav-link.active'); }
    function updateButtons(){
      const tabs = getTabs();
      const at = activeTab();
      if(!tabs.length || !at) return;
      const idx = tabs.indexOf(at);
      const isFirst = idx===0;
      const isLast = idx===tabs.length-1;
      if(btnVoltar){ btnVoltar.disabled=isFirst; btnVoltar.style.opacity=isFirst?'0.5':'1'; }
      if(btnProximo){
        if(isLast){
          btnProximo.textContent = 'Cadastrar';
        } else {
          btnProximo.textContent = 'Próximo »';
        }
      }
      if(btnFinalizar){ btnFinalizar.classList.add('d-none'); }
    }
    function goNext(){
      const tabs = getTabs();
      const at = activeTab();
      const idx = tabs.indexOf(at);
      if(idx === -1) return;
      if(idx === tabs.length-1){
        // Última aba: submit do form
        const form = document.getElementById('formFuncionario');
        if(form) form.requestSubmit();
        return;
      }
      const next = tabs[idx+1];
      next?.click();
      updateButtons();
    }
    function goPrev(){
      const tabs = getTabs();
      const at = activeTab();
      const idx = tabs.indexOf(at);
      if(idx>0){ tabs[idx-1].click(); updateButtons(); }
    }
    btnProximo?.addEventListener('click', e=>{ e.preventDefault(); goNext(); });
    btnVoltar?.addEventListener('click', e=>{ e.preventDefault(); goPrev(); });
    btnCancelarEdicao?.addEventListener('click', e=>{ e.preventDefault(); /* noop fallback */ });
    // Reagir a mudança de aba via eventos do Bootstrap (se já carregado)
    document.addEventListener('shown.bs.tab', (ev)=>{
      if(ev.target && ev.target.closest('#tabsFuncionario')) updateButtons();
    });
    updateButtons();
    console.log('[FUNC_INDEX][unificado] Wizard fallback inicializado');
  }
  // Tenta inicializar cedo e re-testa após pequeno atraso (caso DOM das abas demore)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', __fallbackWizardInit); else __fallbackWizardInit();
  setTimeout(__fallbackWizardInit, 1200);

  async function carregarFuncionario(id, btn){
    try {
      btn && (btn.disabled=true, btn.dataset._old=btn.innerHTML, btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>');
      const resp = await fetch(`${basePath}/api/funcionarios/${id}`, { headers:{'Accept':'application/json'} });
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      const json = await resp.json();
      const f = json.funcionario || json.data || json;
      if(!f || !f._id) throw new Error('Formato inválido');
      // Preferir função completa se existir
      if (typeof window.fillFormWithFuncionario === 'function') {
        await window.fillFormWithFuncionario(f);
      } else {
        // Preenchimento básico fallback
        const form = document.getElementById('formFuncionario'); if(!form) return;
        const set=(n,v)=>{ const el=form.querySelector(`[name="${n}"]`); if(el) el.value=v??''; };
        set('nome', f.nome); set('cpf', f.cpf); set('pis', f.pis);
        if(f.unidade_id && f.unidade_id._id) set('unidade_id', f.unidade_id._id);
        if(f.funcao_id && f.funcao_id._id) set('funcao_id', f.funcao_id._id);
        let hid = form.querySelector('input[name="_id"]'); if(!hid){ hid=document.createElement('input'); hid.type='hidden'; hid.name='_id'; form.appendChild(hid);} hid.value=f._id;
        const titulo=document.getElementById('tituloFormFuncionario'); if(titulo) titulo.textContent='Editar Funcionário';
      }
      // Garantir botões visíveis e rolagem mesmo usando função completa
      document.getElementById('btnFinalizar')?.classList.remove('d-none');
      document.getElementById('btnCancelarEdicao')?.classList.remove('d-none');
      window.scrollTo({top:0,behavior:'smooth'});
    } catch(err){ console.error('[FUNC_INDEX][unificado] Erro editar', err); alert('Falha ao abrir para edição'); }
    finally { if(btn){ btn.disabled=false; btn.innerHTML=btn.dataset._old || 'Editar'; delete btn.dataset._old; } }
  }

  document.addEventListener('click', function(ev){
    const btn = ev.target.closest('.btn-edit-func');
    if(btn){ ev.preventDefault(); const tr=btn.closest('tr'); const id = tr?.dataset.funcId || tr?.getAttribute('data-func-id') || btn.dataset.id; if(!id){ console.warn('[FUNC_INDEX][unificado] ID ausente'); return;} carregarFuncionario(id, btn);} });

  document.addEventListener('submit', async function(ev){
    const form = ev.target.closest('form'); if(!form) return; const action=form.getAttribute('action')||'';
    if(/\/api\/funcionarios\/[^/]+\/delete$/.test(action)){
      ev.preventDefault(); if(!confirm('Confirmar exclusão do funcionário?')) return; const tr=form.closest('tr');
      try { const resp=await fetch(action,{method:'POST',headers:{'Accept':'application/json'}}); if(!resp.ok) throw new Error('HTTP '+resp.status); const j=await resp.json(); if(j.success||j.data?.deleted){ tr&&tr.remove(); } else alert('Não foi possível excluir'); }
      catch(e){ console.error('[FUNC_INDEX][unificado] Erro excluir', e); alert('Erro ao excluir'); }
    }

    // Intercepta criação/edição do formulário principal quando o script completo ainda não assumiu.
    if(form.id === 'formFuncionario') {
      // Se o script completo já disponibilizou o manipulador, delega a ele.
      if (typeof window.handleFormSubmission === 'function') {
        ev.preventDefault();
        try { window.handleFormSubmission(ev); } catch(err){ console.error('[FUNC_INDEX][unificado] Delegação p/ handleFormSubmission falhou:', err); }
        return;
      }

      ev.preventDefault();
      console.log('[FUNC_INDEX][unificado] Submit interceptado (fallback mínimo).');
      try {
        const fd = new FormData(form);
        const idField = form.querySelector('input[name="_id"]');
        let url = form.getAttribute('action') || (basePath + '/api/funcionarios');
        if(idField && idField.value) {
          // Update via method override
            url = `${basePath}/api/funcionarios/${idField.value}?_method=PUT`;
        }
        const resp = await fetch(url, { method: 'POST', body: fd, headers: { 'Accept':'application/json' } });
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        const json = await resp.json();
        console.log('[FUNC_INDEX][unificado] Resposta submit fallback:', json);
        const success = json.success !== false; // assume true quando campo ausente
        if(success) {
          // Mensagem simples inline
          inserirOuAtualizarAlerta('success', idField && idField.value ? 'Funcionário atualizado (fallback simples).' : 'Funcionário cadastrado (fallback simples).');
          // Se criou, limpa campos principais mínimos (nome/cpf/pis)
          if(!idField || !idField.value) {
            form.reset();
            const titulo=document.getElementById('tituloFormFuncionario'); if(titulo) titulo.textContent='Cadastrar Funcionário';
          }
        } else {
          inserirOuAtualizarAlerta('danger', 'Falha ao salvar funcionário (fallback).');
        }
      } catch(err){
        console.error('[FUNC_INDEX][unificado] Erro submit fallback:', err);
        inserirOuAtualizarAlerta('danger', 'Erro ao enviar formulário (fallback).');
      }
    }
  });

  function inserirOuAtualizarAlerta(tipo, mensagem){
    let area = document.getElementById('alertArea');
    if(!area){
      area = document.createElement('div'); area.id='alertArea';
      const f=document.getElementById('formFuncionario'); f && f.prepend(area);
    }
    area.innerHTML = `<div class="alert alert-${tipo} py-2 px-3 mb-2">${mensagem}</div>`;
  }
})();
