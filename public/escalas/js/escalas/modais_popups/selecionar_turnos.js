// espelho do arquivo original para compatibilidade de path
(function(){
  function $(id){ return document.getElementById(id); }
  const stateLocal = { working:null };
  function abrir(grupo, opts){
    const modalEl = $('#modalSelecionarTurnos');
    if(!modalEl){ console.warn('[turnos][modal] não encontrado'); return; }
    const nome = $('#nomeGrupoTurnos2');
    const ini = $('#horaInicioTurno2');
    const fim = $('#horaFimTurno2');
    const chamada = $('#chamadaTurno2');
    const tbody = $('#tabelaTurnosGrupo2').querySelector('tbody');
    const btnAdd = $('#btnAddTurno2');
    const btnSalvar = $('#btnSalvarGrupoTurnos2');
    stateLocal.working = grupo ? JSON.parse(JSON.stringify(grupo)) : { id:null, nome:'', turnos:[] };
    nome.value = stateLocal.working.nome||'';
    ini.value=fim.value=chamada.value='';
    renderTurnos();
    btnAdd.onclick = ()=>{
      const vi=ini.value.trim(); const vf=fim.value.trim(); const vc=chamada.value.trim();
      if(!vi||!vf) return alert('Informe início e término');
      if(vf===vi) return alert('Horários iguais');
      const conflito = stateLocal.working.turnos.some(t=> (vi>=t.ini && vi<t.fim) || (vf>t.ini && vf<=t.fim) || (vi<=t.ini && vf>=t.fim));
      if(conflito) return alert('Conflito com turno existente');
      stateLocal.working.turnos.push({ ini:vi, fim:vf, chamada:vc });
      stateLocal.working.turnos.sort((a,b)=> a.ini.localeCompare(b.ini));
      ini.value=fim.value=chamada.value='';
      renderTurnos();
    };
    tbody.onclick = (ev)=>{
      const btn = ev.target.closest('button[data-act]'); if(!btn) return;
      const act = btn.getAttribute('data-act');
      const idx = +btn.getAttribute('data-idx');
      if(act==='del'){ stateLocal.working.turnos.splice(idx,1); renderTurnos(); }
    };
    btnSalvar.onclick = ()=>{
      stateLocal.working.nome = nome.value.trim()||'Grupo';
      if(!stateLocal.working.turnos.length) return alert('Adicione pelo menos um turno');
      if(!stateLocal.working.id) stateLocal.working.id = 'g'+Math.random().toString(36).slice(2,10);
      if(opts && typeof opts.onSave==='function'){ opts.onSave(stateLocal.working); }
      const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl); inst.hide();
    };
    const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl); inst.show();
  }
  function renderTurnos(){
    const tbody = document.querySelector('#tabelaTurnosGrupo2 tbody');
    if(!tbody) return;
    const list = (stateLocal.working && Array.isArray(stateLocal.working.turnos))? stateLocal.working.turnos:[];
    if(!list.length){ tbody.innerHTML='<tr class="text-muted"><td colspan="4" class="text-center small">Nenhum turno.</td></tr>'; return; }
    tbody.innerHTML = list.map((t,i)=>`<tr><td>${t.ini}</td><td>${t.fim}</td><td>${t.chamada||''}</td><td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" data-act="del" data-idx="${i}"><i class="bi bi-x"></i></button></td></tr>`).join('');
  }
  window.WDG = window.WDG || {};
  window.WDG.modalTurnos = { abrir };
})();
