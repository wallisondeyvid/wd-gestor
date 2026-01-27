 (function(){
  function $(id){ return document.getElementById(id); }
  const stateLocal = { working:null };
  function ensureModal(){
    let modalEl = $('#modalSelecionarTurnos');
    if(modalEl && modalEl.querySelector('.modal-dialog')) return modalEl; // completo
    if(modalEl && !modalEl.querySelector('.modal-dialog')){
      // container placeholder: preencher estrutura bootstrap
      console.warn('[turnos][ensure] preenchendo estrutura do modal dentro do placeholder existente');
      modalEl.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Grupo de Turnos</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body pb-2">
              <form id="formSelecionarTurnos" class="row g-2 mb-2">
                <div class="col-12 col-md-3">
                  <label class="form-label req" for="nomeGrupoTurnos2">Nome</label>
                  <input type="text" id="nomeGrupoTurnos2" maxlength="20" class="form-control" placeholder="Grupo A" autocomplete="off" />
                </div>
                <div class="col-12 col-md-9">
                  <label class="form-label">Adicionar Turno</label>
                  <div class="d-flex gap-2 flex-wrap align-items-end">
                    <input type="time" id="horaInicioTurno2" class="form-control" style="max-width:140px" />
                    <span class="text-muted">às</span>
                    <input type="time" id="horaFimTurno2" class="form-control" style="max-width:140px" />
                    <input type="text" id="chamadaTurno2" class="form-control" style="max-width:130px" placeholder="Chamada" />
                    <button type="button" class="btn btn-outline-primary btn-sm" id="btnAddTurno2"><i class="bi bi-plus-circle"></i> Adicionar</button>
                  </div>
                </div>
              </form>
              <div class="table-responsive border rounded">
                <table class="table table-sm table-striped mb-0" id="tabelaTurnosGrupo2">
                  <thead class="table-light">
                    <tr><th style="width:140px">Início</th><th style="width:140px">Término</th><th>Chamada</th><th style="width:90px" class="text-center">Ação</th></tr>
                  </thead>
                  <tbody><tr class="text-muted"><td colspan="4" class="text-center small">Nenhum turno.</td></tr></tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
              <button type="button" class="btn btn-primary" id="btnSalvarGrupoTurnos2">Salvar Grupo</button>
            </div>
          </div>
        </div>`;
      return modalEl;
    }
    if(!modalEl){
      console.warn('[turnos][ensure] criando modal inexistente');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = `<div class="modal fade" id="modalSelecionarTurnos" tabindex="-1"></div>`;
      document.body.appendChild(wrapper.firstElementChild);
      return ensureModal();
    }
    return modalEl;
  }
  function abrir(grupo, opts){
    const modalEl = ensureModal();
    if(!modalEl){ console.error('[turnos][modal] não foi possível garantir modal'); return; }
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
  console.info('[turnos][init] modalTurnos pronto');
})();
