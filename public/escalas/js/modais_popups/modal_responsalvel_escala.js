// JS do modal de pesquisa de efetivo (renomeado a partir do antigo modal de responsável)
(function(){
  const modalId = 'modalPesquisarEfetivo';
  let modalEl, modal, selBtn, tabelaBody, unidadeSel, codigoInput, nomeInput, form, btnLimpar, chkFiliais;
  let unidadesCarregadas=false;
  let selecionado=null;

  function basePath(){
    let base='/escalas';
    try { const parts=location.pathname.split('/').filter(Boolean); const idx=parts.indexOf('escalas'); if(idx!==-1) base='/' + parts[idx]; } catch(_){ }
    return base;
  }

  async function carregarUnidades(){
    if(unidadesCarregadas) return; unidadesCarregadas=true;
    unidadeSel.innerHTML='<option value="">(todas)</option>';
    try {
      const res=await fetch(basePath() + '/api/unidades-relacionadas',{credentials:'same-origin'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data=await res.json();
      const list=Array.isArray(data.data)?data.data:[];
      unidadeSel.innerHTML='<option value="">(todas)</option>' + list.map(u=>`<option value="${u.id}">${u.codigo? u.codigo+' - ':''}${u.nome}${u.is_principal?' (Matriz)':''}</option>`).join('');
    } catch(e){ console.warn('[modalResponsavel] falha carregar unidades', e); unidadeSel.innerHTML='<option value="">(erro)</option>'; }
  }

  function sanitizeCodigo(v){ return (v||'').trim().toUpperCase().slice(0,30); }

  async function pesquisar(e){
    e && e.preventDefault();
    selecionado=null; atualizarBotaoInserir();
  const unidade=unidadeSel.value||''; const codigo=sanitizeCodigo(codigoInput.value); const nome=(nomeInput.value||'').trim();
  const params=new URLSearchParams(); if(unidade) params.append('unidade',unidade); if(codigo) params.append('codigo',codigo); if(nome) params.append('nome',nome); if(chkFiliais && chkFiliais.checked) params.append('incluirFiliais','1');
  tabelaBody.innerHTML='<tr><td colspan="4" class="text-center text-muted small py-3">Carregando...</td></tr>';
    try {
      const res=await fetch(basePath()+ '/api/funcionarios-responsaveis?'+params.toString(), {credentials:'same-origin'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const json=await res.json();
      const list=Array.isArray(json.data)?json.data:[];
      if(!list.length){ tabelaBody.innerHTML='<tr><td colspan="4" class="text-center text-muted small py-3">Nenhum resultado encontrado.</td></tr>'; return; }
      tabelaBody.innerHTML=list.map(f=>`<tr data-id="${f.id}" data-nome="${escapeHtml(f.nome)}" data-codigo="${escapeHtml(f.codigo||'')}">
        <td class="text-center"><input type="radio" name="selEfetivoEscala" value="${f.id}"></td>
        <td>${escapeHtml(f.nome)}</td>
        <td>${escapeHtml(f.codigo||'')}</td>
        <td>${escapeHtml(f.unidade_nome||'')}</td>
      </tr>`).join('');
    } catch(err){ console.error('[modalResponsavel] erro pesquisa', err); tabelaBody.innerHTML='<tr><td colspan="4" class="text-danger small text-center py-3">Erro ao pesquisar.</td></tr>'; }
  }

  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
  // Mantido apenas se precisarmos formatar algo futuro; por agora não formata código
  function formatCodigo(c){ return c; }

  function onChangeTabela(e){
  const radio=e.target.closest('input[type=radio][name=selEfetivoEscala]');
    if(!radio) return;
    const tr=radio.closest('tr');
  selecionado={ id: tr.dataset.id, nome: tr.dataset.nome, codigo: tr.dataset.codigo };
    atualizarBotaoInserir();
  }

  function atualizarBotaoInserir(){
    if(selBtn) selBtn.disabled = !selecionado;
  }

  function limpar(){
  form.reset(); codigoInput.value=''; nomeInput.value=''; selecionado=null; atualizarBotaoInserir(); tabelaBody.innerHTML='';
  }

  function aplicarSelecao(){
    if(!selecionado) return; // Preenche campo na tela principal
    // Disparamos evento genérico de efetivo selecionado
    window.dispatchEvent(new CustomEvent('escala:efetivoSelecionado',{ detail: selecionado }));
    modal.hide();
  }

  function bind(){
    form.addEventListener('submit', pesquisar);
    btnLimpar.addEventListener('click', (e)=>{ e.preventDefault(); limpar(); });
    tabelaBody.addEventListener('change', onChangeTabela);
    selBtn.addEventListener('click', aplicarSelecao);
    codigoInput.addEventListener('input', ()=>{ codigoInput.value = sanitizeCodigo(codigoInput.value); });
  }

  function init(){
  modalEl=document.getElementById(modalId); if(!modalEl) return;
    form=document.getElementById('formBuscaEfetivo');
    unidadeSel=document.getElementById('filtroEfetivoUnidade');
    codigoInput=document.getElementById('filtroEfetivoCodigo');
    nomeInput=document.getElementById('filtroEfetivoNome');
    tabelaBody=document.querySelector('#tabelaResultadosEfetivo tbody');
    selBtn=document.getElementById('btnInserirEfetivo');
  btnLimpar=document.getElementById('btnLimparFiltroEfetivo');
  chkFiliais=document.getElementById('chkEfetivoIncluirFiliais');
    modal=new bootstrap.Modal(modalEl);
    modalEl.addEventListener('shown.bs.modal', ()=>{ carregarUnidades(); codigoInput.focus(); });
    bind();
  }

  document.addEventListener('DOMContentLoaded', init);
  // Expor função global para abrir
  window.WDG = window.WDG||{};
  window.WDG.abrirModalPesquisarEfetivo = function(){ if(!modal) init(); if(!modal) return; modal.show(); };
})();
