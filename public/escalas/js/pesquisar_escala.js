(function(){
  const $=id=>document.getElementById(id);
  const tipo = (window.ESCALA_PESQUISA_TIPO||'ordinaria').toLowerCase();
  const btnPesquisar=$('btnPesquisarEscalas');
  const btnNova=$('btnNovaEscala');
  const tabela=document.querySelector('#tabelaEscalas tbody');
  // Helpers para mensagens inline atraentes (caixas suaves)
    // ==== Floating alerts (canto superior direito) ====
    function alertTop(msg, variant='danger', timeout=4000){
      const wrap=document.getElementById('alertsTopRight');
      if(!wrap) return alert(msg); // fallback
      const id='al_'+Date.now()+Math.random().toString(16).slice(2);
      const div=document.createElement('div');
      div.id=id;
      div.className='toast align-items-center text-bg-'+(variant==='danger'?'danger':variant)+' border-0 show mb-2 shadow';
      div.setAttribute('role','alert');
      div.style.minWidth='240px';
      div.innerHTML=`<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-dismiss="toast" aria-label="Fechar"></button></div>`;
      wrap.appendChild(div);
      div.querySelector('.btn-close').onclick=()=>{ div.classList.remove('show'); setTimeout(()=>div.remove(),150); };
      setTimeout(()=>{ if(div.isConnected){ div.classList.remove('show'); setTimeout(()=>div.remove(),300); } }, timeout);
    }
    function mostrarErro(tipo,msg){ alertTop(msg,'danger'); }
    function limparErros(){ /* não necessário para floating; cada chamada é independente */ }

  function buildQuery(){
    const unidade=$('filtroUnidade').value.trim();
    const ini=$('periodoIni').value; const fim=$('periodoFim').value;
    const incluirFiliais = $('chkIncluirFiliais').checked? '1':'0';
    const q=new URLSearchParams();
    if(unidade) q.set('unidadeId', unidade);
    if(incluirFiliais==='1') q.set('filiais','1');
    if(ini) q.set('inicio', ini);
    if(fim) q.set('fim', fim);
    return q.toString();
  }
  async function pesquisar(){
    const unidadeEl=$('filtroUnidade');
    const iniEl=$('periodoIni');
    const fimEl=$('periodoFim');
    const unidadeVal = unidadeEl? unidadeEl.value.trim():'';
    const iniVal = iniEl? iniEl.value.trim():'';
    const fimVal = fimEl? fimEl.value.trim():'';
    // Limpa mensagens anteriores
      // limparErros(); // Not needed anymore
    // Validação obrigatória conforme regra: Unidade + Período completos
    let invalido=false;
    if(!unidadeVal){ mostrarErro('unidade','Selecione uma unidade.'); invalido=true; }
      if(!iniVal || !fimVal){ mostrarErro('periodo','Selecione um período.'); invalido=true; }
    if(invalido) return;
    // Validação básica formato dd/mm/aaaa
    const reData=/^\d{2}\/\d{2}\/\d{4}$/;
    if(!reData.test(iniVal) || !reData.test(fimVal)){ mostrarErro('periodo','Selecione um período.'); return; }
    // Evita enviar se fim < ini
    const toISO=d=>{ const m=d.split('/'); return m[2]+'-'+m[1]+'-'+m[0]; };
    if(new Date(toISO(fimVal)) < new Date(toISO(iniVal))){ mostrarErro('periodo','Selecione um período.'); return; }
    const qs=buildQuery();
    tabela.innerHTML='<tr><td colspan="4" class="text-center small text-muted">Buscando...</td></tr>';
    try {
      // Endpoint placeholder (ajustar quando backend for criado)
      const url = '/escalas/api/'+(tipo==='extraordinaria'?'extra':'ordinaria')+'/buscar'+(qs? ('?'+qs):'');
      const res = await fetch(url, { credentials:'same-origin' });
      if(!res.ok){ throw new Error('HTTP '+res.status); }
      const js=await res.json();
      if(!js.ok) throw new Error(js.error||'Falha');
      let lista = Array.isArray(js.data)? js.data : [];
      if(!lista.length){ tabela.innerHTML='<tr><td colspan="4" class="text-center small text-muted">Nenhuma escala encontrada.</td></tr>'; return; }
      // Segurança: se backend por algum motivo não ordenou, garantimos aqui.
      lista.sort((a,b)=>{
        const da=new Date(a.periodo?.ini||'1970-01-01').getTime();
        const db=new Date(b.periodo?.ini||'1970-01-01').getTime();
        if(da!==db) return da-db; return (a.descricao||'').localeCompare(b.descricao||'');
      });
      tabela.innerHTML=lista.map(e=>{
        const desc = (e.descricao||'-');
        const uniObj=e.unidade; // {id,codigo,nome}
        let uni='-';
        if(e.unidade_display){
          uni = e.unidade_display;
        } else if(uniObj){
          const cod = uniObj.codigo? (uniObj.codigo+' - '):'';
          uni = cod + (uniObj.nome||'');
        } else if(e.unidade_nome || e.unidade_codigo){
          const cod = e.unidade_codigo? (e.unidade_codigo+' - '):'';
          uni = cod + (e.unidade_nome||'');
        } else if(e.unidade_id){
          uni = e.unidade_id; // último fallback bruto
        }
        let periodo='-';
        if(e.periodo && e.periodo.ini && e.periodo.fim){ periodo = formatBr(e.periodo.ini)+' à '+formatBr(e.periodo.fim); }
        const id = e.id||e._id||'';
        const fechada = (e.status === 'fechada');
        const isMaster = document.body.getAttribute('data-user-master') === '1';
        let btnExcluirAttrs;
        if(fechada && !isMaster){
          btnExcluirAttrs = 'class="btn btn-outline-danger disabled" title="Escala fechada (somente master pode excluir)" data-act="excluir" disabled aria-disabled="true"';
        } else {
          btnExcluirAttrs = 'class="btn btn-outline-danger" title="'+(fechada? 'Excluir (fechada - permitido para master)':'Excluir')+'" data-act="excluir"';
        }
        return `<tr data-id="${id}">
          <td class="text-truncate" style="max-width:260px;" title="${escapeHtml(desc)}">${escapeHtml(desc)}</td>
          <td class="text-truncate" style="max-width:200px;" title="${escapeHtml(uni)}">${escapeHtml(uni)}</td>
          <td class="text-nowrap">${periodo}</td>
          <td class="text-center" style="white-space:nowrap;">
            <div class="btn-group btn-group-sm" role="group">
              <button class="btn btn-outline-primary" title="Editar" data-act="editar"><i class="bi bi-pencil"></i></button>
              <button ${btnExcluirAttrs}><i class="bi bi-trash"></i></button>
              <button class="btn btn-outline-secondary" title="Relatório" data-act="relatorio"><i class="bi bi-file-earmark-text"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');
    } catch(err){
      console.error('[escala][pesquisa] falha', err);
      tabela.innerHTML='<tr><td colspan="4" class="text-center small text-danger">Erro ao buscar escalas.</td></tr>';
    }
  }
  function formatBr(iso){ return iso? iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'-'; }
  function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }

  if(btnPesquisar) btnPesquisar.onclick=()=> pesquisar();
  // Delegação de eventos para ações de linha
  if(tabela){
    tabela.addEventListener('click', async (ev)=>{
      const btn=ev.target.closest('button[data-act]');
      if(!btn) return;
      const tr=btn.closest('tr[data-id]');
      const id=tr?.getAttribute('data-id');
      if(!id) return;
      const act=btn.getAttribute('data-act');
      if(act==='editar'){
        // Redireciona para página de edição reutilizando nova escala com ?id=
        const rotaBase = (tipo==='extraordinaria')? '/escalas/extraordinaria/nova' : '/escalas/ordinaria/nova';
        window.location.href = rotaBase + '?id=' + encodeURIComponent(id);
      } else if(act==='excluir'){
        if(!confirm('Confirma exclusão desta escala? Esta ação não pode ser desfeita.')) return;
        try {
          let resp = await fetch('/escalas/api/escalas/'+id, { method:'DELETE', credentials:'same-origin' });
          let js=null; let erroDetalhe='';
          try { js = await resp.json(); } catch(_e){}
          const exibirErro = (det)=> alertTop('Falha ao excluir: '+det, 'danger', 6000);
          if(!resp.ok || (js && js.ok===false)){
            // Tratar 403 especificamente com code
            if(resp.status===403){
              erroDetalhe = (js && (js.error||js.code))? (js.error + (js.code? ' ['+js.code+']':'')) : 'Proibido';
              exibirErro(erroDetalhe);
              return;
            }
            // Tentar alias se DELETE indisponível
            if(resp.status===405 || resp.status===404){
              const aliasResp = await fetch('/escalas/api/escalas/'+id+'/delete', { method:'POST', credentials:'same-origin' });
              try { js = await aliasResp.json(); } catch(_e){}
              if(!aliasResp.ok || (js && js.ok===false)){
                erroDetalhe = (js && (js.error||js.code))? (js.error + (js.code? ' ['+js.code+']':'')) : ('HTTP '+aliasResp.status);
                exibirErro(erroDetalhe);
                return;
              }
            } else {
              erroDetalhe = (js && (js.error||js.code))? (js.error + (js.code? ' ['+js.code+']':'')) : ('HTTP '+resp.status);
              exibirErro(erroDetalhe);
              return;
            }
          }
          if(!(js && js.ok)){
            exibirErro('Resposta inválida.');
            return;
          }
          tr.remove();
          if(!tabela.querySelector('tr')) tabela.innerHTML='<tr><td colspan="4" class="text-center small text-muted">Lista vazia.</td></tr>';
        } catch(e){ console.error('Erro excluir escala', e); alert('Erro ao excluir.'); }
      } else if(act==='relatorio'){
        // Abrir relatório em PDF (passa ID no caminho e na query). Inclui período selecionado para fixar o range de dias.
        const iniVal = (document.getElementById('periodoIni')||{}).value || '';
        const fimVal = (document.getElementById('periodoFim')||{}).value || '';
  const q = new URLSearchParams(); q.set('id', id);
  if(iniVal) q.set('inicio', iniVal); if(fimVal) q.set('fim', fimVal);
  // Abrir usando uma rota com nome amigável de arquivo no caminho, para o viewer exibir "Relatorio.pdf"
  const url = '/escalas/relatorios/Relatorio.pdf?'+q.toString();
        window.open(url,'_blank');
      }
    });
  }
  if(btnNova){
    btnNova.onclick=()=>{
      const base = tipo==='extraordinaria'? '/escalas/extraordinaria/nova' : '/escalas/ordinaria/nova';
      window.location.href = base;
    };
  }
  // Atalho Enter no período fim dispara busca
  const fim=$('periodoFim'); if(fim){ fim.addEventListener('keydown', e=>{ if(e.key==='Enter'){ pesquisar(); } }); }
  // Auto-preencher data final quando definir inicial
  const ini=$('periodoIni');
  function sameDayISO(dStr){ const m=dStr.split('/'); return m[2]+'-'+m[1]+'-'+m[0]; }
  if(ini){
    ini.addEventListener('change', ()=>{
      const val=ini.value.trim(); if(!val) return;
      if(fim){
        const fimVal=fim.value.trim();
        if(!fimVal){ fim.value=val; }
        else {
          // Se fim < ini, alinhar
          const dIni=new Date(sameDayISO(val)); const dFim=new Date(sameDayISO(fimVal));
          if(dFim < dIni){ fim.value=val; }
        }
        // Ajustar minDate via flatpickr se disponível e focar para abrir no mesmo mês
        if(fim._flatpickr){
          fim._flatpickr.set('minDate', val);
          // Sincroniza o calendário para o mês da data inicial
          try { const parts=val.split('/'); fim._flatpickr.jumpToDate(new Date(parts[2], parseInt(parts[1])-1, parseInt(parts[0]))); } catch(_e){}
        }
      }
    });
  }
})();
