(function(){
  let modalEl, bsModal;
  // Lista de intervalos sendo editada nesta sessão
  let intervalos = [];
  // Janela do turno para validação
  let turnoIni = '00:00', turnoFim = '23:59';
  // Callback legado: para compatibilidade com chamadas antigas que esperavam 1 intervalo
  let callback = null; // function(intervalo | {lista, escopo})

  function calcularMin(hhmm){ const [h,m] = String(hhmm||'00:00').split(':').map(Number); return h*60+m; }
  function formatDuracao(mins){ if(mins<=0) return '0m'; const h=Math.floor(mins/60), m=mins%60; return h? (m? `${h}h${String(m).padStart(2,'0')}m` : `${h}h`) : `${m}m`; }
  // Mapeia um horário hh:mm para o "espaço" do turno atual (se cruzar a meia-noite, valores <= fim são +1440)
  function mapToTurnoSpace(hhmm){
    const s = calcularMin(turnoIni);
    const e = calcularMin(turnoFim);
    const v = calcularMin(hhmm);
    const wrap = e <= s;
    return (wrap && v <= e) ? (v + 1440) : v;
  }
  function duracaoIntervaloEditar(ini, fim){
    const s = calcularMin(turnoIni);
    const e = calcularMin(turnoFim);
    const wrap = e <= s;
    const start = mapToTurnoSpace(ini);
    const end = mapToTurnoSpace(fim);
    const sBound = s;
    const eBound = wrap ? (e + 1440) : e;
    if(!(start >= sBound && end <= eBound && end > start)) return 0;
    return Math.max(0, end - start);
  }
  function dentroDoTurno(ini,fim){
    const toMin = (hhmm)=>{ const [h,m]=String(hhmm||'00:00').split(':').map(Number); return (h*60+m); };
    const s = toMin(turnoIni);
    const e = toMin(turnoFim);
    const wrap = e <= s;
    const map = (valMin)=> wrap && valMin <= e ? (valMin + 1440) : valMin;
    const start = map(toMin(ini));
    const end = map(toMin(fim));
    const sBound = s;
    const eBound = wrap ? (e + 1440) : e;
    if(!(start >= sBound && start <= eBound - 1)) return false;
    if(!(end >= sBound + 1 && end <= eBound)) return false;
    if(!(end > start)) return false;
    return true;
  }
  function sobrepoe(a,b){
    // Considera wrap em relação ao turno atual
    const toMin=(hhmm)=>{ const [h,m]=String(hhmm||'00:00').split(':').map(Number); return h*60+m; };
    const s=toMin(turnoIni), e=toMin(turnoFim), wrap=e<=s;
    const map=(val)=>{ const v=toMin(val); return wrap && v <= e ? (v+1440): v; };
    const ai=map(a.inicio), af=map(a.fim), bi=map(b.inicio), bf=map(b.fim);
    return ai < bf && af > bi;
  }

  function renderTabela(){
    const tbody = document.querySelector('#tabelaIntervalosEditar tbody'); if(!tbody) return;
    // Ordenar pela posição no espaço do turno
    intervalos.sort((x,y)=> mapToTurnoSpace(x.inicio) - mapToTurnoSpace(y.inicio));
    tbody.innerHTML = intervalos.map((iv,idx)=>{
      const dur = duracaoIntervaloEditar(iv.inicio, iv.fim);
      return `<tr data-idx="${idx}">`
        + `<td>${iv.computavel?'<span class="badge bg-success">Sim</span>':'<span class="badge bg-secondary">Não</span>'}</td>`
        + `<td>${iv.inicio}</td>`
        + `<td>${iv.fim}</td>`
        + `<td>${formatDuracao(dur)}</td>`
        + `<td class="text-nowrap">`
        + `<button type="button" class="btn btn-sm btn-outline-danger" data-del-iv="${idx}"><i class="bi bi-trash"></i></button>`
        + `</td>`
        + `</tr>`;
    }).join('');
    tbody.querySelectorAll('[data-del-iv]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ const i=+btn.getAttribute('data-del-iv'); intervalos.splice(i,1); renderTabela(); });
    });
  }

  function addIntervaloAtual(){
    const ini = document.getElementById('refeicaoInicio').value;
    const fim = document.getElementById('refeicaoFim').value;
    const comp = !!document.getElementById('refeicaoComputavel').checked;
    if(!ini || !fim){ alert('Informe início e término'); return; }
    if(!dentroDoTurno(ini, fim)){ alert('Intervalo deve estar dentro do período do turno'); return; }
    const novo = { inicio: ini, fim: fim, computavel: comp };
    if(intervalos.some(iv=> sobrepoe(iv, novo))){ alert('Intervalo se sobrepõe a outro existente'); return; }
    intervalos.push(novo);
    document.getElementById('refeicaoInicio').value='';
    document.getElementById('refeicaoFim').value='';
    document.getElementById('refeicaoComputavel').checked=true;
    renderTabela();
  }

  function abrir(onSave, existente){
    modalEl = document.getElementById('modalEditarRefeicao');
    if(!modalEl){ console.error('modalEditarRefeicao não encontrado'); return; }
    if(!bsModal) bsModal = new bootstrap.Modal(modalEl);
    callback = onSave;
    // Reset lista; suportar lista completa (__lista) e também compatibilidade legada (um único intervalo)
    intervalos = [];
    if(existente && Array.isArray(existente.__lista) && existente.__lista.length){
      intervalos = existente.__lista
        .filter(iv=> iv && iv.inicio && iv.fim)
        .map(iv=> ({ inicio: iv.inicio, fim: iv.fim, computavel: !!iv.computavel }));
    } else if(existente && existente.inicio && existente.fim){
      intervalos.push({ inicio: existente.inicio, fim: existente.fim, computavel: (existente.tipo||'')==='computado' });
    }
    // Tentar exibir janela do turno no cabeçalho informativo (se disponível via variável global transitória)
    try {
      const info = document.getElementById('infoTurnoEditarRefeicao');
      if(info && window.__ULTIMO_TURNO_REF__ && window.__ULTIMO_TURNO_REF__.ini && window.__ULTIMO_TURNO_REF__.fim){
        turnoIni = window.__ULTIMO_TURNO_REF__.ini; turnoFim = window.__ULTIMO_TURNO_REF__.fim;
        info.textContent = `Turno: ${turnoIni} - ${turnoFim}`;
      } else { info && (info.textContent = ''); }
    } catch(_hdr){}
    renderTabela();
    bsModal.show();
  }

  async function onSubmit(e){
    e.preventDefault();
    // Determinar escopo de aplicação
    const escopo = document.querySelector('input[name="escopoIntervaloEditar"]:checked')?.value || 'atual';
    if(typeof callback === 'function'){
      // Enviar sempre payload com lista e escopo; manter campos legados quando houver ao menos 1
      let payload;
      if(intervalos.length>0){
        const primeiro = intervalos[0];
        payload = { inicio: primeiro.inicio, fim: primeiro.fim, tipo: primeiro.computavel ? 'computado' : 'nao_computado' };
      } else {
        // Lista vazia: sinaliza limpeza sem horários legados
        payload = {};
      }
      payload.__lista = intervalos.map(iv=> ({ inicio: iv.inicio, fim: iv.fim, computavel: iv.computavel }));
      payload.__escopo = escopo;
      try {
        const ret = callback(payload);
        if(ret && typeof ret.then==='function'){
          await ret;
        }
      } catch(_cb){}
    }
    try { bsModal.hide(); } catch(_h){}
  }

  function init(){
    const form = document.getElementById('formRefeicao');
    if(form && !form.__bound){ form.addEventListener('submit', onSubmit); form.__bound=true; }
    const btn = document.getElementById('btnAddIntervaloEditar');
    if(btn && !btn.__bound){ btn.addEventListener('click', addIntervaloAtual); btn.__bound=true; }
    // Stacking
    const el = document.getElementById('modalEditarRefeicao');
    if(el){
      el.addEventListener('show.bs.modal', ()=>{
        try {
          const openCount = document.querySelectorAll('.modal.show').length;
          const zIndex = 1050 + (openCount * 10);
          el.style.zIndex = String(zIndex);
          setTimeout(()=>{
            const backs = document.querySelectorAll('.modal-backdrop');
            const last = backs[backs.length-1];
            if(last){ last.style.zIndex = String(zIndex-1); last.classList.add('modal-stack'); }
          },0);
        } catch(_e){ }
      });
      el.addEventListener('hidden.bs.modal', ()=>{
        try { el.style.zIndex=''; } catch(_){ }
        setTimeout(()=>{
          const open = Array.from(document.querySelectorAll('.modal.show'));
          const backs = Array.from(document.querySelectorAll('.modal-backdrop'));
          if(open.length > 0){
            for(let i=backs.length-1; i>=1; i--){ try { backs[i].remove(); } catch(_r){} }
            const rem = document.querySelector('.modal-backdrop');
            if(rem){ rem.classList.remove('modal-stack'); rem.style.zIndex=''; }
            document.body.classList.add('modal-open');
            try { const top = open[open.length-1]; if(top){ top.style.zIndex=''; top.focus && top.focus(); } } catch(_f){}
          } else {
            backs.forEach(b=>{ try { b.remove(); } catch(_d){} });
            document.body.classList.remove('modal-open');
          }
        }, 50);
      });
    }
  }

  window.ModalEditarRefeicao = { abrir };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    try { init(); } catch(_e){}
  }
})();
