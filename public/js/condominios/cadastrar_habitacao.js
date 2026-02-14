(function(){
  var byId = function(id){ return document.getElementById(id); };
  var basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  // Carrega unidades injetadas pelo servidor
  var unidades = []; try{ unidades = JSON.parse((byId('unidadesOptionsData')||{textContent:'[]'}).textContent||'[]'); }catch(_){ unidades=[]; }
  function unidadeLabelByObj(u){ return u ? (u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome) : ''; }
  function unidadeLabel(id){ var u = unidades.find(function(x){ return String(x._id)===String(id); }); return unidadeLabelByObj(u) || id; }

  var unidadeTop = byId('unidadeTop');
  var unidadeTopLogo = byId('unidadeTopLogo');
  function getSelectedUnitId(){ return unidadeTop ? String(unidadeTop.value || '').trim() : ''; }

  function getUnitById(id){
    var uid = String(id || '').trim();
    if(!uid) return null;
    return (unidades || []).find(function(u){ return String(u && u._id) === uid; }) || null;
  }

  function pickUnitLogoUrl(u){
    if(!u) return '';
    var raw = u.logo || u.logo_url || u.logoUrl || u.logo_unidade || u.logoUnidade || u.headerLogo || u.header_logo || u.logoURL || u.logoUrlUnidade || u.logo_unidade_url || u.logo_url_unidade;
    raw = (raw == null) ? '' : String(raw).trim();
    return raw;
  }

  function buildLogoCandidates(rawUrl, basePathForModule){
    var bp = String(basePathForModule || '').trim();
    var u = String(rawUrl || '').trim();
    if(!u) return [];

    var candidates = [];
    var isAbs = /^https?:\/\//i.test(u) || u.indexOf('data:') === 0;
    if(isAbs){
      candidates.push(u);
      return candidates;
    }

    // Prioriza com prefixo do módulo quando a URL é root-relative.
    if(bp && u.charAt(0) === '/' && u.indexOf(bp + '/') !== 0){
      candidates.push(bp + u);
    }

    candidates.push(u);

    if(u.charAt(0) === '/'){
      try{ candidates.push(window.location.origin + u); }catch(_){ }
      if(bp && u.indexOf(bp + '/') !== 0){
        try{ candidates.push(window.location.origin + bp + u); }catch(_){ }
      }
    }

    // remove duplicados
    var out = [];
    for(var i=0;i<candidates.length;i++){
      var s = String(candidates[i] || '').trim();
      if(!s) continue;
      if(out.indexOf(s) >= 0) continue;
      out.push(s);
    }
    return out;
  }

  function getUnidadeLogoCandidates(unitId){
    var uid = String(unitId || '').trim();
    var base = String(basePath || '/condominios').trim() || '/condominios';
    if(!uid){
      return ['/images/unidade.png', base + '/images/unidade.png'];
    }

    var u = getUnitById(uid);
    var rawLogo = pickUnitLogoUrl(u);
    var fromList = rawLogo ? buildLogoCandidates(rawLogo, base) : [];

    var raw = [];
    for(var i=0;i<fromList.length;i++) raw.push(fromList[i]);

    // Mesmo padrão da Dirigência
    raw.push('/gestor/api/unidades/' + encodeURIComponent(uid) + '/logo');
    raw.push(base + '/api/unidades/' + encodeURIComponent(uid) + '/logo');
    raw.push('/api/unidades/' + encodeURIComponent(uid) + '/logo');

    // fallback final
    raw.push('/images/unidade.png');
    raw.push(base + '/images/unidade.png');

    // remove duplicados
    var out = [];
    for(var j=0;j<raw.length;j++){
      var s2 = String(raw[j] || '').trim();
      if(!s2) continue;
      if(out.indexOf(s2) >= 0) continue;
      out.push(s2);
    }
    return out;
  }

  function setImgWithFallback(img, urls){
    if(!img) return;
    var list = (urls || []).map(function(x){ return String(x || '').trim(); }).filter(Boolean);
    if(list.length === 0) return;
    var idx = 0;
    img.onerror = function(){
      idx++;
      if(idx >= list.length){ img.onerror = null; return; }
      img.src = list[idx];
    };
    img.src = list[0];
  }

  function refreshUnitLogo(){
    if(!unidadeTopLogo) return;
    var uid = getSelectedUnitId();
    setImgWithFallback(unidadeTopLogo, getUnidadeLogoCandidates(uid));
  }

  // Estado em memória vindo da API
  var blocos = []; // objetos: {_id, nome, unidade_id}
  var andares = []; // objetos: {_id, nome, unidade_id}
  var habs = [];   // objetos enriquecidos da busca

  // Helpers HTTP
  async function getJson(url){
    try{
      var res = await fetch(url, { cache: 'no-store' });
      if(res.status === 503){ showToast('Banco indisponível. Tente novamente em instantes.', 'warning'); return null; }
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(e){ console.warn('[cadastrar_habitacao] GET falhou', url, e); showToast('Falha ao carregar dados ('+ (e.message||'erro') +')','danger'); return null; }
  }
  async function sendJson(url, method, body){
    try{
      var res = await fetch(url, { method: method||'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body||{}) });
      if(res.status === 409){ showToast('Registro já existe. Usando existente.', 'info'); return await res.json(); }
      if(res.status === 503){ showToast('Banco indisponível. Tente mais tarde.', 'warning'); return null; }
      if(!res.ok){
        var ct = (res.headers && res.headers.get) ? (res.headers.get('content-type') || '') : '';
        var payload = null;
        try{
          if(ct && ct.indexOf('application/json') >= 0) payload = await res.json();
          else payload = await res.text();
        }catch(_e){ payload = null; }
        var msg = '';
        if(payload){
          if(typeof payload === 'string') msg = payload.trim();
          else if(payload.error) msg = String(payload.error);
          else if(payload.message) msg = String(payload.message);
          else if(payload.detail) msg = String(payload.detail);
          else { try{ msg = JSON.stringify(payload); }catch(_){ msg = ''; } }
        }
        var err = new Error('HTTP ' + res.status + (msg ? (': ' + msg) : ''));
        err.status = res.status;
        err.response = payload;
        throw err;
      }
      var data = await res.json();
      showToast(method==='PUT'? 'Alterado com sucesso.' : (method==='DELETE'? 'Excluído.' : 'Salvo com sucesso.'), 'success');
      return data;
    }catch(e){ console.warn('[cadastrar_habitacao] '+(method||'POST')+' falhou', url, e); showToast('Operação falhou ('+(e.message||'erro')+')','danger'); return null; }
  }

  function buildHabDeleteLabel(h){
    if(!h) return '—';
    var tipo = String(h.tipo || '').trim();
    var numero = String(h.numero || '').trim();
    var label = (tipo ? tipo : 'Habitação') + (numero ? (' ' + numero) : '');
    label = label.trim();
    return label || '—';
  }

  function askHabDeleteConfirm(hLabel){
    var modalEl = byId('habDeleteConfirmModal');
    var nameEl = byId('habDeleteConfirmName');
    var yesBtn = byId('habDeleteConfirmYes');

    // fallback (caso Bootstrap/modal não esteja disponível)
    if(!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)){
      var suffix = (hLabel && hLabel !== '—') ? (' (' + hLabel + ')') : '';
      return Promise.resolve(window.confirm('Tem certeza que deseja excluir essa habitação?' + suffix + '\n\nEsta exclusão é definitiva e não pode ser desfeita.'));
    }

    if(nameEl) nameEl.textContent = hLabel || '—';

    return new Promise(function(resolve){
      var resolved = false;
      var bs = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true, focus: true });

      var onHidden = function(){
        if(resolved) return;
        resolved = true;
        resolve(false);
      };

      var onYes = function(e){
        try{ e && e.preventDefault && e.preventDefault(); }catch(_){ }
        if(resolved) return;
        resolved = true;
        resolve(true);
        try{ bs.hide(); }catch(_2){ }
      };

      modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      yesBtn.addEventListener('click', onYes, { once: true });
      bs.show();
    });
  }

  // ----- Blocos -----
  var bNome = byId('bNome'); var bSalvar = byId('bSalvar'); var bLimpar = byId('bLimpar'); var bCancelar = byId('bCancelar'); var bLista = byId('bLista');
  var editBlocoId = null;

  function setBlocoEditing(isEditing){
    if(!bSalvar) return;
    bSalvar.textContent = isEditing ? 'Alterar' : 'Cadastrar';
    if(bCancelar){
      if(isEditing) bCancelar.classList.remove('d-none');
      else bCancelar.classList.add('d-none');
    }
  }

  function cancelBlocoEditing(){
    editBlocoId = null;
    setBlocoEditing(false);
    if(bNome) bNome.value = '';
  }
  async function carregarBlocos(uid){ var url = basePath + '/api/blocos' + (uid? ('?unidade='+encodeURIComponent(uid)) : ''); var data = await getJson(url); blocos = Array.isArray(data)? data : []; renderBlocos(); }
  function renderBlocos(){ if(!bLista) return; if(!Array.isArray(blocos)||blocos.length===0){ bLista.innerHTML = '<tr><td colspan="3" class="text-muted small">Nenhum bloco cadastrado.</td></tr>'; return; } bLista.innerHTML = (blocos||[]).map(function(b){ return '<tr>'+
    '<td>'+unidadeLabel(b.unidade_id)+'</td>'+
    '<td>'+escapeHtml(b.nome)+'</td>'+
    '<td>'+
      '<button class="wdg-icon-btn" data-b-edit="'+b._id+'" aria-label="Editar bloco"><img src="'+basePath+'/images/editar.png" alt="Editar"/></button> '+
      '<button class="wdg-icon-btn" data-b-del="'+b._id+'" aria-label="Excluir bloco"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button>'+
    '</td>'+
  '</tr>'; }).join(''); }
  bLista && bLista.addEventListener('click', async function(ev){ var t=ev.target.closest('button'); if(!t) return; if(t.hasAttribute('data-b-edit')){ var id=t.getAttribute('data-b-edit'); var b=(blocos||[]).find(function(x){return String(x._id)===String(id);}); if(!b) return; editBlocoId=id; setBlocoEditing(true); if(unidadeTop){ unidadeTop.value=b.unidade_id; } bNome.value=b.nome; await onUnidadeChange(); if(bNome) bNome.focus(); }
    if(t.hasAttribute('data-b-del')){ var id2=t.getAttribute('data-b-del'); if(!id2) return; if(!confirm('Excluir este bloco?')) return; await fetch(basePath + '/api/blocos/' + encodeURIComponent(id2), { method:'DELETE' }); await onUnidadeChange(); }
  });
  bSalvar && bSalvar.addEventListener('click', async function(){ var uid=getSelectedUnitId(); var nome=(bNome.value||'').trim(); if(!uid){ alert('Selecione o condomínio.'); return; } if(!nome){ alert('Informe o nome do bloco/torre.'); return; }
    if(editBlocoId){
      var ok = await sendJson(basePath + '/api/blocos/' + encodeURIComponent(editBlocoId), 'PUT', { nome:nome });
      if(!ok) return;
      editBlocoId=null;
      setBlocoEditing(false);
    } else {
      var created = await sendJson(basePath + '/api/blocos', 'POST', { unidade_id: uid, nome:nome });
      if(!created) return;
    }
    bNome.value='';
    await onUnidadeChange();
  });
  bLimpar && bLimpar.addEventListener('click', function(){ if(bNome) bNome.value=''; });
  bCancelar && bCancelar.addEventListener('click', function(){ cancelBlocoEditing(); });

  // ----- Andares -----
  var aNome = byId('aNome'); var aSalvar = byId('aSalvar'); var aLimpar = byId('aLimpar'); var aCancelar = byId('aCancelar'); var aLista = byId('aLista');
  var editAndarId = null;

  function setAndarEditing(isEditing){
    if(!aSalvar) return;
    aSalvar.textContent = isEditing ? 'Alterar' : 'Cadastrar';
    if(aCancelar){
      if(isEditing) aCancelar.classList.remove('d-none');
      else aCancelar.classList.add('d-none');
    }
  }

  function cancelAndarEditing(){
    editAndarId = null;
    setAndarEditing(false);
    if(aNome) aNome.value = '';
  }
  async function carregarAndares(uid){ var url = basePath + '/api/andares' + (uid? ('?unidade='+encodeURIComponent(uid)) : ''); var data = await getJson(url); andares = Array.isArray(data)? data : []; renderAndares(); }
  function renderAndares(){ if(!aLista) return; if(!Array.isArray(andares)||andares.length===0){ aLista.innerHTML = '<tr><td colspan="3" class="text-muted small">Nenhum andar cadastrado.</td></tr>'; return; } aLista.innerHTML = (andares||[]).map(function(a){ return '<tr>'+
    '<td>'+unidadeLabel(a.unidade_id)+'</td>'+
    '<td>'+escapeHtml(a.nome)+'</td>'+
    '<td>'+
      '<button class="wdg-icon-btn" data-a-edit="'+a._id+'" aria-label="Editar andar"><img src="'+basePath+'/images/editar.png" alt="Editar"/></button> '+
      '<button class="wdg-icon-btn" data-a-del="'+a._id+'" aria-label="Excluir andar"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button>'+
    '</td>'+
  '</tr>'; }).join(''); }
  aLista && aLista.addEventListener('click', async function(ev){ var t=ev.target.closest('button'); if(!t) return; if(t.hasAttribute('data-a-edit')){ var id=t.getAttribute('data-a-edit'); var a=(andares||[]).find(function(x){return String(x._id)===String(id);}); if(!a) return; editAndarId=id; setAndarEditing(true); if(unidadeTop){ unidadeTop.value=a.unidade_id; } aNome.value=a.nome; await onUnidadeChange(); if(aNome) aNome.focus(); }
    if(t.hasAttribute('data-a-del')){ var id2=t.getAttribute('data-a-del'); if(!id2) return; if(!confirm('Excluir este andar?')) return; await fetch(basePath + '/api/andares/' + encodeURIComponent(id2), { method:'DELETE' }); await onUnidadeChange(); }
  });
  aSalvar && aSalvar.addEventListener('click', async function(){ var uid=getSelectedUnitId(); var nome=(aNome.value||'').trim(); if(!uid){ alert('Selecione o condomínio.'); return; } if(!nome){ alert('Informe o nome do andar.'); return; }
    if(editAndarId){
      var ok = await sendJson(basePath + '/api/andares/' + encodeURIComponent(editAndarId), 'PUT', { nome:nome });
      if(!ok) return;
      editAndarId=null;
      setAndarEditing(false);
    } else {
      var created = await sendJson(basePath + '/api/andares', 'POST', { unidade_id: uid, nome:nome });
      if(!created) return;
    }
    aNome.value='';
    await onUnidadeChange();
  });
  aLimpar && aLimpar.addEventListener('click', function(){ if(aNome) aNome.value=''; });
  aCancelar && aCancelar.addEventListener('click', function(){ cancelAndarEditing(); });

  // Estado inicial: modo cadastro
  setBlocoEditing(false);
  setAndarEditing(false);

  // ---- Form principal Habitação ----
  var hTipo = byId('hTipo'); var hBloco = byId('hBloco'); var hAndar = byId('hAndar');
  var hNumero = byId('hNumero'); var hArea = byId('hArea'); var hFracao = byId('hFracao'); var hVencimento = byId('hVencimento'); var hFoto = byId('hFoto'); var hFotoPrev = byId('hFotoPrev'); var hDesc = byId('hDesc'); var hDescCount = byId('hDescCount');
  var hSalvar = byId('hSalvar'); var hLimpar = byId('hLimpar'); var hCancelar = byId('hCancelar'); var hLista = byId('hLista');
  var editHabId = null;
  // Estado de ordenação
  var habSort = { key: 'unidade', dir: 'asc' }; // padrão

  async function syncSelects(){ // Preenche selects bloco/andar conforme unidade selecionada
    var uid = getSelectedUnitId();
    if(!uid){ hBloco.innerHTML='<option value="">Selecione...</option>'; hAndar.innerHTML='<option value="">Selecione...</option>'; return; }
    hBloco.innerHTML = '<option value="">Selecione...</option>' + (blocos||[]).map(function(b){ return '<option value="'+b._id+'">'+escapeHtml(b.nome)+'</option>'; }).join('');
    hAndar.innerHTML = '<option value="">Selecione...</option>' + (andares||[]).map(function(a){ return '<option value="'+a._id+'">'+escapeHtml(a.nome)+'</option>'; }).join('');
  }

  async function onUnidadeChange(){
    var uid = getSelectedUnitId();
    await Promise.all([
      carregarBlocos(uid||null),
      carregarAndares(uid||null),
      listarHabitacoes()
    ]);
    await syncSelects();
  }

  unidadeTop && unidadeTop.addEventListener('change', function(){ refreshUnitLogo(); onUnidadeChange(); });

  // Máscara: Fração ideal (%) melhor usabilidade: usuário digita apenas número e vírgula; sufixo " %" e duas casas decimais só no blur.
  function clampPercentNum(n){ if(isNaN(n)) return 0; if(n<0) n=0; if(n>100) n=100; return n; }
  function parsePercentRaw(s){ s=String(s||'').replace('%','').trim(); if(s==='') return null; s = s.replace(/\s+/g,'').replace(/\./g,'').replace(',', '.'); var n = parseFloat(s); if(isNaN(n)) return null; return clampPercentNum(n); }
  function formatPercentFinal(n){ if(n==null||isNaN(n)) n=0; n = clampPercentNum(n); return n.toFixed(2).replace('.',',') + ' %'; }
  function sanitizeTyping(s){ s = String(s||''); s = s.replace(/[^0-9,]/g,''); var parts = s.split(','); if(parts.length>2){ parts = [parts[0], parts.slice(1).join('')]; }
    if(parts.length===1){ return parts[0]; }
    parts[1] = parts[1].slice(0,2); return parts[0] + ',' + parts[1]; }
  if(hFracao){
    if(!hFracao.value){ hFracao.value = '0,00 %'; }
    // Remover formatação ao focar
    hFracao.addEventListener('focus', function(){ var val = hFracao.value.replace(/%/,'').trim(); val = val.replace(/\s+/g,'').replace(/\./g,'').replace(',','.'); var n = parseFloat(val); if(!isNaN(n)){ hFracao.value = n.toString().replace('.',','); } else { hFracao.value=''; }
    });
    hFracao.addEventListener('input', function(){ var raw = hFracao.value; raw = sanitizeTyping(raw); hFracao.value = raw; });
    hFracao.addEventListener('blur', function(){ var num = parsePercentRaw(hFracao.value); hFracao.value = formatPercentFinal(num); });
  }

  // Defaults do formulário
  if(hArea && !String(hArea.value||'').trim()) hArea.value = '0';

  // Paginação Habitações
  var HAB_PAGE_SIZE = 50; var habPage = 0; var hPaginas = byId('hPaginas'); var hPageSizeSel = byId('hPageSize');
  function buildHabRow(h){ return '<tr>'+
    '<td>'+unidadeLabelByObj(h.unidade)+'</td>'+
    '<td>'+escapeHtml(h.tipo||'')+'</td>'+
    '<td>'+(h.bloco? escapeHtml(h.bloco.nome||'') : '')+'</td>'+
    '<td>'+(h.andar? escapeHtml(h.andar.nome||'') : '')+'</td>'+
    '<td>'+escapeHtml(h.numero||'')+'</td>'+
    '<td>'+
      '<button class="wdg-icon-btn" data-h-det="'+h._id+'" aria-label="Detalhes"><img src="'+basePath+'/images/detalhe.png" alt="Detalhes"/></button> '+
      '<button class="wdg-icon-btn" data-h-edit="'+h._id+'" aria-label="Editar"><img src="'+basePath+'/images/editar.png" alt="Editar"/></button> '+
      '<button class="wdg-icon-btn" data-h-del="'+h._id+'" aria-label="Excluir"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button>'+
    '</td>'+
  '</tr>'; }
  function compareHab(a,b){
    function cmp(x,y){ if(x==null&&y==null) return 0; if(x==null) return -1; if(y==null) return 1; x=(typeof x==='string')?x.toLowerCase():x; y=(typeof y==='string')?y.toLowerCase():y; if(x<y) return -1; if(x>y) return 1; return 0; }
    switch(habSort.key){
      case 'tipo': return cmp(a.tipo,b.tipo);
      case 'bloco': return cmp(a.bloco? a.bloco.nome : '', b.bloco? b.bloco.nome : '');
      case 'andar': return cmp(a.andar? a.andar.nome : '', b.andar? b.andar.nome : '');
      case 'numero': return cmp(String(a.numero), String(b.numero));
      case 'unidade': default: return cmp(unidadeLabelByObj(a.unidade), unidadeLabelByObj(b.unidade));
    }
  }
  function renderHabPage(page){ if(!hLista) return; var pageSize = HAB_PAGE_SIZE; if(hPageSizeSel){ var v=parseInt(hPageSizeSel.value,10); if(!isNaN(v)&&v>0) pageSize=v; }
    if(!Array.isArray(habs) || habs.length===0){ hLista.innerHTML = '<tr><td colspan="6" class="text-muted small">Nenhuma habitação cadastrada.</td></tr>'; if(hPaginas) hPaginas.innerHTML=''; return; }
    var sorted = (habs||[]).slice().sort(function(a,b){ var r=compareHab(a,b); return habSort.dir==='asc'? r : -r; }); var totalPages = Math.ceil(sorted.length / pageSize) || 1; if(page<0) page=0; if(page>=totalPages) page=totalPages-1; habPage=page; var start = page*pageSize; var slice = sorted.slice(start, start+pageSize); hLista.innerHTML = slice.map(function(h){ return buildHabRow(h); }).join(''); buildHabPagination(totalPages, pageSize, sorted.length); }
  function buildHabPagination(totalPages, pageSize, totalItems){ if(!hPaginas) return; hPaginas.innerHTML='';
    function mk(label, page, disabled){ var b=document.createElement('button'); b.type='button'; b.textContent=label; if(!disabled && page!=null) b.dataset.page=page; if(disabled) b.disabled=true; return b; }
    if(totalPages<=1){
      var firstOnly = mk('<<', 0, true);
      var prevOnly = mk('<', 0, true);
      var oneOnly = mk('1', 0, true); oneOnly.classList.add('active');
      var nextOnly = mk('>', 0, true);
      var lastOnly = mk('>>', 0, true);
      hPaginas.appendChild(firstOnly); hPaginas.appendChild(prevOnly); hPaginas.appendChild(oneOnly); hPaginas.appendChild(nextOnly); hPaginas.appendChild(lastOnly);
      var infoOnly=document.createElement('div'); infoOnly.className='w-100 text-center mt-1'; infoOnly.style.fontSize='.7rem'; infoOnly.textContent='Total: '+totalItems+' habitação(ões)'; hPaginas.appendChild(infoOnly);
      return;
    }
    // Botões de navegação principais
    var firstBtn = mk('<<', 0, habPage===0);
    var prevBtn = mk('<', habPage-1, habPage===0);
    hPaginas.appendChild(firstBtn); hPaginas.appendChild(prevBtn);
    // Janela de páginas (mostrar até 6 páginas)
    var windowSize = 6; var start = Math.max(0, habPage - Math.floor(windowSize/2)); var end = start + windowSize -1; if(end >= totalPages) { end = totalPages -1; start = Math.max(0, end - windowSize +1); }
    // Se início >0 mostra primeira e reticências
    if(start>0){ var b0 = mk('1',0,false); if(0===habPage) b0.classList.add('active'); hPaginas.appendChild(b0); var dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; hPaginas.appendChild(dots); }
    for(var p=start; p<=end; p++){ var b = mk(String(p+1), p, false); if(p===habPage) b.classList.add('active'); hPaginas.appendChild(b); }
    // Se fim < última mostra reticências + última
    if(end < totalPages-1){ var dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; hPaginas.appendChild(dots2); var blast = mk(String(totalPages), totalPages-1, false); if((totalPages-1)===habPage) blast.classList.add('active'); hPaginas.appendChild(blast); }
    var nextBtn = mk('>', habPage+1, habPage===totalPages-1);
    var lastBtn = mk('>>', totalPages-1, habPage===totalPages-1);
    hPaginas.appendChild(nextBtn); hPaginas.appendChild(lastBtn);
    var info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' habitação(ões)'; hPaginas.appendChild(info);
  }
  hPaginas && hPaginas.addEventListener('click', function(ev){ var b=ev.target.closest('button[data-page]'); if(!b) return; var pg=parseInt(b.dataset.page,10); if(isNaN(pg)) return; renderHabPage(pg); });
  hPageSizeSel && hPageSizeSel.addEventListener('change', function(){ habPage=0; renderHabPage(habPage); });
  function renderHab(){ renderHabPage(habPage); }
  function labelById(arr,id){ var x = arr.find(function(o){ return String(o._id)===String(id); }); return x? x.nome : ''; }
  renderHabPage(habPage);

  hDesc && hDesc.addEventListener('input', function(){ if(hDescCount) hDescCount.textContent = String(hDesc.value.length); });
  hFoto && hFoto.addEventListener('change', function(){ if(hFoto.files && hFoto.files[0]){ var url=URL.createObjectURL(hFoto.files[0]); hFotoPrev.src=url; hFotoPrev.classList.remove('d-none'); } else { hFotoPrev.src=''; hFotoPrev.classList.add('d-none'); } });
  var hFotoLimpar = document.getElementById('hFotoLimpar');
  var hFotoRemover = document.getElementById('hFotoRemover');

  function setHabEditing(isEditing){
    if(hSalvar) hSalvar.textContent = isEditing ? 'Alterar' : 'Cadastrar';
    if(hCancelar){
      if(isEditing) hCancelar.classList.remove('d-none');
      else hCancelar.classList.add('d-none');
    }
  }

  function cancelHabEditing(){
    editHabId = null;
    setHabEditing(false);
    clearHabForm();
    try{ window.scrollTo({ top:0, behavior:'smooth'}); }catch(_){ }
  }
  hFotoLimpar && hFotoLimpar.addEventListener('click', function(){ if(hFoto){ hFoto.value=''; } if(hFotoPrev){ hFotoPrev.src=''; hFotoPrev.classList.add('d-none'); } });
  hFotoRemover && hFotoRemover.addEventListener('click', async function(){
    if(!editHabId){ showToast('Remover foto está disponível apenas ao editar.', 'warning'); return; }
    if(!confirm('Remover a foto atual desta habitação?')) return;
    var ok = await sendJson(basePath + '/api/habitacoes/' + encodeURIComponent(editHabId), 'PUT', { foto: '' });
    if(ok){
      try{
        var idx = (habs||[]).findIndex(function(x){ return String(x._id)===String(editHabId); });
        if(idx>=0){ habs[idx].foto = ''; }
      }catch(_){ }
      if(hFoto){ hFoto.value=''; }
      if(hFotoPrev){ hFotoPrev.src=''; hFotoPrev.classList.add('d-none'); }
      if(hFotoRemover){ hFotoRemover.classList.add('d-none'); }
      await listarHabitacoes();
    }
  });
  // Clique na miniatura abre modal de zoom
  hFotoPrev && hFotoPrev.addEventListener('click', function(){ var modalEl = document.getElementById('modalFotoHab'); if(!modalEl || !hFotoPrev.src) return; var img = document.getElementById('fotoHabZoom'); if(img) { img.style.transform='scale(1)'; img.src = hFotoPrev.src; } try{ var m = bootstrap.Modal.getOrCreateInstance(modalEl); m.show(); }catch(_){ } });

  async function readFileAsDataURL(file){ return new Promise(function(resolve,reject){ var fr=new FileReader(); fr.onload=function(){ resolve(String(fr.result||'')); }; fr.onerror=function(e){ reject(e); }; fr.readAsDataURL(file); }); }
  hSalvar && hSalvar.addEventListener('click', async function(){ var uid=getSelectedUnitId(); var tipo=hTipo.value; var blocoId=hBloco.value; var andarId=hAndar.value; var numero=(hNumero.value||'').trim(); if(!uid||!tipo||!numero){ alert('Preencha condomínio, tipo e número.'); return; }
    var area = hArea.value!=='' ? parseFloat(hArea.value) : null; if(isNaN(area)) area = null;
    var fracao = hFracao.value ? parseFloat(String(hFracao.value).replace('%','').replace(',','.').replace(/\s+/g,'')) : 0; if(isNaN(fracao)) fracao = 0;
    var desc = hDesc.value||'';
    var vencimentoDia = hVencimento && hVencimento.value ? parseInt(hVencimento.value, 10) : null;
    if(fracao!=null && !isNaN(fracao)){
      if(fracao < 0 || fracao > 100){ alert('Fração ideal deve estar entre 0 e 100%.'); return; }
    }
    if(vencimentoDia!=null){
      if(isNaN(vencimentoDia) || vencimentoDia < 1 || vencimentoDia > 31){ alert('Informe um dia de vencimento entre 1 e 31.'); return; }
    }
    var payload = { unidade_id: uid, tipo: tipo, numero: numero, bloco_id: blocoId||null, andar_id: andarId||null, area_m2: area, fracao_ideal: fracao, descricao: desc, vencimento_contribuicao_dia: vencimentoDia };
    var enviouFoto = false;
    if(hFoto && hFoto.files && hFoto.files[0]){
      try{ payload.foto = await readFileAsDataURL(hFoto.files[0]); enviouFoto = true; }
      catch(_e){ showToast('Falha ao ler imagem selecionada.','danger'); return; }
    }
  var resp;
  if(editHabId){
    resp = await sendJson(basePath + '/api/habitacoes/' + encodeURIComponent(editHabId), 'PUT', payload);
    if(!resp) return;
    editHabId=null;
    setHabEditing(false);
  }
  else {
    resp = await sendJson(basePath + '/api/habitacoes', 'POST', payload);
    if(!resp) return;
  }
  if(resp && resp.blob_missing_token){ showToast('Upload de imagem indisponível: configure BLOB_READ_WRITE_TOKEN.', 'warning'); }
  if(resp && tipo && (!resp.tipo || resp.tipo==='')){ showToast('Aviso: campo "tipo" não retornou na resposta. Verifique backend.', 'warning'); }
    // Aviso se tentou enviar foto mas backend não salvou (falha upload Blob)
    if(resp && enviouFoto && (!resp.foto || !resp.foto_saved)){
      showToast('A imagem não foi salva (upload indisponível).','warning');
    }
    var keep = { tipo: hTipo.value, bloco: hBloco.value, andar: hAndar.value };
    await listarHabitacoes();
  hNumero.value=''; hArea.value='0'; hFracao.value='0,00 %'; if(hVencimento){ hVencimento.value=''; } hDesc.value=''; if(hDescCount) hDescCount.textContent='0'; if(hFoto){ hFoto.value=''; } if(hFotoPrev){ hFotoPrev.src=''; hFotoPrev.classList.add('d-none'); } if(hFotoRemover){ hFotoRemover.classList.add('d-none'); }
    await syncSelects(); hTipo.value = keep.tipo; hBloco.value = keep.bloco; hAndar.value = keep.andar;
    try{ hNumero.focus(); }catch(_){ }
  });
  hLimpar && hLimpar.addEventListener('click', function(){ clearHabForm(); });
  hCancelar && hCancelar.addEventListener('click', function(){ cancelHabEditing(); });
  function clearHabForm(){
    hTipo.value='';
    // Limpa e reconstroi as listas de Bloco/Andar para a unidade atualmente selecionada
    hBloco.innerHTML='<option value="">Selecione...</option>';
    hAndar.innerHTML='<option value="">Selecione...</option>';
  hNumero.value=''; hArea.value='0'; hFracao.value='0,00 %'; if(hVencimento){ hVencimento.value=''; } hDesc.value='';
    if(hDescCount) hDescCount.textContent='0';
    if(hFoto){ hFoto.value=''; }
    if(hFotoPrev){ hFotoPrev.src=''; hFotoPrev.classList.add('d-none'); }
    if(hFotoRemover){ hFotoRemover.classList.add('d-none'); }
    // Repopular opções (permite cadastrar várias habitações em sequência sem precisar trocar a unidade)
    syncSelects();
  }

  hLista && hLista.addEventListener('click', async function(ev){ var t=ev.target.closest('button'); if(!t) return; 
    if(t.hasAttribute('data-h-del')){
      var id=t.getAttribute('data-h-del');
      if(!id) return;
      var hDel = (habs||[]).find(function(x){ return String(x._id)===String(id); }) || null;
      var labelDel = buildHabDeleteLabel(hDel);
      var okDel = await askHabDeleteConfirm(labelDel);
      if(!okDel) return;
      var delResp = await sendJson(basePath + '/api/habitacoes/' + encodeURIComponent(id), 'DELETE');
      if(!delResp) return;
      await listarHabitacoes();
      return;
    }
  if(t.hasAttribute('data-h-edit')){ var id2=t.getAttribute('data-h-edit'); var h=(habs||[]).find(function(x){return String(x._id)===String(id2);}); if(!h) return; editHabId=id2; setHabEditing(true); if(unidadeTop){ unidadeTop.value = h.unidade && h.unidade._id ? h.unidade._id : (h.unidade_id||''); } await onUnidadeChange(); hTipo.value=h.tipo||''; hBloco.value=h.bloco? h.bloco._id || '' : ''; hAndar.value=h.andar? h.andar._id || '' : ''; hNumero.value=h.numero||''; hArea.value = h.area_m2!=null? h.area_m2 : '0'; hFracao.value = h.fracao_ideal!=null? formatPercentFinal(h.fracao_ideal) : '0,00 %'; if(hVencimento){ hVencimento.value = h.vencimento_contribuicao_dia!=null ? String(h.vencimento_contribuicao_dia) : ''; } hDesc.value=h.descricao||''; if(hDescCount) hDescCount.textContent=String(hDesc.value.length); if(h.foto){ hFotoPrev.src = h.foto; hFotoPrev.classList.remove('d-none'); if(hFotoRemover){ hFotoRemover.classList.remove('d-none'); } } else { hFotoPrev.src=''; hFotoPrev.classList.add('d-none'); if(hFotoRemover){ hFotoRemover.classList.add('d-none'); } showToast('Esta habitação não possui foto salva.', 'info'); } window.scrollTo({ top:0, behavior:'smooth'}); try{ hNumero.focus(); }catch(_){ } }
    if(t.hasAttribute('data-h-det')){ var id3=t.getAttribute('data-h-det'); var h2=(habs||[]).find(function(x){return String(x._id)===String(id3);}); if(!h2) return; abrirDetalhesHabDetalhe(h2); }
  });

  // Estado inicial: modo cadastro
  setHabEditing(false);

  // ----- Modal detalhes -----
  function abrirDetalhesHabDetalhe(h){ var el = document.getElementById('modalDetHabCad'); if(!el) return; document.getElementById('detUnidade').textContent = unidadeLabelByObj(h.unidade); document.getElementById('detTipo').textContent = h.tipo||''; document.getElementById('detBloco').textContent = h.bloco? h.bloco.nome||'' : ''; document.getElementById('detAndar').textContent = h.andar? h.andar.nome||'' : ''; document.getElementById('detNumero').textContent = h.numero||''; document.getElementById('detArea').textContent = h.area_m2!=null? (h.area_m2+' m²'):'-'; document.getElementById('detFracao').textContent = h.fracao_ideal!=null? (h.fracao_ideal+'%'):'-'; document.getElementById('detVencimento').textContent = h.vencimento_contribuicao_dia!=null ? ('Dia '+String(h.vencimento_contribuicao_dia).padStart(2,'0')) : '-'; document.getElementById('detDesc').textContent = h.descricao||''; var detFoto = document.getElementById('detFoto'); var detFotoVazio = document.getElementById('detFotoVazio'); if(h.foto){ detFoto.src = h.foto; detFoto.classList.remove('d-none'); detFotoVazio.classList.add('d-none'); } else { detFoto.src=''; detFoto.classList.add('d-none'); detFotoVazio.classList.remove('d-none'); } try{ var m = bootstrap.Modal.getOrCreateInstance(el); m.show(); }catch(_){ }
  }

  // Inicialização do seletor de condomínio (fallback, caso o HTML não venha com options)
  function fillUnidadesSelect(sel){
    if(!sel) return;
    if(sel.options && sel.options.length>0) return;
    sel.innerHTML = '<option value="">Selecione...</option>' + unidades.map(function(u){ return '<option value="'+u._id+'">'+(u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome)+'</option>'; }).join('');
  }
  fillUnidadesSelect(unidadeTop);
  if(unidadeTop && unidades.length===1 && !unidadeTop.value){ unidadeTop.value = unidades[0]._id; }

  refreshUnitLogo();

  // Carrega listas iniciais
  (async function(){
    try{
      await onUnidadeChange();
    }catch(_){ /* noop */ }
  })();

  async function listarHabitacoes(){ var uid = getSelectedUnitId(); var url = basePath + '/api/habitacoes/busca' + (uid? ('?unidade='+encodeURIComponent(uid)) : ''); var data = await getJson(url); habs = Array.isArray(data)? data : []; renderHabPage(0); }

  // Toast utilitário
  function ensureToastContainer(){ var c=document.getElementById('toastContainer'); if(!c){ c=document.createElement('div'); c.id='toastContainer'; c.style.position='fixed'; c.style.top='1rem'; c.style.right='1rem'; c.style.zIndex='1060'; document.body.appendChild(c); } return c; }
  function showToast(msg, type){ var c=ensureToastContainer(); var el=document.createElement('div'); el.className='toast align-items-center text-bg-'+(type||'secondary')+' border-0 show'; el.setAttribute('role','alert'); el.setAttribute('aria-live','assertive'); el.setAttribute('aria-atomic','true'); el.style.minWidth='220px'; el.innerHTML='<div class="d-flex"><div class="toast-body">'+escapeHtml(msg)+'</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-dismiss="toast" aria-label="Fechar"></button></div>'; c.appendChild(el); setTimeout(function(){ try{ el.remove(); }catch(_){} }, 4500); el.querySelector('.btn-close').addEventListener('click', function(){ try{ el.remove(); }catch(_){} }); }

  // Ordenação por cabeçalho
  var habTable = document.getElementById('habTable');
  if(habTable){
    var ths = habTable.querySelectorAll('thead th[data-sort]');
    ths.forEach(function(th){ th.addEventListener('click', function(){ var key = th.getAttribute('data-sort'); if(habSort.key===key){ habSort.dir = habSort.dir==='asc' ? 'desc' : 'asc'; } else { habSort.key=key; habSort.dir='asc'; }
      ths.forEach(function(x){ x.classList.remove('asc','desc'); }); th.classList.add(habSort.dir);
      renderHabPage(0);
    }); });
    // Estado visual inicial
    var initTh = habTable.querySelector('thead th[data-sort="'+habSort.key+'"]'); if(initTh){ initTh.classList.add(habSort.dir); }
  }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]); }); }

})();
