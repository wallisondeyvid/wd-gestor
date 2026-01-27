(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  let modalEl = document.getElementById('modalEditHabAluguel');
  let bsModal = null;
  if(modalEl){ bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static' }); }

  const elHab = document.getElementById('alugHabLabel');
  const elProp = document.getElementById('alugPropLabel');
  const elAlugado = document.getElementById('alugadoSwitch');
  const tbBody = document.getElementById('alugMoradoresBody');
  const inpInicio = document.getElementById('locacaoInicio');
  const inpFim = document.getElementById('locacaoFim');
  const inpContrato = document.getElementById('contratoFile');
  const filePreviewWrap = document.getElementById('contratoFilePreview');
  const filePreviewLabel = document.getElementById('contratoFilePreviewLabel');
  const filePreviewLink = document.getElementById('contratoFilePreviewLink');
  const filePreviewSize = document.getElementById('contratoFilePreviewSize');
  const btnFileRemover = document.getElementById('btnContratoFileRemover');
  const contratosListBody = document.getElementById('alugContratosListBody');
  const contratosPageSizeSel = document.getElementById('contratosPageSize');
  const contratosPager = document.getElementById('contratosPaginas');
  const btnLimpar = document.getElementById('btnAluguelLimpar');
  const btnContratoInserir = document.getElementById('btnContratoInserir');
  const btnContratoLimpar = document.getElementById('btnContratoLimpar');
  const btnSalvar = document.getElementById('btnAluguelSalvar');

  let current = { hab: null, moradores: [], prop: null, contrato: null, contratos: [], editingIndex: null, responsavelId: null, editingRemoveFile: false };
  let contratosPage = 0;
  function getContratosPageSize(){
    const v = parseInt(contratosPageSizeSel && contratosPageSizeSel.value || '25', 10);
    return (!isNaN(v) && v>0) ? v : 25;
  }

  if(tbBody){
    tbBody.addEventListener('change', function(ev){
      const input = ev.target && ev.target.closest('input[name="resp_fin_group"]');
      if(!input) return;
      if(input.disabled){ renderMoradores(); return; }
      setResponsavel(input.value);
    });
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

  function parseDateBRorISO(s){
    if(!s) return null;
    if(s instanceof Date && !isNaN(s.getTime())) return s;
    if(typeof s === 'number'){ const dNum = new Date(s); return isNaN(dNum)? null : dNum; }
    s=String(s).trim();
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m){ var d=new Date(+m[3], +m[2]-1, +m[1]); return isNaN(d)? null : d; }
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if(iso){ var dIso=new Date(+iso[1], +iso[2]-1, +iso[3]); return isNaN(dIso)? null : dIso; }
    var d2 = new Date(s); return isNaN(d2)? null : d2;
  }

  const MAX_CONTRATO_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  function toErrorText(val){
    if(val == null) return '';
    if(typeof val === 'string') return val;
    if(val instanceof Error){ return val.message || String(val); }
    if(Array.isArray(val)){ return val.map(toErrorText).filter(Boolean).join('\n'); }
    if(typeof val === 'object'){
      if(typeof val.message === 'string' && val.message){ return val.message; }
      if(typeof val.error === 'string' && val.error){ return val.error; }
      try { return JSON.stringify(val); } catch(_e) { return String(val); }
    }
    return String(val);
  }

  function showToast(message, type){
    const text = toErrorText(message);
    if(!text) return;
    let container = document.getElementById('toastContainerAluguel');
    if(!container){
      container = document.createElement('div');
      container.id = 'toastContainerAluguel';
      container.style.position = 'fixed';
      container.style.top = '1rem';
      container.style.right = '1rem';
      container.style.zIndex = '1060';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '.5rem';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-bg-' + (type || 'secondary') + ' border-0 show shadow';
    toast.style.minWidth = '260px';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    const safeHtml = escapeHtml(text).replace(/\n/g, '<br>');
    toast.innerHTML = '<div class="d-flex"><div class="toast-body">' + safeHtml + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>';
    container.appendChild(toast);
    const remover = () => { try { toast.remove(); } catch(_){} };
    const closeBtn = toast.querySelector('.btn-close');
    if(closeBtn){ closeBtn.addEventListener('click', remover); }
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(remover, 300);
    }, 4000);
  }
  function formatBR(dateLike){
    try{
      if(!dateLike) return '';
      const d = (dateLike instanceof Date) ? dateLike : parseDateBRorISO(String(dateLike));
      if(!d || isNaN(d.getTime())) return '';
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }catch(_e){ return ''; }
  }

  function formatHabLabel(item){
    const unidade = item.unidade || {}; const code = unidade.codigo||''; const nome = unidade.nome||'';
    const bloco = item.bloco && item.bloco.nome ? ('Bloco ' + item.bloco.nome) : '';
    const andar = item.andar && item.andar.nome ? item.andar.nome : '';
    const tipoNumero = [item.tipo||'', item.numero||''].filter(Boolean).join(' ');
    return [ [code, nome].filter(Boolean).join(' - '), bloco, andar, tipoNumero ].filter(Boolean).join(' - ');
  }

  function calcAge(dateLike){
    const d = parseDateBRorISO(dateLike);
    if(!d) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const monthDiff = today.getMonth() - d.getMonth();
    if(monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age--;
    return age;
  }

  function isMoradorMenorDeIdade(m){
    if(!m) return false;
    const age = calcAge(m.data_nascimento || m.dataNascimento);
    return age != null && age < 18;
  }

  function getProprietarioResponsavelId(){
    if(!(current.prop && current.prop.nome)) return null;
    const propNome = String(current.prop.nome).trim().toLowerCase();
    if(!propNome) return null;
    const match = (current.moradores||[]).find(m => String(m.nome||'').trim().toLowerCase() === propNome);
    if(!match || !match._id) return null;
    return String(match._id);
  }

  function isSameContrato(a, b){
    if(!a || !b) return false;
    if(a._id && b._id && String(a._id) === String(b._id)) return true;
    const aIni = parseDateBRorISO(a?.periodo?.inicio || a?.vigencia_inicio || a?.inicio);
    const aFim = parseDateBRorISO(a?.periodo?.fim || a?.vigencia_fim || a?.fim);
    const bIni = parseDateBRorISO(b?.periodo?.inicio || b?.vigencia_inicio || b?.inicio);
    const bFim = parseDateBRorISO(b?.periodo?.fim || b?.vigencia_fim || b?.fim);
    if(aIni && aFim && bIni && bFim && aIni.getTime() === bIni.getTime() && aFim.getTime() === bFim.getTime()){
      const urlA = a?.url || '';
      const urlB = b?.url || '';
      if(!urlA && !urlB) return true;
      if(urlA && urlB) return urlA === urlB;
    }
    return false;
  }

  function applyResponsavelToCurrent(id){
    const val = id ? String(id) : null;
    current.responsavelId = val;
    if(current.contrato){
      current.contrato.responsavel_morador_id = val || null;
    }
    if(Array.isArray(current.contratos)){
      let updated = false;
      current.contratos = current.contratos.map((c, idx, arr) => {
        const shouldApply = current.contrato ? isSameContrato(c, current.contrato) : (idx === arr.length - 1);
        if(shouldApply){
          updated = true;
          return { ...c, responsavel_morador_id: val || null };
        }
        return c;
      });
      if(!updated && current.contratos.length){
        const lastIdx = current.contratos.length - 1;
        current.contratos[lastIdx] = { ...current.contratos[lastIdx], responsavel_morador_id: val || null };
      }
    }
  }

  function setResponsavel(id){
    const forcedId = getProprietarioResponsavelId();
    const val = id ? String(id) : null;
    if(forcedId && forcedId !== val){
      applyResponsavelToCurrent(forcedId);
      renderMoradores();
      return;
    }
    if(val){
      const mor = (current.moradores||[]).find(m => String(m._id||'') === val);
      if(!mor){
        applyResponsavelToCurrent(null);
        renderMoradores();
        return;
      }
      if(isMoradorMenorDeIdade(mor)){
        showToast('Morador menor de 18 anos não pode ser responsável financeiro.', 'warning');
        renderMoradores();
        return;
      }
    }
    applyResponsavelToCurrent(val);
    renderMoradores();
  }

  // Normaliza objeto de contrato para garantir periodo preenchido mesmo em registros legados
  function normalizeContrato(c){
    if(!c || typeof c !== 'object') return c;
    const out = { ...c };
    const hasPeriodo = out.periodo && (out.periodo.inicio || out.periodo.fim);
    if(!hasPeriodo){
      const inicio = out.vigencia_inicio || out.inicio_vigencia || out.inicio || null;
      const fim = out.vigencia_fim || out.fim_vigencia || out.fim || null;
      out.periodo = { inicio, fim };
    } else if(out.periodo) {
      out.periodo = { ...out.periodo };
    }
    return out;
  }
  function normalizeContratosList(list){
    return Array.isArray(list) ? list.map(normalizeContrato) : [];
  }

  function renderMoradores(){
    if(!tbBody) return;
    tbBody.innerHTML = '';
    const respGroup = 'resp_fin_group';
    const forcedId = getProprietarioResponsavelId();
    const moradorMap = new Map((current.moradores||[]).map(m => [String(m._id||''), m]));
    if(current.responsavelId && !moradorMap.has(String(current.responsavelId))){
      applyResponsavelToCurrent(null);
    }
    if(forcedId && String(current.responsavelId||'') !== forcedId){
      applyResponsavelToCurrent(forcedId);
    }
    const respId = current.responsavelId ? String(current.responsavelId) : null;
    const propNome = (current.prop && current.prop.nome) ? String(current.prop.nome).trim().toLowerCase() : '';
    const alugadoAtivo = !!(elAlugado && elAlugado.checked);

    (current.moradores||[]).forEach(m => {
      const tr = document.createElement('tr');
      const id = String(m._id||'');
      const tdInq = document.createElement('td');
      const tdNome = document.createElement('td');
      const tdResp = document.createElement('td');
      const tdAcoes = document.createElement('td');

      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.className = 'form-check-input';
      const isPropMor = !!propNome && (String(m.nome||'').trim().toLowerCase() === propNome);
      const initialChecked = alugadoAtivo && !isPropMor && !!m.inquilino;
      chk.checked = initialChecked; chk.setAttribute('data-id', id);
      chk.disabled = !alugadoAtivo || isPropMor;
      tdInq.appendChild(chk);

      tdNome.textContent = m.nome || '';

      const rad = document.createElement('input');
      rad.type = 'radio'; rad.name = respGroup; rad.className = 'form-check-input'; rad.value = id;
      const isMenor = isMoradorMenorDeIdade(m);
      rad.disabled = isMenor || (forcedId && forcedId !== id);
      if(isMenor) rad.title = 'Morador menor de 18 anos não pode ser responsável financeiro.';
      rad.checked = respId === id;
      rad.setAttribute('data-id', id);
      tdResp.appendChild(rad);

      const btnDel = document.createElement('button');
      btnDel.type = 'button'; btnDel.className = 'wdg-icon-btn'; btnDel.title = 'Excluir morador'; btnDel.setAttribute('aria-label','Excluir morador');
      const imgDel = document.createElement('img'); imgDel.src = basePath + '/images/excluir.png'; imgDel.alt = 'Excluir';
      btnDel.appendChild(imgDel);
      btnDel.addEventListener('click', async function(){
        if(!id){ return; }
        if(!confirm('Confirmar exclusão deste morador?')) return;
        try{
          const res = await fetch(basePath + '/api/moradores/' + encodeURIComponent(id) + '?hard=1', {
            method:'DELETE',
            credentials:'same-origin',
            headers:{ 'Accept':'application/json' }
          });
          let respJson = null;
          try { respJson = await res.json(); } catch(_jsonErr) { respJson = null; }
          if(!res.ok || (respJson && respJson.ok === false)){
            showToast('Falha ao excluir morador.', 'danger');
            return;
          }
          current.moradores = current.moradores.filter(x => String(x._id)!==id);
          if(current.hab && Array.isArray(current.hab.moradores)){
            current.hab.moradores = current.hab.moradores.filter(x => String(x._id)!==id);
          }
          const forcedAfter = getProprietarioResponsavelId();
          if(current.responsavelId && String(current.responsavelId) === id){
            if(forcedAfter){ applyResponsavelToCurrent(forcedAfter); }
            else { applyResponsavelToCurrent(null); }
          }
          renderMoradores();
          try{
            document.dispatchEvent(new CustomEvent('habitacao:moradores:atualizado', {
              detail: {
                habitacaoId: current.hab && current.hab._id ? String(current.hab._id) : null,
                removedMoradorId: id
              }
            }));
          }catch(_evtErr){}
        }catch(_err){
          showToast('Falha ao excluir morador.', 'danger');
        }
      });
      tdAcoes.appendChild(btnDel);

      tr.appendChild(tdInq); tr.appendChild(tdNome); tr.appendChild(tdResp); tr.appendChild(tdAcoes);
      tbBody.appendChild(tr);
    });
  }

  function populate(item){
    current.hab = item || null;
    current.prop = item && item.proprietario ? item.proprietario : null;
    current.moradores = Array.isArray(item && item.moradores) ? item.moradores.map(m=>({ ...m })) : [];
    current.contrato = item && item.contrato_locacao ? normalizeContrato(item.contrato_locacao) : null;
    const rawList = Array.isArray(item && item.contratos_locacao) ? item.contratos_locacao : [];
    current.contratos = normalizeContratosList(rawList);
    // guarantee unique latest contract included even if not in list
    if (current.contrato) {
      const hasCurrent = current.contratos.some(c => isSameContrato(c, current.contrato));
      if (!hasCurrent) current.contratos.push({ ...current.contrato });
    }
    // Garantia extra: se há contrato atual mas a lista veio vazia, incluir o atual na listagem
    if ((!Array.isArray(current.contratos) || current.contratos.length === 0) && current.contrato) {
      current.contratos = [ { ...current.contrato } ];
    }
    const forcedRespId = getProprietarioResponsavelId();
    if(forcedRespId){
      applyResponsavelToCurrent(forcedRespId);
    } else if(current.contrato && current.contrato.responsavel_morador_id){
      applyResponsavelToCurrent(current.contrato.responsavel_morador_id);
    } else {
      applyResponsavelToCurrent(null);
    }
    current.editingIndex = null;
    current.editingRemoveFile = false;

    if(elHab) elHab.textContent = formatHabLabel(item);
    if(elProp) elProp.textContent = (current.prop && current.prop.nome) ? current.prop.nome : '—';
    if(elAlugado) elAlugado.checked = !!item.alugado;

    // Campos do formulário começam vazios para permitir nova inserção imediata
    if(inpInicio) inpInicio.value = '';
    if(inpFim) inpFim.value = '';
    if(inpContrato) inpContrato.value = '';
    updateFilePreview();

    renderMoradores();
    contratosPage = 0;
    renderContratos();
  }

  function resetForm(){
    if(!current.hab) return;
    populate(current.hab);
    inpContrato.value = '';
  }

  function renderContratos(){
    if(!contratosListBody) return;
    contratosListBody.innerHTML='';
    const list = normalizeContratosList(current.contratos);
    current.contratos = list;
    const today = new Date(); today.setHours(0,0,0,0);
    const pageSize = getContratosPageSize();
    const totalPages = Math.ceil((list.length||0) / pageSize) || 1;
    if(contratosPage<0) contratosPage=0; if(contratosPage>=totalPages) contratosPage=totalPages-1;
    const start = contratosPage*pageSize; const slice = list.slice(start, start+pageSize);
    slice.forEach(function(c, localIdx){
      const idx = start + localIdx;
      const tr = document.createElement('tr');
  const tdIni = document.createElement('td'); tdIni.textContent = (c.periodo && c.periodo.inicio) ? formatBR(c.periodo.inicio) : '';
  const tdFim = document.createElement('td'); tdFim.textContent = (c.periodo && c.periodo.fim) ? formatBR(c.periodo.fim) : '';
      const tdLink = document.createElement('td');
      if(c.url){ const a=document.createElement('a'); a.href=c.url; a.target='_blank'; a.rel='noopener'; a.textContent=c.nome||'Contrato'; tdLink.appendChild(a); } else { tdLink.textContent = c.nome || '—'; }
      const tdVig = document.createElement('td');
  const dIni = parseDateBRorISO((c && c.periodo && c.periodo.inicio) || c?.vigencia_inicio);
  const dFim = parseDateBRorISO((c && c.periodo && c.periodo.fim) || c?.vigencia_fim);
      let vigente = false;
      if(dIni && dFim){
        const di = new Date(dIni.getFullYear(), dIni.getMonth(), dIni.getDate());
        const df = new Date(dFim.getFullYear(), dFim.getMonth(), dFim.getDate());
        vigente = (today.getTime() >= di.getTime() && today.getTime() <= df.getTime());
      }
      tdVig.textContent = vigente ? 'Sim' : 'Não';
      const tdAcoes = document.createElement('td');
      // Editar
      const btnEdit = document.createElement('button'); btnEdit.type='button'; btnEdit.className='wdg-icon-btn'; btnEdit.title='Editar'; btnEdit.setAttribute('aria-label','Editar');
      const imgE=document.createElement('img'); imgE.src=basePath + '/images/editar.png'; imgE.alt='Editar'; btnEdit.appendChild(imgE);
      btnEdit.addEventListener('click', function(){
        // Carrega dados no formulário para facilitar novo lançamento (a edição cria nova versão como vigente)
        inpInicio.value = formatBR(c?.periodo?.inicio) || '';
        inpFim.value = formatBR(c?.periodo?.fim) || '';
        if(inpContrato) inpContrato.value = '';
        current.editingIndex = idx;
        current.editingRemoveFile = false;
        if(c && c.responsavel_morador_id){
          applyResponsavelToCurrent(String(c.responsavel_morador_id));
        }
        renderMoradores();
        updateFilePreview();
      });
      // Remover
      const btnDel = document.createElement('button'); btnDel.type='button'; btnDel.className='wdg-icon-btn'; btnDel.title='Remover'; btnDel.setAttribute('aria-label','Remover');
      const imgD=document.createElement('img'); imgD.src=basePath + '/images/excluir.png'; imgD.alt='Remover'; btnDel.appendChild(imgD);
      btnDel.addEventListener('click', async function(){
        if(!current.hab || !current.hab._id) return; if(!confirm('Remover este contrato?')) return;
        const novaLista = list.filter(function(_c, i){ return i!==idx; });
        try{
          const payload = { contratos_locacao: novaLista, contrato_locacao: (novaLista.length? normalizeContrato(novaLista[novaLista.length-1]) : null) };
          await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(current.hab._id)), {
            method:'PUT', credentials:'same-origin', headers:{ 'Content-Type':'application/json','Accept':'application/json' },
            body: JSON.stringify(payload)
          }).then(r=>r.json());
          current.contratos = novaLista;
          current.contrato = payload.contrato_locacao;
          const forcedAfterRemoval = getProprietarioResponsavelId();
          if(current.contrato && current.contrato.responsavel_morador_id){
            applyResponsavelToCurrent(current.contrato.responsavel_morador_id);
          } else if(forcedAfterRemoval){
            applyResponsavelToCurrent(forcedAfterRemoval);
          } else {
            applyResponsavelToCurrent(null);
          }
          renderContratos();
          renderMoradores();
        }catch(_e){ showToast('Falha ao remover contrato.', 'danger'); }
      });
      tdAcoes.appendChild(btnEdit); tdAcoes.appendChild(btnDel);
      tr.appendChild(tdIni); tr.appendChild(tdFim); tr.appendChild(tdLink); tr.appendChild(tdVig); tr.appendChild(tdAcoes);
      contratosListBody.appendChild(tr);
    });
    buildContratosPager(totalPages, list.length);
  }

  function buildContratosPager(totalPages, totalItems){ if(!contratosPager) return; contratosPager.innerHTML=''; if(totalPages<=1){ const info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' contrato(s)'; contratosPager.appendChild(info); return; }
    function mk(label, go, dis){ const b=document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=!!dis; b.addEventListener('click', function(){ contratosPage=go; renderContratos(); }); return b; }
    const win=5; const start=Math.max(0, contratosPage-Math.floor(win/2)); const end=Math.min(totalPages-1, start+win-1);
    contratosPager.appendChild(mk('<<',0,contratosPage===0)); contratosPager.appendChild(mk('<',contratosPage-1,contratosPage===0));
    if(start>0){ const b0=mk('1',0,false); if(contratosPage===0) b0.classList.add('active'); contratosPager.appendChild(b0); const dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; contratosPager.appendChild(dots); }
    for(let p=start;p<=end;p++){ const b=mk(String(p+1),p,false); if(p===contratosPage) b.classList.add('active'); contratosPager.appendChild(b); }
    if(end<totalPages-1){ const dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; contratosPager.appendChild(dots2); const blast=mk(String(totalPages), totalPages-1,false); if(contratosPage===totalPages-1) blast.classList.add('active'); contratosPager.appendChild(blast); }
    contratosPager.appendChild(mk('>', contratosPage+1, contratosPage===totalPages-1)); contratosPager.appendChild(mk('>>', totalPages-1, contratosPage===totalPages-1));
    const info2=document.createElement('div'); info2.className='w-100 text-center mt-1'; info2.style.fontSize='.7rem'; info2.textContent='Total: '+totalItems+' contrato(s)'; contratosPager.appendChild(info2);
  }
  contratosPageSizeSel && contratosPageSizeSel.addEventListener('change', function(){ contratosPage=0; renderContratos(); });

  async function fileToDataURL(file){
    if(!file) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = e => reject(e);
      reader.readAsDataURL(file);
    });
  }

  async function salvar(){
    if(!current.hab || !current.hab._id) return;
    const id = current.hab._id;

    // Validação: responsável financeiro quando alugado e existem moradores
    const alugado = !!elAlugado.checked;
    const respId = current.responsavelId ? String(current.responsavelId) : null;
    if(respId){
      const respMorador = (current.moradores||[]).find(m => String(m._id||'') === respId);
      if(respMorador && isMoradorMenorDeIdade(respMorador)){
        showToast('Morador menor de 18 anos não pode ser responsável financeiro.', 'warning');
        return;
      }
    }
    if(alugado && (current.moradores||[]).length>0){
      if(!respId){ showToast('Selecione um responsável financeiro.', 'warning'); return; }
    }

    // Atualizar flag inquilino de cada morador se alterado
    const updates = [];
    const changedMoradores = [];
    const propNome = (current.prop && current.prop.nome) ? String(current.prop.nome).trim().toLowerCase() : '';
    (current.moradores||[]).forEach(m => {
      const rowChk = modalEl.querySelector('input[type="checkbox"][data-id="'+String(m._id||'')+'"]');
      if(!rowChk) return;
      const isPropMor = !!propNome && (String(m.nome||'').trim().toLowerCase() === propNome);
      // Enforce regras: só permite inquilino se alugado e não for proprietário-morador
      const newVal = alugado && !isPropMor && !!rowChk.checked;
      if(Boolean(m.inquilino) !== newVal){
        updates.push((async () => {
          const res = await fetch(basePath + '/api/moradores/' + encodeURIComponent(String(m._id)), {
            method: 'PUT',
            credentials:'same-origin',
            headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
            body: JSON.stringify({ inquilino: newVal })
          });
          let data = null;
          try { data = await res.json(); } catch(_jsonErr) { data = null; }
          if(!res.ok || (data && data.ok === false)){
            const errMsg = (data && (data.error || data.message)) || 'Falha ao atualizar morador';
            throw new Error(errMsg);
          }
          m.inquilino = newVal;
          changedMoradores.push({ id: String(m._id||''), inquilino: newVal });
          return data;
        })());
      }
    });

    // Persistir contratos: enviar lista completa (último = vigente)
    const contratosPayload = Array.isArray(current.contratos) ? current.contratos.map(c=>{
      const { file, ...rest } = c || {};
      return normalizeContrato(rest);
    }) : [];
    // Atualizar habitação: alugado + contratos_locacao
    const habUpdate = (async () => {
      const response = await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(id)), {
        method: 'PUT', credentials:'same-origin', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ alugado: alugado, contratos_locacao: contratosPayload })
      });
      let data = null;
      try { data = await response.json(); } catch(_jsonErr) { data = null; }
      if(!response.ok || (data && data.error)){
        const errMsg = data && data.error ? data.error : 'Falha ao salvar habitação';
        const err = new Error(errMsg);
        if(data && data.detail) err.detail = data.detail;
        if(data && data.blob_missing_token) err.blobMissingToken = true;
        throw err;
      }
      return data;
    })();

    try{
      await Promise.all(updates.concat([habUpdate]));
      if(current.hab){
        current.hab.alugado = alugado;
        current.hab.moradores = current.moradores.map(m => ({ ...m }));
      }
      // Fechar e recarregar lista
      bsModal && bsModal.hide();
      try{ document.dispatchEvent(new CustomEvent('habitacao:lista:refresh')); }catch(_evtErr){}
      try{
        document.dispatchEvent(new CustomEvent('habitacao:moradores:atualizado', {
          detail: {
            habitacaoId: current.hab && current.hab._id ? String(current.hab._id) : null,
            alugado,
            moradores: (current.moradores||[]).map(m => ({ id: String(m._id||''), inquilino: !!m.inquilino })),
            changedMoradores
          }
        }));
      }catch(_evtErr){}
    }catch(err){
      try { console.error('[modal_edit_hab_aluguel] falha ao salvar habitação', err); } catch(_logErr) {}
      const msgs = [];
      const primary = toErrorText(err) || 'Falha ao salvar alterações.';
      msgs.push(primary);
      if(err && err.detail) msgs.push(toErrorText(err.detail));
      if(err && err.blobMissingToken) msgs.push('Verifique a configuração do armazenamento de arquivos (Blob).');
      showToast(msgs.filter(Boolean).join('\n'), err && err.blobMissingToken ? 'warning' : 'danger');
    }
  }

  // Listeners
  btnLimpar && btnLimpar.addEventListener('click', resetForm);
  btnSalvar && btnSalvar.addEventListener('click', salvar);
  elAlugado && elAlugado.addEventListener('change', function(){
    // Reaplica estado de habilitação e marcação dos checkboxes de inquilino
    renderMoradores();
  });

  // Inserir contrato na lista (sem persistir ainda)
  btnContratoInserir && btnContratoInserir.addEventListener('click', async function(){
    const inicio = (inpInicio.value||'').trim();
    const fim = (inpFim.value||'').trim();
    let respId = current.responsavelId ? String(current.responsavelId) : null;
    const possuiMoradores = (current.moradores||[]).length > 0;
    if(possuiMoradores){
      if(!respId){
        showToast('Selecione um responsável financeiro.', 'warning');
        return;
      }
      const mor = (current.moradores||[]).find(m => String(m._id||'') === respId);
      if(mor && isMoradorMenorDeIdade(mor)){
        showToast('Morador menor de 18 anos não pode ser responsável financeiro.', 'warning');
        return;
      }
    }
    const file = inpContrato.files && inpContrato.files[0] ? inpContrato.files[0] : null;
    // Validações de período
    const dIni = parseDateBRorISO(inicio);
    const dFim = parseDateBRorISO(fim);
    if(!dIni || !dFim){ showToast('Informe período inicial e final válidos (dd/mm/aaaa).', 'warning'); return; }
    if(dIni.getTime() > dFim.getTime()){ showToast('Período inválido: a data inicial não pode ser maior que a final.', 'warning'); return; }
    const isEditing = Number.isInteger(current.editingIndex) && current.editingIndex >= 0;
    const overlap = (Array.isArray(current.contratos)? current.contratos : []).some(function(c, idx){
      if(isEditing && idx === current.editingIndex) return false;
      const ci = parseDateBRorISO((c && c.periodo && c.periodo.inicio) || c?.vigencia_inicio);
      const cf = parseDateBRorISO((c && c.periodo && c.periodo.fim) || c?.vigencia_fim);
      if(!ci || !cf) return false;
      // Sobreposição inclusiva: [dIni, dFim] intersects [ci, cf]
      return !(dFim.getTime() < ci.getTime() || dIni.getTime() > cf.getTime());
    });
    if(overlap){ showToast('Já existe um contrato de locação para este período.', 'warning'); return; }
    const existente = (isEditing && Array.isArray(current.contratos)) ? current.contratos[current.editingIndex] : null;
    const baseContrato = existente ? { ...existente } : {};
    delete baseContrato.file;
    if(isEditing && current.editingRemoveFile && !file){
      delete baseContrato.url;
      delete baseContrato.mime;
    }
    if(file){
      if(file.size > MAX_CONTRATO_FILE_SIZE){
        showToast('Arquivo excede o limite de 2 MB.', 'warning');
        inpContrato.value = '';
        updateFilePreview();
        return;
      }
      delete baseContrato.url;
      delete baseContrato.mime;
    }
    const novo = {
      ...baseContrato,
      periodo: { inicio, fim },
      responsavel_morador_id: respId || null
    };
    if(file){
      try{
        novo.file = await fileToDataURL(file);
        novo.nome = file.name || baseContrato.nome || 'contrato';
      }
      catch(_e){ showToast('Falha ao ler arquivo de contrato.', 'danger'); return; }
    } else {
      if(!novo.nome) novo.nome = baseContrato.nome || 'contrato';
      if(isEditing && current.editingRemoveFile){
        novo.url = '';
        novo.mime = '';
      }
    }
    if(!Array.isArray(current.contratos)) current.contratos = [];
    let novaLista;
    if(isEditing && existente){
      novaLista = current.contratos.map((c, idx) => idx === current.editingIndex ? novo : c);
    } else {
      novaLista = current.contratos.concat([novo]);
    }
    // Persistir imediatamente para manter ao reabrir o modal
    try{
      const payload = { contratos_locacao: normalizeContratosList(novaLista) };
      const response = await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(current.hab._id)), {
        method:'PUT', credentials:'same-origin', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify(payload)
      });
      let resp = null;
      try { resp = await response.json(); } catch(_jsonErr) { resp = null; }
      if(!response.ok || (resp && resp.error)){
        try { console.error('[modal_edit_hab_aluguel] falha ao inserir contrato', { status: response.status, payload: resp }); } catch(_logErr) {}
        const msgs = [];
        const primary = toErrorText(resp && resp.error) || 'Falha ao inserir contrato';
        msgs.push(primary);
        if(resp && resp.detail) msgs.push(toErrorText(resp.detail));
        if(resp && resp.blob_missing_token){ msgs.push('Verifique a configuração do armazenamento de arquivos (Blob).'); }
        showToast(msgs.filter(Boolean).join('\n'), resp && resp.blob_missing_token ? 'warning' : 'danger');
        return;
      }
      const respList = Array.isArray(resp && resp.contratos_locacao) ? resp.contratos_locacao : novaLista;
      current.contratos = normalizeContratosList(respList);
      current.contrato = resp && resp.contrato_locacao ? normalizeContrato(resp.contrato_locacao) : (current.contratos.length? current.contratos[current.contratos.length-1] : null);
      current.editingIndex = null;
      current.editingRemoveFile = false;
      const forcedAfterInsert = getProprietarioResponsavelId();
      const nextResp = (current.contrato && current.contrato.responsavel_morador_id)
        ? current.contrato.responsavel_morador_id
        : forcedAfterInsert || null;
      applyResponsavelToCurrent(nextResp);
      renderContratos();
      // Limpa campos após inserir
      inpInicio.value = ''; inpFim.value=''; inpContrato.value='';
      updateFilePreview();
      renderMoradores();
      // Notificar outros componentes interessados
      try{ modalEl.dispatchEvent(new CustomEvent('aluguel:contrato:adicionado', { bubbles:true, detail: { habitacao: resp } })); }catch(_e){}
    }catch(err){
      try { console.error('[modal_edit_hab_aluguel] falha ao inserir contrato', err); } catch(_logErr) {}
      const msg = toErrorText(err) || 'Falha ao inserir contrato.';
      showToast(msg, 'danger');
    }
  });

  // Limpar campos do bloco de dados contratuais
  btnContratoLimpar && btnContratoLimpar.addEventListener('click', function(){
    inpInicio.value = ''; inpFim.value = ''; inpContrato.value = '';
    current.editingIndex = null;
    current.editingRemoveFile = false;
    updateFilePreview();
  });

  function handleContratoFileChange(){
    const file = inpContrato && inpContrato.files && inpContrato.files[0] ? inpContrato.files[0] : null;
    if(file && file.size > MAX_CONTRATO_FILE_SIZE){
      showToast('Arquivo excede o limite de 2 MB.', 'warning');
      inpContrato.value = '';
      current.editingRemoveFile = false;
      updateFilePreview();
      return;
    }
    updateFilePreview();
  }

  if(inpContrato){ inpContrato.addEventListener('change', handleContratoFileChange); }
  btnFileRemover && btnFileRemover.addEventListener('click', function(){
    const hasFile = !!(inpContrato && inpContrato.files && inpContrato.files.length);
    if(hasFile){
      inpContrato.value = '';
      updateFilePreview();
      return;
    }
    const editingContrato = getEditingContrato();
    if(editingContrato && (editingContrato.url || editingContrato.nome)){
      current.editingRemoveFile = !current.editingRemoveFile;
      updateFilePreview();
    }
  });

  function updateFilePreview(){
    if(!filePreviewWrap) return;
    const file = inpContrato && inpContrato.files && inpContrato.files[0] ? inpContrato.files[0] : null;
    const editingContrato = getEditingContrato();
    if(file){
      current.editingRemoveFile = false;
      filePreviewWrap.classList.remove('d-none');
      if(filePreviewLabel) filePreviewLabel.textContent = `Arquivo selecionado: ${file.name || 'arquivo'}`;
      if(filePreviewSize) filePreviewSize.textContent = formatBytes(file.size || 0);
      if(filePreviewLink){ filePreviewLink.classList.add('d-none'); filePreviewLink.removeAttribute('href'); }
      if(btnFileRemover){ btnFileRemover.textContent = 'Remover arquivo'; btnFileRemover.disabled = false; }
      return;
    }
    if(editingContrato && (editingContrato.url || editingContrato.nome)){
      filePreviewWrap.classList.remove('d-none');
      if(current.editingRemoveFile){
        if(filePreviewLabel) filePreviewLabel.textContent = 'Arquivo atual será removido ao salvar.';
        if(filePreviewLink){ filePreviewLink.classList.add('d-none'); filePreviewLink.removeAttribute('href'); }
        if(filePreviewSize) filePreviewSize.textContent = '';
        if(btnFileRemover){ btnFileRemover.textContent = 'Desfazer remoção'; btnFileRemover.disabled = false; }
      } else {
        const nome = editingContrato.nome || 'Arquivo atual';
        if(filePreviewLabel) filePreviewLabel.textContent = `Arquivo atual: ${nome}`;
        if(filePreviewLink){
          if(editingContrato.url){
            filePreviewLink.href = editingContrato.url;
            filePreviewLink.textContent = 'Abrir arquivo';
            filePreviewLink.classList.remove('d-none');
          } else {
            filePreviewLink.classList.add('d-none');
            filePreviewLink.removeAttribute('href');
          }
        }
        if(filePreviewSize) filePreviewSize.textContent = '';
        if(btnFileRemover){ btnFileRemover.textContent = 'Remover arquivo'; btnFileRemover.disabled = false; }
      }
      return;
    }
    filePreviewWrap.classList.add('d-none');
    if(filePreviewLabel) filePreviewLabel.textContent = '';
    if(filePreviewLink){ filePreviewLink.classList.add('d-none'); filePreviewLink.removeAttribute('href'); filePreviewLink.textContent = 'Abrir arquivo'; }
    if(filePreviewSize) filePreviewSize.textContent = '';
    if(btnFileRemover){ btnFileRemover.textContent = 'Remover arquivo'; btnFileRemover.disabled = true; }
  }

  function formatBytes(bytes){
    if(!bytes) return '';
    const units = ['B','KB','MB','GB'];
    let idx = 0; let val = bytes;
    while(val >= 1024 && idx < units.length-1){ val /= 1024; idx++; }
    return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  }

  function getEditingContrato(){
    if(!Number.isInteger(current.editingIndex) || current.editingIndex < 0) return null;
    if(!Array.isArray(current.contratos)) return null;
    return current.contratos[current.editingIndex] || null;
  }

  // Abrir modal quando o botão emitirAcao('aluguel', item) for disparado
  document.addEventListener('habitacao:acao', function(e){
    const det = e && e.detail || {}; if(det.tipo !== 'aluguel') return;
    const item = det.item || null; if(!item) return;
    populate(item);
    // Hidratar dados atualizados do servidor para garantir que períodos/links mais recentes apareçam
    (async function refreshFromServer(){
      try{
        const url = basePath + '/api/habitacoes/' + encodeURIComponent(String(item._id));
        const res = await fetch(url, { cache:'no-store' });
        if(!res.ok) return; const obj = await res.json();
        if(obj && obj._id){ populate(obj); }
      }catch(_e){}
    })();
    bsModal && bsModal.show();
  });
})();
