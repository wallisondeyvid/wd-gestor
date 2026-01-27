(function(){
  console.log('[AUSENCIAS][BOOT] carregando script ausencias.js');
  'use strict';
  const state = { unidades: [], unidadeId: null, funcionario: null, lista: [], _jaPesquisou:false, carregando:false };

  // --- Utils data ---
  function pad(n){ return n<10?'0'+n:''+n; }
  function dateBrToISO(str){ if(!str) return null; const m=str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return null; const[_,d,mo,y]=m; return `${y}-${mo}-${d}`; }
  function dateISOToBr(str){ if(!str) return ''; const m=str.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return str; return `${m[3]}/${m[2]}/${m[1]}`; }
  function hojeBr(){ const dt=new Date(); return pad(dt.getDate())+'/'+pad(dt.getMonth()+1)+'/'+dt.getFullYear(); }
  function setLoading(f){ state.carregando=!!f; const btn=document.getElementById('btnPesquisarAusencias'); if(btn){ btn.disabled=f; btn.innerText=f?'Buscando...':'Pesquisar'; } }
  function toast(msg,t='info'){ console.log('[AUSENCIAS]['+t+']', msg); }

  // --- Calendários ---
  function initCalendars(){
    if(!window.flatpickr){ console.warn('[AUSENCIAS] flatpickr não disponível'); return; }
    const opts={ dateFormat:'d/m/Y', allowInput:false, locale:{ weekdays:{ shorthand:['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], longhand:['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'] }, months:{ shorthand:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], longhand:['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] } }, onChange: validarPeriodo };
    ['ausenciaInicio','ausenciaFim'].forEach(id=>{ const el=document.getElementById(id); if(el) window.flatpickr(el,opts); });
  }
  function validarPeriodo(){
    const iniEl=$('ausenciaInicio'); const fimEl=$('ausenciaFim'); if(!iniEl||!fimEl) return;
    const iniIso=dateBrToISO(iniEl.value); const fimIso=dateBrToISO(fimEl.value); if(iniIso && fimIso && iniIso>fimIso){ const tmp=iniEl.value; iniEl.value=fimEl.value; fimEl.value=tmp; }
  }

  // --- Helpers DOM ---
  function $(id){ return document.getElementById(id); }

  // --- Unidades ---
  function normalizarRespostaUnidades(raw){ if(Array.isArray(raw)) return raw; if(raw && Array.isArray(raw.unidades)) return raw.unidades; if(raw && Array.isArray(raw.data)) return raw.data; return []; }
  async function carregarUnidades(){
    const urls=['/escalas/api/unidades-relacionadas','/api/unidades-relacionadas'];
    for(const url of urls){
      try{
        const r=await fetch(url,{credentials:'same-origin'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const js=await r.json();
        state.unidades=normalizarRespostaUnidades(js);
        popularSelectUnidades();
        return;
      }catch(e){ console.warn('[AUSENCIAS] tentar', url, 'falhou:', e?.message||e); }
    }
    state.unidades=[]; popularSelectUnidades();
  }
  function popularSelectUnidades(){
    const sel=$('ausenciaUnidade'); if(!sel) return;
    sel.innerHTML='<option value="">'+(state.unidades.length? 'Selecione...' : 'Nenhuma unidade')+'</option>' + state.unidades
      .filter(u=> u && (u._id || u.id))
      .map(u=>{
        const idVal = u._id || u.id; if(!idVal || idVal==='undefined') return '';
        const codigo=u.codigo||''; const nome=u.nome||''; const label=(codigo&&nome)? `${codigo} - ${nome}` : (codigo||nome||'Sem identificação');
        return `<option value="${idVal}">${label}</option>`; }).join('');
  }

  // --- Funcionário ---
  function abrirModalFuncionario(){
    console.log('[AUSENCIAS][DEBUG] clique pesquisar funcionário');
    if(!(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function')){
      console.warn('[AUSENCIAS][DEBUG] função abrirModalPesquisarEfetivo indisponível no primeiro teste. Tentando inicialização lazily.');
      // Tentar localizar script e forçar execução de init se possível
      if(typeof window.dispatchEvent==='function'){
        // Forçar DOMContentLoaded tarde para script do modal caso não tenha rodado (edge case)
        document.querySelectorAll('script[src*="modal_pesquisar_efetivo"]').forEach(()=>{}); // placeholder se quisermos ações futuras
      }
    }
    if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){
      try {
        WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: (sel)=>{ const f=Array.isArray(sel)? sel[0]: sel; if(!f) return; setFuncionario({ id:f.id, nome:f.nome, codigo:f.codigo||f.matricula||f.id }); }});
      } catch(err){ console.error('[AUSENCIAS][DEBUG] erro ao abrir modal efetivo', err); }
    } else {
      alert('Modal de efetivo não disponível. (Ver console para diagnóstico)');
    }
  }
  function setFuncionario(func){ state.funcionario=func; const inp=$('ausenciaFuncionario'); if(inp) inp.value=func?.nome||''; }
  function limparFuncionario(){ setFuncionario({ id:null, nome:'', codigo:'' }); state.funcionario=null; }
  function limparUnidade(){ const sel=$('ausenciaUnidade'); if(sel) sel.value=''; state.unidadeId=null; }

  // --- CRUD API ---
  function paramsList(){
    const p=new URLSearchParams();
    const fId=state.funcionario?.id; if(fId) p.append('funcionarioId', fId);
    let uId = state.unidadeId || ($('ausenciaUnidade')?.value||'');
    if(uId==='undefined') uId='';
    if(uId) p.append('unidadeId', uId);
    const ini=dateBrToISO($('ausenciaInicio')?.value||''); const fim=dateBrToISO($('ausenciaFim')?.value||'');
    if(ini) p.append('inicio', ini); if(fim) p.append('fim', fim);
    return p.toString();
  }
  async function pesquisar(){
    // --- Validações obrigatórias ---
    const iniStr=$('ausenciaInicio')?.value||''; const fimStr=$('ausenciaFim')?.value||'';
    const ini=dateBrToISO(iniStr); const fim=dateBrToISO(fimStr);
    if(!iniStr || !fimStr){ alert('Informe o PERÍODO completo (data início e data fim).'); return; }
    if(!ini || !fim){ alert('Datas em formato inválido. Utilize dd/mm/aaaa.'); return; }
    if(ini>fim){ alert('Data inicial não pode ser posterior à data final.'); return; }
  const unidadeId = $('ausenciaUnidade')?.value || '';
  const funcionarioId = state.funcionario?.id || '';
  if(unidadeId && funcionarioId){ alert('Informe apenas UNIDADE ou FUNCIONÁRIO (exclusivos).'); return; }
  if(!unidadeId && !funcionarioId){ alert('Selecione uma UNIDADE ou um FUNCIONÁRIO antes de pesquisar.'); return; }
    state.unidadeId = unidadeId || null;

    state._jaPesquisou=true; setLoading(true); renderLista();
    try {
      const resp= await fetch('/escalas/api/ausencias?'+paramsList(), { credentials:'same-origin' });
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      const js= await resp.json(); state.lista= (js.data||[]).map(a=>({ ...a }));
    } catch(err){ toast('Erro ao buscar','erro'); state.lista=[]; }
    finally { setLoading(false); renderLista(); }
  }
  async function criarAusencia(payload){
    try {
      const resp= await fetch('/escalas/api/ausencias',{ method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(resp.status===409){ const js=await resp.json().catch(()=>({error:'Conflito'})); alert(js.error||'Período sobreposto.'); return null; }
      if(!resp.ok){ alert('Falha ao criar ausência'); return null; }
      const js=await resp.json(); return js.data;
    } catch(err){ alert('Erro de rede ao criar'); return null; }
  }
  async function atualizarAusencia(id,payload){
    try {
      const resp= await fetch('/escalas/api/ausencias/'+id,{ method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(resp.status===409){ const js=await resp.json().catch(()=>({error:'Conflito'})); alert(js.error||'Período sobreposto.'); return null; }
      if(!resp.ok){ alert('Falha ao atualizar ausência'); return null; }
      const js=await resp.json(); return js.data;
    } catch(err){ alert('Erro de rede ao atualizar'); return null; }
  }
  async function excluirAusencia(id){
    if(!confirm('Excluir registro?')) return false;
    try {
      const resp= await fetch('/escalas/api/ausencias/'+id,{ method:'DELETE', credentials:'same-origin' });
      if(!resp.ok){ alert('Falha ao excluir'); return false; }
      return true;
    } catch(err){ alert('Erro de rede ao excluir'); return false; }
  }

  // --- Render ---
  function renderLista(){
    const tbody=document.querySelector('#tabelaAusencias tbody'); if(!tbody) return;
    tbody.innerHTML='';
    if(state.carregando){ tbody.innerHTML='<tr><td colspan="5" class="text-center text-muted">Carregando...</td></tr>'; return; }
    if(!state.lista.length && state._jaPesquisou){ tbody.innerHTML='<tr><td colspan="5" class="text-center text-muted">Nenhum registro encontrado</td></tr>'; return; }
    tbody.innerHTML = state.lista.map(item=>{
      return `<tr data-id="${item._id}">`+
        `<td class="text-truncate" style="max-width:210px;">${item.funcionarioNome}</td>`+
        `<td class="text-truncate">${item.tipo}</td>`+
        `<td>${dateISOToBr(item.inicioISO)}</td>`+
        `<td>${dateISOToBr(item.fimISO)}</td>`+
        `<td><div class="d-flex gap-1 justify-content-center flex-nowrap">`+
          `<button type="button" class="btn btn-sm btn-outline-primary px-2" data-act="edit">Editar</button>`+
          `<button type="button" class="btn btn-sm btn-outline-danger px-2" data-act="del">Excluir</button>`+
        `</div></td>`+
      `</tr>`; }).join('');
    const btnRel=document.getElementById('btnRelatorioAusencias'); if(btnRel){ btnRel.disabled = state.lista.length===0; }
  }

  // --- Eventos tabela ---
  function bindTabela(){
    document.querySelector('#tabelaAusencias tbody')?.addEventListener('click', e=>{
      const btn=e.target.closest('button[data-act]'); if(!btn) return; const tr=btn.closest('tr'); const id=tr?.getAttribute('data-id');
      if(btn.getAttribute('data-act')==='del'){
        excluirAusencia(id).then(ok=>{ if(ok){ state.lista=state.lista.filter(r=> r._id!==id); renderLista(); }});
      } else if(btn.getAttribute('data-act')==='edit'){
        const registro=state.lista.find(r=> r._id===id); if(!registro){ alert('Registro não encontrado'); return; }
        if(window.WDG && typeof WDG.abrirModalCadastrarAusencia==='function'){
    WDG.abrirModalCadastrarAusencia({ modo:'editar', registro:{ id:registro._id, funcionarioId:registro.funcionarioId, funcionarioNome:registro.funcionarioNome, nome:registro.funcionarioNome, tipo:registro.tipo, inicio:dateISOToBr(registro.inicioISO), fim:dateISOToBr(registro.fimISO), motivo:registro.motivo, autorizadorId:registro.autorizadorId, autorizadorNome:registro.autorizadorNome }, onSave: async (regAtualizado,extra)=>{
              if(extra && extra.editing){
                const upd = await atualizarAusencia(regAtualizado.id, { inicioISO: regAtualizado.inicioISO, fimISO: regAtualizado.fimISO, tipo: regAtualizado.tipo, motivo: regAtualizado.motivo, autorizadorId: regAtualizado.autorizadorId, autorizadorNome: regAtualizado.autorizadorNome });
                if(upd){ state.lista = state.lista.map(r=> r._id===upd._id? upd : r); renderLista(); }
              }
          }});
        }
      }
    });
  }

  // --- Inserção ---
  function bindInserir(){
    const btn=$('btnInserirAusencia'); if(!btn) return;
    btn.addEventListener('click', ()=>{
      if(window.WDG && typeof WDG.abrirModalCadastrarAusencia==='function'){
        WDG.abrirModalCadastrarAusencia({ onSave: async (registro,extra)=>{
          const payload={ funcionarioId: registro.funcionarioId, funcionarioNome: (registro.funcionarioNome||registro.nome), tipo: registro.tipo, inicioISO: registro.inicioISO, fimISO: registro.fimISO, motivo: registro.motivo, autorizadorId: registro.autorizadorId, autorizadorNome: registro.autorizadorNome };
          if(extra && extra.editing && registro.id){
            const upd = await atualizarAusencia(registro.id, { inicioISO: payload.inicioISO, fimISO: payload.fimISO, tipo: payload.tipo, motivo: payload.motivo, autorizadorId: payload.autorizadorId, autorizadorNome: payload.autorizadorNome });
            if(upd){ state.lista = state.lista.map(r=> r._id===upd._id? upd : r); renderLista(); }
          } else {
            const novo = await criarAusencia(payload); if(novo){ state.lista.push(novo); renderLista(); }
          }
        }});
      } else alert('Componente de cadastro de ausência não disponível.');
    });
  }

  // --- Bind botões gerais ---
  function bindGeral(){
    const b1=$('btnPesquisarFuncionarioAusencia'); if(b1){ b1.addEventListener('click', ()=>{
      abrirModalFuncionario();
    }); b1._hasListener=true; }
    const b2=$('btnLimparFuncionarioAusencia'); if(b2){ b2.addEventListener('click', limparFuncionario); b2._hasListener=true; }
    const b3=$('btnPesquisarAusencias'); if(b3){ b3.addEventListener('click', pesquisar); b3._hasListener=true; }
    const selU=$('ausenciaUnidade'); if(selU){ selU.addEventListener('change', e=>{ 
      state.unidadeId = e.target.value || null; 
      if(state.unidadeId){ // se escolher unidade, limpar funcionário
        limparFuncionario();
      }
    }); }
    // Se selecionar funcionário (modal), limpar unidade automaticamente
    const origSetFuncionario = setFuncionario;
    // Wrapper apenas uma vez
    if(!state._wrappedSetFunc){
      state._wrappedSetFunc=true;
      window._origSetFuncionarioAusencias = origSetFuncionario;
      // Redefine função global interna
      const newSetter = function(func){
        origSetFuncionario(func);
        if(func && func.id){
          limparUnidade();
        }
      };
      // Substituir referência usada internamente
      // Não podemos reatribuir function declaration diretamente, então usamos state para indicar seleção
      // Usaremos um pequeno hook no modal: após seleção chamamos window._onFuncionarioSelecionadoAusencias
      window._onFuncionarioSelecionadoAusencias = newSetter;
    }
    const btnRel=$('btnRelatorioAusencias'); if(btnRel){
      btnRel.disabled=true;
      btnRel.addEventListener('click', ()=>{
        if(!state.lista.length) return;
        if(state.unidadeId && state.funcionario?.id){ alert('Relatório inválido: escolha UNIDADE ou FUNCIONÁRIO, não ambos.'); return; }
        let qs=paramsList();
        // Garantir que unidadeId seja enviado (state.unidadeId pode ter sido setado em pesquisar)
        if(state.unidadeId && !qs.includes('unidadeId=')){
          const sep = qs ? '&' : '';
          qs = qs + sep + 'unidadeId=' + encodeURIComponent(state.unidadeId);
        }
        window.open('/escalas/api/ausencias/relatorio?'+qs,'_blank');
      });
    }
  }

  function init(){
    console.log('[AUSENCIAS][BOOT] init chamado');
    if(!document.getElementById('appAusencias')){ console.warn('[AUSENCIAS][BOOT] container #appAusencias não encontrado — abortando init'); return; }
    carregarUnidades();
    bindGeral();
    bindInserir();
    bindTabela();
    initCalendars();
    console.log('[AUSENCIAS][BOOT] init concluído');
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
