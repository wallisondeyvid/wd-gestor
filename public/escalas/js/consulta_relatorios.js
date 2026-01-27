(function(){
  'use strict';
  const $ = (id)=> document.getElementById(id);

  function alertTop(msg, variant='danger', timeout=3500){
    const wrap=document.getElementById('alertsTopRight');
    if(!wrap){ alert(msg); return; }
    const id='al_'+Date.now()+Math.random().toString(16).slice(2);
    const div=document.createElement('div');
    div.id=id; div.className='toast align-items-center text-bg-'+(variant==='danger'?'danger':variant)+' border-0 show mb-2 shadow';
    div.setAttribute('role','alert'); div.style.minWidth='240px';
    div.innerHTML=`<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>`;
    wrap.appendChild(div);
    div.querySelector('.btn-close').onclick=()=>{ div.classList.remove('show'); setTimeout(()=>div.remove(),150); };
    setTimeout(()=>{ if(div.isConnected){ div.classList.remove('show'); setTimeout(()=>div.remove(),300); } }, timeout);
  }
  function escapeHtml(str){
    const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' };
    return (str||'').replace(/[&<>"']/g, s=> map[s]);
  }
  function isoFromBr(d){ const m=String(d||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return null; return `${m[3]}-${m[2]}-${m[1]}`; }
  function br(d){ if(!d) return ''; return d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4); }

  // (removido: antigo campo único de período)
    function initCalendars(){
      if(!window.flatpickr) return;
      const ini=$('dataInicial'); const fim=$('dataFinal');
      if(ini && !ini._fp) flatpickr(ini, { locale:'pt', dateFormat:'d/m/Y', allowInput:false, disableMobile:true });
      if(fim && !fim._fp) flatpickr(fim, { locale:'pt', dateFormat:'d/m/Y', allowInput:false, disableMobile:true });
    }
    function getPeriodoRange(){
      const iniBr = ($('dataInicial')?.value||'').trim();
      const fimBr = ($('dataFinal')?.value||'').trim();
      const ini = isoFromBr(iniBr);
      const fim = isoFromBr(fimBr);
      return { ini, fim };
    }
  function diffDiasInclusive(isoIni, isoFim){ try{ const a=new Date(isoIni+'T00:00:00'); const b=new Date(isoFim+'T00:00:00'); const dt=(b-a)/(24*3600*1000); return Math.floor(dt)+1; }catch(_){ return null; } }

  async function carregarUnidades(){
    const sel=$('unidadeSel'); if(!sel) return;
    try {
      let res = await fetch('/escalas/api/unidades-relacionadas', { credentials:'same-origin' });
      if(!res.ok){
        try { res = await fetch('/api/unidades-relacionadas', { credentials:'same-origin' }); }
        catch(_){ /* noop */ }
      }
      if(!res.ok) throw new Error('HTTP '+res.status);
      const js = await res.json();
      const list = Array.isArray(js.data)? js.data: [];
      // Sempre iniciar com "Selecione..." como opção ativa (sem autoseleção da única unidade)
      sel.innerHTML = '<option value="" selected>Selecione...</option>'
        + list.map(u=> `<option value="${u.id}">${u.codigo? (u.codigo+' - '):''}${u.nome}${u.is_principal?' (Matriz)':''}</option>`).join('');
      try { updateFiltroState(); } catch(_){ }
    } catch(e){ console.warn('[consulta-rel] falha unidades', e); }
  }

  function abrirModalFuncionario(){
    try{
      if(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function'){
        window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:function(f){
          try{
            const id = f && (f.id||f._id) || '';
            const nome = f && (f.nome || (f.codigo? (f.codigo+' - '):'') ) || '';
            $('funcionarioId').value = id;
            $('campoFuncionario').value = (nome || id);
            // Ao selecionar funcionário, limpar e bloquear unidade
            const uni = $('unidadeSel'); if(uni){ uni.value=''; uni.disabled=true; }
            const chk = $('chkIncluirSubord'); if(chk){ chk.disabled=true; chk.checked=false; }
            updateFiltroState();
          }catch(_){ }
        }});
      }
    }catch(_){ }
  }

  function limparFuncionario(){
    try{
      $('funcionarioId').value='';
      $('campoFuncionario').value='';
      // Reabilitar unidade
      const uni=$('unidadeSel'); if(uni) uni.disabled=false;
      const chk=$('chkIncluirSubord'); if(chk) chk.disabled=false;
      updateFiltroState();
    }catch(_){ }
  }

  function updateFiltroState(){
    const uni = $('unidadeSel');
    const funcId = ($('funcionarioId')?.value||'').trim();
    const btnSel = $('btnSelecionarFuncionario');
    const btnClr = $('btnLimparFuncionario');
    const campo = $('campoFuncionario');
    const unidadeSelecionada = !!(uni && uni.value);

    if(unidadeSelecionada){
      // Bloquear seleção de funcionário (ou manter o texto, mas impedir troca)
      if(btnSel) btnSel.disabled = true;
      if(campo) campo.classList.add('disabled');
    } else {
      if(btnSel) btnSel.disabled = false;
      if(campo) campo.classList.remove('disabled');
    }
    // Botão limpar só aparece quando há funcionário selecionado
    if(btnClr) btnClr.disabled = !funcId;
  }

  function updateTipoUI(){
    try{
      const isLogs = !!$('chkTipoLogs')?.checked;
      const secLogs = $('secLogsAdv');
      const secPor = $('secPeriodoPor');
      if(secLogs) secLogs.style.display = isLogs? '' : 'none';
      if(secPor) secPor.style.display = isLogs? '' : 'none';
    }catch(_){ }
  }

  function validarEntrada(){
    const { ini, fim } = getPeriodoRange();
      if(!ini || !fim){ alertTop('Informe Data inicial e Data final (máx. 31 dias).','warning'); return null; }
    if(ini>fim){ alertTop('Data inicial não pode ser maior que a Data final.','warning'); return null; }
    const dias = diffDiasInclusive(ini, fim);
    if(!Number.isFinite(dias) || dias<=0){ alertTop('Período inválido.','danger'); return null; }
    if(dias>31){ alertTop('O período máximo é de 31 dias.','warning'); return null; }
    return { ini, fim };
  }

  function abrirRelatorio(){
    const tipos = [];
    if($('chkTipoAloc')?.checked) tipos.push('alocacao');
    if($('chkTipoHoras')?.checked) tipos.push('horas');
    if($('chkTipoLogs')?.checked) tipos.push('logs');
    if(tipos.length===0){ alertTop('Selecione ao menos um tipo de relatório.','warning'); return; }
    if(tipos.length>1){ alertTop('Por enquanto, gere um tipo por vez. Selecione apenas um.','info'); return; }
    const tipo = tipos[0];
    const unidade = $('unidadeSel').value||'';
    const incluirSub = $('chkIncluirSubord').checked ? '1':'0';
    const funcionarioId = $('funcionarioId').value||'';
    const per = validarEntrada(); if(!per) return;

    // Mínimo útil: se tipo=alocacao e período de 1 dia, usamos o relatório diário já existente
    const umDia = (per.ini && per.fim && per.ini===per.fim);
    if(tipo==='alocacao' && umDia){
      if(!unidade){ alertTop('Selecione a unidade para o relatório diário.','warning'); return; }
      const params = new URLSearchParams();
      params.set('unidade', unidade);
      params.set('dia', per.ini);
      if(incluirSub==='1') params.set('incluirFiliais','1');
      // Nome do arquivo já está padronizado como Relatorio.pdf
      const url = `/escalas/relatorios/diaria/Relatorio.pdf?${params.toString()}`;
      window.open(url, '_blank');
      return;
    }

    // Alocação para intervalo (PDF novo)
    if(tipo==='alocacao'){
      const params = new URLSearchParams();
      params.set('inicio', per.ini);
      params.set('fim', per.fim);
      if(funcionarioId){
        params.set('funcionarioId', funcionarioId);
      } else if(unidade){
        params.set('unidadeId', unidade);
        if(incluirSub==='1') params.set('filiais','1');
      } else {
        alertTop('Selecione um Funcionário ou uma Unidade para gerar o relatório de alocação.', 'warning');
        return;
      }
      const url = `/escalas/relatorios/alocacao.pdf?${params.toString()}`;
      window.open(url, '_blank');
      return;
    }
    if(tipo==='horas'){
      const params = new URLSearchParams();
      params.set('inicio', per.ini);
      params.set('fim', per.fim);
      if(funcionarioId){
        params.set('funcionarioId', funcionarioId);
      } else if(unidade){
        params.set('unidadeId', unidade);
        if(incluirSub==='1') params.set('filiais','1');
      } else {
        alertTop('Selecione um Funcionário ou uma Unidade para gerar o relatório de horas.', 'warning');
        return;
      }
      const url = `/escalas/relatorios/horas.pdf?${params.toString()}`;
      window.open(url, '_blank');
      return;
    }
    if(tipo==='logs'){
      const params = new URLSearchParams();
      params.set('inicio', per.ini);
      params.set('fim', per.fim);
      // modo de período: dia (default) ou em (timestamp do evento)
      const porSel = ($('periodoPor')?.value||'dia');
      params.set('por', porSel==='em' ? 'em' : 'dia');
      // Filtros avançados (opcionais)
      const usuarioIdLog = ($('usuarioIdLog')?.value||'').trim();
      const acaoLog = ($('acaoLog')?.value||'').trim().toUpperCase();
      const contextoLog = ($('contextoLog')?.value||'').trim();
      const isHex24 = (s)=> /^[0-9a-fA-F]{24}$/.test(s||'');
      if(usuarioIdLog && isHex24(usuarioIdLog)) params.set('usuarioId', usuarioIdLog);
      if(acaoLog && ['INSERCAO','EXCLUSAO','MUDANCA'].includes(acaoLog)) params.set('acao', acaoLog);
      if(contextoLog && ['atribuicao','alocacao_recurso','alocacao_equipe'].includes(contextoLog)) params.set('contexto', contextoLog);
      if(funcionarioId){
        params.set('funcionarioId', funcionarioId);
      } else if(unidade){
        params.set('unidadeId', unidade);
        if(incluirSub==='1') params.set('filiais','1');
      } else {
        alertTop('Selecione um Funcionário ou uma Unidade para gerar o relatório de logs.', 'warning');
        return;
      }
      // Futuro: aceitar filtros avançados (usuarioId, acao, contexto)
      const url = `/escalas/relatorios/logs.pdf?${params.toString()}`;
      window.open(url, '_blank');
      return;
    }
    alertTop('Tipo de relatório inválido.', 'danger');
  }

  function bind(){
    const btn=$('btnSelecionarFuncionario'); if(btn) btn.addEventListener('click', abrirModalFuncionario);
    const go=$('btnGerar'); if(go) go.addEventListener('click', abrirRelatorio);
    const btnClr=$('btnLimparFuncionario'); if(btnClr) btnClr.addEventListener('click', limparFuncionario);
    const uni=$('unidadeSel'); if(uni) uni.addEventListener('change', ()=>{
      // Se selecionar unidade, bloquear funcionário
      updateFiltroState();
    });
    // Impor comportamento "ou um ou outro" para os checkboxes de tipo
    const tipos = ['chkTipoAloc','chkTipoHoras','chkTipoLogs'].map(id=> $(id)).filter(Boolean);
    function onTipoChange(e){
      try{
        const target = e.currentTarget || e.target;
        if(!target || !target.checked) return; // só reagir quando marcar
        tipos.forEach(box=>{ if(box!==target) box.checked = false; });
        updateTipoUI();
      }catch(_){ /* noop */ }
    }
    tipos.forEach(box=> box.addEventListener('change', onTipoChange));
    // Garantir que ao iniciar haja apenas um marcado; se nenhum, marcar alocação
    setTimeout(()=>{
      try{
        const any = tipos.some(b=> b.checked);
        if(!any){ const a=$('chkTipoAloc'); if(a) a.checked=true; }
        else {
          const first = tipos.find(b=> b.checked);
          tipos.forEach(box=>{ if(box!==first) box.checked=false; });
        }
        updateTipoUI();
      }catch(_){ }
    },0);
  }

  function init(){ initCalendars(); carregarUnidades(); bind(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
