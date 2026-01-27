(function(){
  'use strict';
  // --- Estado ---
  const state={
    unidadeId:null,
    funcionario:null, // {id,nome,codigo}
    ano:(new Date()).getFullYear(),
    lista:[],
    carregando:false
  };

  // --- Utilidades ---
  function basePath(){
    const el=document.getElementById('appFerias');
    let bp = el? (el.getAttribute('data-basepath')||'') : '';
    if(!bp) bp='/escalas';
    return bp.replace(/\/$/,'');
  }
  function $(id){ return document.getElementById(id); }
  function isoToBr(iso){ if(!iso) return ''; const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return iso; return `${m[3]}/${m[2]}/${m[1]}`; }
  function brToIso(br){ if(!br) return ''; const m=br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return ''; return `${m[3]}-${m[2]}-${m[1]}`; }
  function setLoading(flag){ state.carregando=!!flag; const btn=$('btnPesquisarFerias'); if(btn){ btn.disabled=flag; btn.innerText=flag?'Buscando...':'Pesquisar'; } }
  function toast(msg,tipo='info'){ console.log('[FERIAS][%s]', tipo, msg); /* Placeholder – pode integrar com toast real */ }

  // --- Carregar unidades ---
  async function carregarUnidades(){
    const sel=$('feriasUnidade');
    if(!sel) return;
    sel.innerHTML='<option value="">Carregando...</option>';
    const urls=[ basePath()+'/api/unidades-relacionadas', '/escalas/api/unidades-relacionadas', '/api/unidades-relacionadas' ];
    let ok=false;
    for(const url of urls){
      try{
        const r=await fetch(url,{credentials:'same-origin'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const js=await r.json();
        const unidades=(js.data||js.unidades||[])||[];
        sel.innerHTML=(unidades.length? '<option value="">Selecione...</option>' : '<option value="">Nenhuma unidade</option>') +
          unidades.filter(u=>u && (u._id||u.id)).map(u=>{
            const idVal=u._id||u.id; if(!idVal||idVal==='undefined') return '';
            const codigo=u.codigo||''; const nome=u.nome||'';
            const label=(codigo&&nome)? (codigo+' - '+nome) : (codigo||nome||'Sem identificação');
            return `<option value="${idVal}">${label}</option>`;
          }).join('');
        ok=true; break;
      }catch(_e){ /* tenta próxima */ }
    }
    if(!ok){ sel.innerHTML='<option value="">Falha ao carregar</option>'; }
  }

  // --- Seleção funcionário ---
  function bindFuncionario(){
    const inp=$('feriasFuncionario');
    const btn=$('btnPesquisarFuncionario');
    const btnLimpar=$('btnLimparFuncionario');
    if(btn){ btn.onclick=()=>{
      if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){
        WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:(ret)=>{
          let f = ret; if(Array.isArray(ret)) f = ret[0]; if(!f) return;
          state.funcionario={ id:f.id, nome:f.nome, codigo:f.codigo||f.matricula||f.id };
          inp.value=state.funcionario.nome;
        }});
      } else { alert('Modal de efetivo não disponível.'); }
    }; }
    if(btnLimpar){ btnLimpar.onclick=()=>{ state.funcionario=null; inp.value=''; }; }
  }

  // --- Ano ---
  function preencherAno(){
    const inp=$('feriasAno'); if(!inp) return; state.ano=parseInt(inp.value,10)||state.ano;
    inp.addEventListener('change', ()=>{ state.ano=parseInt(inp.value,10)||state.ano; });
    inp.addEventListener('input', ()=>{ state.ano=parseInt(inp.value,10)||state.ano; });
  }

  let _jaPesquisou=false;

  // --- Render tabela ---
  function renderTabela(){
    const tbody=document.querySelector('#tabelaFerias tbody'); if(!tbody) return;
    if(!_jaPesquisou && !state.lista.length){ tbody.innerHTML=''; return; }
    if(state.carregando){ tbody.innerHTML='<tr><td colspan="4" class="text-center text-muted">Carregando...</td></tr>'; return; }
    if(state.lista.length===0){ tbody.innerHTML='<tr class="text-muted"><td class="text-center" colspan="4">Nenhum registro encontrado.</td></tr>'; return; }
    tbody.innerHTML = state.lista.map(f=>{
      return `<tr data-id="${f._id}"><td class="text-truncate" style="max-width:280px;">${f.funcionarioNome||f.nome}</td><td>${isoToBr(f.inicioISO)||'-'}</td><td>${isoToBr(f.fimISO)||'-'}</td><td><div class="d-flex gap-1 justify-content-center flex-nowrap"><button type="button" class="btn btn-sm btn-outline-primary px-2" data-act="edit">Editar</button><button type="button" class="btn btn-sm btn-outline-danger px-2" data-act="del">Excluir</button></div></td></tr>`;
    }).join('');
    const btnRel=$('btnRelatorioFerias'); if(btnRel){ btnRel.disabled = state.lista.length===0; }
  }

  // --- Buscar lista ---
  async function pesquisar(){
    const ano=$('feriasAno')?.value||state.ano;
    const funcionarioId=state.funcionario?.id||'';
    const unidadeId=$('feriasUnidade')?.value||'';
    if(funcionarioId && unidadeId){ alert('Informe apenas UNIDADE ou FUNCIONÁRIO (exclusivos).'); return; }
    if(!funcionarioId && !unidadeId){ alert('Selecione uma UNIDADE ou um FUNCIONÁRIO.'); return; }
    if(!ano){ alert('Informe o ANO.'); return; }
    const anoNum=parseInt(ano,10); if(isNaN(anoNum)||anoNum<1900||anoNum>3000){ alert('Ano inválido.'); return; }
    const params=new URLSearchParams();
    params.append('ano', String(anoNum));
    if(funcionarioId) params.append('funcionarioId', funcionarioId);
    if(unidadeId) params.append('unidadeId', unidadeId);
    setLoading(true); _jaPesquisou=true; renderTabela();
    try{
      const resp = await fetch(basePath()+ '/api/ferias?'+params.toString(), { credentials:'same-origin' });
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      const js = await resp.json();
      state.lista = js.data||[];
    }catch(err){
      toast('Erro ao buscar férias','erro'); state.lista=[];
    }finally{ setLoading(false); renderTabela(); }
  }

  // --- Criar ---
  async function criarFerias(payload){
    try {
      const resp = await fetch(basePath()+'/api/ferias', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if(resp.status===409){ const js=await resp.json().catch(()=>({error:'Conflito'})); alert(js.error||'Período sobreposto.'); return null; }
      if(!resp.ok){ alert('Falha ao criar férias'); return null; }
      const js = await resp.json(); return js.data;
    } catch(err){ alert('Erro de rede ao criar'); return null; }
  }

  // --- Atualizar ---
  async function atualizarFerias(id,payload){
    try {
      const resp = await fetch(basePath()+'/api/ferias/'+id, { method:'PUT', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if(resp.status===409){ const js=await resp.json().catch(()=>({error:'Conflito'})); alert(js.error||'Período sobreposto.'); return null; }
      if(!resp.ok){ alert('Falha ao atualizar férias'); return null; }
      const js = await resp.json(); return js.data;
    } catch(err){ alert('Erro de rede ao atualizar'); return null; }
  }

  // --- Excluir ---
  async function excluirFerias(id){
    if(!confirm('Excluir registro?')) return false;
    try {
      const resp = await fetch(basePath()+'/api/ferias/'+id, { method:'DELETE', credentials:'same-origin' });
      if(!resp.ok){ alert('Falha ao excluir'); return false; }
      return true;
    } catch(err){ alert('Erro de rede ao excluir'); return false; }
  }

  // --- Abrir cadastro (modal) ---
  function abrirCadastro(){
    if(window.WDG && typeof WDG.abrirModalCadastrarFerias==='function'){
      WDG.abrirModalCadastrarFerias({ onSave: async (registro,extra)=>{
        // Registro vem do modal com datas BR e ISO geradas localmente.
        const payload={
          funcionarioId: registro.funcionarioId,
          funcionarioNome: registro.nome,
          inicioISO: registro.inicioISO,
            fimISO: registro.fimISO,
          ano: state.ano
        };
        let salvo=null;
        if(extra && extra.editing && registro.id){
          salvo = await atualizarFerias(registro.id, { inicioISO: payload.inicioISO, fimISO: payload.fimISO });
          if(salvo){
            // Substituir na lista
            state.lista = state.lista.map(r=> r._id===salvo._id? salvo : r);
            renderTabela();
          }
        } else {
          salvo = await criarFerias(payload);
          if(salvo){ state.lista.push(salvo); renderTabela(); }
        }
      } });
    } else { alert('Modal de cadastro de férias não disponível.'); }
  }

  // --- Eventos da tabela ---
  function bindTabela(){
    document.querySelector('#tabelaFerias tbody')?.addEventListener('click', e=>{
      const btn=e.target.closest('button[data-act]'); if(!btn) return;
      const tr=btn.closest('tr'); const id=tr?.getAttribute('data-id');
      if(btn.getAttribute('data-act')==='del'){
        excluirFerias(id).then(ok=>{ if(ok){ state.lista = state.lista.filter(x=> x._id!==id); renderTabela(); }});
      } else if(btn.getAttribute('data-act')==='edit'){
        const registro=state.lista.find(r=> r._id===id); if(!registro){ alert('Registro não encontrado'); return; }
        if(window.WDG && typeof WDG.abrirModalCadastrarFerias==='function'){
          WDG.abrirModalCadastrarFerias({ modo:'editar', registro:{ id:registro._id, funcionarioId:registro.funcionarioId, nome:registro.funcionarioNome, inicio: isoToBr(registro.inicioISO), fim: isoToBr(registro.fimISO) }, onSave: async (regAtualizado,extra)=>{
              if(extra && extra.editing){
                const upd = await atualizarFerias(regAtualizado.id, { inicioISO: regAtualizado.inicioISO, fimISO: regAtualizado.fimISO });
                if(upd){ state.lista = state.lista.map(r=> r._id===upd._id? upd : r); renderTabela(); }
              }
          }});
        }
      }
    });
  }

  // --- Bind botões principais ---
  function bindBotoes(){
    $('btnPesquisarFerias')?.addEventListener('click', pesquisar);
    const selU=$('feriasUnidade');
    if(selU){ selU.addEventListener('change', e=>{ if(e.target.value){ state.unidadeId=e.target.value; state.funcionario=null; const inp=$('feriasFuncionario'); if(inp) inp.value=''; } else { state.unidadeId=null; } }); }
    const btnRel=$('btnRelatorioFerias');
    if(btnRel){
      btnRel.disabled=true;
      btnRel.addEventListener('click', ()=>{
        if(!state.lista.length){ return; }
        const funcionarioId=state.funcionario?.id||'';
        const ano=$('feriasAno')?.value||state.ano;
        const unidadeId = $('feriasUnidade')?.value || '';
        if(funcionarioId && unidadeId){ alert('Relatório inválido: escolha UNIDADE ou FUNCIONÁRIO, não ambos.'); return; }
        if(!funcionarioId && !unidadeId){ alert('Selecione uma UNIDADE ou um FUNCIONÁRIO.'); return; }
        const params=new URLSearchParams();
        params.append('ano', ano);
        if(unidadeId) params.append('unidadeId', unidadeId);
        if(funcionarioId) params.append('funcionarioId', funcionarioId);
        window.open(basePath()+'/api/ferias/relatorio?'+params.toString(),'_blank');
      });
    }
    $('btnInserirFerias')?.addEventListener('click', abrirCadastro);
  }

  // --- Init ---
  function init(){
    carregarUnidades();
    bindFuncionario();
    preencherAno();
    bindBotoes();
    bindTabela();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
