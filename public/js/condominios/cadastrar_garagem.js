(function(){
  var byId = function(id){ return document.getElementById(id); };
  var basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  // Unidades vindas do server
  var unidades = []; try{ unidades = JSON.parse((byId('unidadesOptionsData')||{textContent:'[]'}).textContent||'[]'); }catch(_){ unidades=[]; }
  function unidadeLabelByObj(u){ return u ? (u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome) : ''; }
  function unidadeLabel(id){ var u = unidades.find(function(x){ return String(x._id)===String(id); }); return u ? (u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome) : id; }

  // Habitações dinâmicas (carregadas via API por unidade) e Áreas Comuns (permanece localStorage por ora)
  var habs = []; // habitações da unidade selecionada
  var habCache = Object.create(null); // unidadeId -> array de habs
  var areas = []; try{ areas = JSON.parse(localStorage.getItem('wdgAreasComuns')||'[]'); }catch(_){ areas=[]; }
  function habLabel(h){
    if(!h) return '';
    // Nome do bloco
    var blocoNome = '';
    if(h.bloco && h.bloco.nome){ blocoNome = h.bloco.nome; }
    else if(h.bloco_nome){ blocoNome = h.bloco_nome; }
    else if(h.blocoId){ blocoNome = labelById(blocosCache, h.blocoId); }
    // Nome do andar
    var andarNome = '';
    if(h.andar && h.andar.nome){ andarNome = h.andar.nome; }
    else if(h.andar_nome){ andarNome = h.andar_nome; }
    else if(h.andarId){ andarNome = labelById(andaresCache, h.andarId); }
    // Identificação (tipo + número)
    var tipo = h.tipo || '';
    var numero = h.numero || '';
    var identificacao = '';
    if(tipo && numero){ identificacao = tipo + ' ' + numero; }
    else { identificacao = tipo || numero; }
    return [blocoNome, andarNome, identificacao].filter(Boolean).join(' - ');
  }
  // Para rótulos de bloco/andar precisamos carregar caches se existirem (não estritamente necessário, fallback vazio)
  var blocosCache = []; var andaresCache = []; try{ blocosCache = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]'); }catch(_){ blocosCache=[]; } try{ andaresCache = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]'); }catch(_){ andaresCache=[]; }
  function labelById(arr,id){ var x = arr.find(function(o){ return o.id===id; }); return x? x.nome : ''; }

  // Vagas (carregadas da API; iniciamos vazio)
  var garagens = [];

  // Elementos
  var gUnidade = byId('gUnidade');
  var gUnidadeLogo = byId('gUnidadeLogo');
  var gNome = byId('gNome'); var gVinc = byId('gVinc');
  var gVincPickerRoot = document.querySelector('[data-g-vinc-picker]');
  var gVincPickerBox = gVincPickerRoot ? gVincPickerRoot.querySelector('[data-g-vinc-picker-box]') : null;
  var gVincPickerInput = gVincPickerRoot ? gVincPickerRoot.querySelector('[data-g-vinc-picker-input]') : null;
  var gVincPickerTokens = gVincPickerRoot ? gVincPickerRoot.querySelector('[data-g-vinc-picker-tokens]') : null;
  var gVincPickerMenu = gVincPickerRoot ? gVincPickerRoot.querySelector('[data-g-vinc-picker-menu]') : null;
  var gVincPickerPlaceholder = gVincPickerRoot ? gVincPickerRoot.querySelector('[data-g-vinc-picker-placeholder]') : null;
  var gFoto = byId('gFoto'); var gFotoPrev = byId('gFotoPrev'); var gFotoLimpar = byId('gFotoLimpar'); var gFotoRemover = byId('gFotoRemover');
  var gObs = byId('gObs'); var gObsCount = byId('gObsCount');
  var gSalvar = byId('gSalvar'); var gLimpar = byId('gLimpar'); var gCancelar = byId('gCancelarEdicao'); var gLista = byId('gLista');
  // Tabela e paginação
  var garTable = byId('garTable'); var gPaginas = byId('gPaginas'); var gPageSizeSel = byId('gPageSize');
  var GAR_PAGE_SIZE = 50; var garPage = 0; var garSort = { key: 'unidade', dir: 'asc' };
  var editIndex = -1;

  function setEditMode(on){ if(!gCancelar || !gSalvar) return; if(on){ gCancelar.classList.remove('d-none'); gSalvar.textContent='Alterar'; } else { gCancelar.classList.add('d-none'); gSalvar.textContent='Cadastrar'; } }

  function getSelectedUnitId(){ return gUnidade ? String(gUnidade.value || '').trim() : ''; }

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

    raw.push('/gestor/api/unidades/' + encodeURIComponent(uid) + '/logo');
    raw.push(base + '/api/unidades/' + encodeURIComponent(uid) + '/logo');
    raw.push('/api/unidades/' + encodeURIComponent(uid) + '/logo');

    raw.push('/images/unidade.png');
    raw.push(base + '/images/unidade.png');

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
    if(!gUnidadeLogo) return;
    var uid = getSelectedUnitId();
    setImgWithFallback(gUnidadeLogo, getUnidadeLogoCandidates(uid));
  }

  // Preenche select de vínculo (habitação e área comum) conforme unidade
  function syncVincSelect(){ var uid = gUnidade.value; var listH = habs.filter(function(h){ return String((h.unidade && h.unidade._id) || h.unidade_id || h.unidadeId)===String(uid); }); var listA = areas.filter(function(a){ return String(a.unidadeId)===String(uid); });
    var html = '<option value="">Selecione...</option>';
  if(listH.length){ html += '<optgroup label="Habitações">' + listH.map(function(h){ var hid = h._id || h.id; return '<option value="hab:'+hid+'">'+escapeHtml(habLabel(h))+'</option>'; }).join('') + '</optgroup>'; }
    if(listA.length){ html += '<optgroup label="Áreas Comuns">' + listA.map(function(a){ return '<option value="area:'+a.id+'">'+escapeHtml(a.nome)+'</option>'; }).join('') + '</optgroup>'; }
    var prev = gVinc ? String(gVinc.value || '') : '';
    gVinc.innerHTML = html;
    if(prev && gVinc.querySelector('option[value="'+cssEscape(prev)+'"]')){ gVinc.value = prev; }
    refreshVincPickerFromSelect();
  }

  function cssEscape(s){
    var v = String(s || '');
    // escape mínimo para selector option[value="..."]
    return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function escapeAttr(v){
    return escapeHtml(String(v || '')).replace(/"/g,'&quot;');
  }

  function openVincMenu(){
    if(!gVincPickerMenu) return;
    gVincPickerMenu.hidden = false;
  }
  function closeVincMenu(){
    if(!gVincPickerMenu) return;
    gVincPickerMenu.hidden = true;
  }

  function renderVincToken(label){
    if(!gVincPickerTokens) return;
    if(!label){ gVincPickerTokens.innerHTML=''; return; }
    gVincPickerTokens.innerHTML = '<span class="wdg-enq-token">'
      + escapeHtml(label)
      + ' <button type="button" data-g-vinc-clear aria-label="Remover">×</button>'
      + '</span>';
  }

  function getSelectedVincLabel(){
    if(!gVinc) return '';
    var val = String(gVinc.value || '');
    if(!val) return '';
    var opt = gVinc.querySelector('option[value="'+cssEscape(val)+'"]');
    return opt ? String(opt.textContent||'').trim() : '';
  }

  function buildVincItemsFromSelect(){
    var items = [];
    if(!gVinc) return items;
    var groups = gVinc.querySelectorAll('optgroup');
    if(groups && groups.length){
      groups.forEach(function(gr){
        var groupLabel = String(gr.getAttribute('label')||'').trim();
        (gr.querySelectorAll('option')||[]).forEach(function(opt){
          var val = String(opt.value||'').trim();
          if(!val) return;
          var label = String(opt.textContent||'').trim();
          items.push({ value: val, label: label, group: groupLabel });
        });
      });
    }else{
      (gVinc.querySelectorAll('option')||[]).forEach(function(opt){
        var val = String(opt.value||'').trim();
        if(!val) return;
        var label = String(opt.textContent||'').trim();
        items.push({ value: val, label: label, group: '' });
      });
    }
    return items;
  }

  function renderVincMenu(items, filter){
    if(!gVincPickerMenu) return;
    var q = String(filter||'').trim().toLowerCase();
    var selectedVal = gVinc ? String(gVinc.value || '') : '';
    var list = (items||[]).filter(function(it){
      if(!it || !it.value) return false;
      if(selectedVal && String(it.value)===selectedVal) return false;
      if(!q) return true;
      return String(it.label||'').toLowerCase().indexOf(q) >= 0
        || String(it.group||'').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    if(list.length===0){
      gVincPickerMenu.innerHTML = '<div class="px-2 py-2 text-muted small">Nenhum resultado.</div>';
      return;
    }
    var unidadeLine = unidadeLabel(getSelectedUnitId()) || 'Condomínio';
    var avatarSrc = (basePath||'') + '/images/home.png';
    gVincPickerMenu.innerHTML = list.map(function(it){
      return ''
        + '<button type="button" class="wdg-enq-picker-item" data-g-vinc-item data-val="'+escapeAttr(it.value)+'">'
        +   '<span class="wdg-pick-avatar">'
        +     '<img src="'+escapeAttr(avatarSrc)+'" alt="" loading="lazy" onerror="this.onerror=null;this.src=\''+escapeAttr(avatarSrc)+'\';">'
        +   '</span>'
        +   '<span class="wdg-pick-lines">'
        +     '<span class="wdg-pick-name">'+escapeHtml(unidadeLine)+'</span>'
        +     '<span class="wdg-pick-hab">'+escapeHtml(it.label || it.value)+'</span>'
        +   '</span>'
        + '</button>';
    }).join('');
  }

  var vincItemsCache = [];
  function refreshVincPickerFromSelect(){
    if(!gVincPickerRoot || !gVinc) return;
    vincItemsCache = buildVincItemsFromSelect();
    var label = getSelectedVincLabel();
    renderVincToken(label);
    if(gVincPickerPlaceholder){
      gVincPickerPlaceholder.hidden = true;
    }
    if(gVincPickerInput){
      gVincPickerInput.value = '';
    }
    renderVincMenu(vincItemsCache, '');
    closeVincMenu();
  }
  async function carregarHabitacoes(unidadeId){ if(!unidadeId){ habs=[]; syncVincSelect(); return; }
    if(habCache[unidadeId]){ habs = habCache[unidadeId]; syncVincSelect(); return; }
    try{ var url = basePath + '/api/habitacoes/busca?unidade=' + encodeURIComponent(unidadeId); var res = await fetch(url,{ cache:'no-store' }); if(!res.ok) throw new Error('HTTP '+res.status); var data = await res.json(); habs = Array.isArray(data)? data : []; habCache[unidadeId]=habs; syncVincSelect(); }
    catch(e){ console.warn('[garagens] Falha ao carregar habitações', e); showToast('Não foi possível carregar habitações para vínculo.','warning'); habs=[]; syncVincSelect(); }
  }
  gUnidade && gUnidade.addEventListener('change', async function(){ refreshUnitLogo(); await carregarHabitacoes(gUnidade.value); await listarVagas(); });

  // Picker do vínculo (single-select)
  if(gVincPickerBox){
    gVincPickerBox.addEventListener('click', function(){
      if(gVincPickerInput) gVincPickerInput.focus();
      openVincMenu();
    });
    gVincPickerBox.addEventListener('keydown', function(e){
      if(!e) return;
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openVincMenu(); if(gVincPickerInput) gVincPickerInput.focus(); }
      if(e.key==='Escape'){ closeVincMenu(); }
    });
  }
  if(gVincPickerInput){
    gVincPickerInput.addEventListener('input', function(){
      renderVincMenu(vincItemsCache, gVincPickerInput.value);
      openVincMenu();
    });
    gVincPickerInput.addEventListener('focus', function(){
      renderVincMenu(vincItemsCache, gVincPickerInput.value);
      openVincMenu();
    });
    gVincPickerInput.addEventListener('keydown', function(e){
      if(!e) return;
      if(e.key==='Escape'){ closeVincMenu(); return; }
    });
  }
  if(gVincPickerRoot){
    gVincPickerRoot.addEventListener('click', function(e){
      var btn = e && e.target ? e.target.closest('[data-g-vinc-item]') : null;
      if(btn && gVinc){
        var v = String(btn.getAttribute('data-val')||'');
        gVinc.value = v;
        refreshVincPickerFromSelect();
        return;
      }
      var clearBtn = e && e.target ? e.target.closest('[data-g-vinc-clear]') : null;
      if(clearBtn && gVinc){
        gVinc.value = '';
        refreshVincPickerFromSelect();
        return;
      }
    });
  }
  document.addEventListener('click', function(e){
    if(!gVincPickerRoot || !gVincPickerMenu) return;
    var t = e && e.target ? e.target : null;
    if(!t) return;
    if(gVincPickerRoot.contains(t)) return;
    closeVincMenu();
  });

  function vinculoLabel(g){
    function findHab(id){ return habs.find(function(x){ return String((x._id||x.id))===String(id); }); }
    if(g.link_type && g.link_id){
      if(g.link_type==='hab'){ var h1=findHab(g.link_id); return h1? habLabel(h1) : '-'; }
      if(g.link_type==='area'){ var a1=areas.find(function(x){ return x.id===g.link_id; }); return a1? a1.nome : '-'; }
    }
    if(g.linkType && g.linkId){
      if(g.linkType==='hab'){ var h2=findHab(g.linkId); return h2? habLabel(h2): '-'; }
      if(g.linkType==='area'){ var a2=areas.find(function(x){ return x.id===g.linkId; }); return a2? a2.nome : '-'; }
    }
    if(g.habId){ var h3=findHab(g.habId); return h3? habLabel(h3) : '-'; }
    return '-';
  }
  function compareGar(a,b){
    function cmp(x,y){ if(x==null&&y==null) return 0; if(x==null) return -1; if(y==null) return 1; x=(typeof x==='string')?x.toLowerCase():x; y=(typeof y==='string')?y.toLowerCase():y; if(x<y) return -1; if(x>y) return 1; return 0; }
    switch(garSort.key){
      case 'nome': return cmp(a.nome, b.nome);
      case 'habitacao': return cmp(vinculoLabel(a), vinculoLabel(b));
      case 'unidade': default: return cmp(unidadeLabelByObj(a.unidade)||unidadeLabel(a.unidadeId), unidadeLabelByObj(b.unidade)||unidadeLabel(b.unidadeId));
    }
  }
  function buildGarRow(g,i){ return '<tr>'+
      '<td>'+ (unidadeLabelByObj(g.unidade) || unidadeLabel(g.unidadeId)) +'</td>'+
      '<td>'+g.nome+'</td>'+
      '<td>'+vinculoLabel(g)+'</td>'+
      '<td>'+
        '<button class="wdg-icon-btn" data-g-det="'+i+'" aria-label="Detalhes" title="Detalhes"><img src="'+basePath+'/images/detalhe.png" alt="Detalhes"/></button> '+
        '<button class="wdg-icon-btn" data-g-edit="'+i+'" aria-label="Editar" title="Editar"><img src="'+basePath+'/images/editar.png" alt="Editar"/></button> '+
        '<button class="wdg-icon-btn" data-g-del="'+i+'" aria-label="Excluir" title="Excluir"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button>'+
      '</td>'+
    '</tr>'; }
  function buildGarPagination(totalPages, pageSize, totalItems){ if(!gPaginas) return; gPaginas.innerHTML='';
    function mk(label, page, disabled){ var b=document.createElement('button'); b.type='button'; b.textContent=label; if(!disabled && page!=null) b.dataset.page=page; if(disabled) b.disabled=true; return b; }
    if(totalPages<=1){
      var firstOnly = mk('<<', 0, true);
      var prevOnly = mk('<', 0, true);
      var oneOnly = mk('1', 0, true); oneOnly.classList.add('active');
      var nextOnly = mk('>', 0, true);
      var lastOnly = mk('>>', 0, true);
      gPaginas.appendChild(firstOnly); gPaginas.appendChild(prevOnly); gPaginas.appendChild(oneOnly); gPaginas.appendChild(nextOnly); gPaginas.appendChild(lastOnly);
      var infoOnly=document.createElement('div'); infoOnly.className='w-100 text-center mt-1'; infoOnly.style.fontSize='.7rem'; infoOnly.textContent='Total: '+totalItems+' vaga(s)'; gPaginas.appendChild(infoOnly);
      return;
    }
    var firstBtn = mk('<<', 0, garPage===0); var prevBtn = mk('<', garPage-1, garPage===0); gPaginas.appendChild(firstBtn); gPaginas.appendChild(prevBtn);
    var windowSize=6; var start=Math.max(0, garPage-Math.floor(windowSize/2)); var end=start+windowSize-1; if(end>=totalPages){ end=totalPages-1; start=Math.max(0, end-windowSize+1); }
    if(start>0){ var b0=mk('1',0,false); if(garPage===0) b0.classList.add('active'); gPaginas.appendChild(b0); var dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; gPaginas.appendChild(dots); }
    for(var p=start;p<=end;p++){ var b=mk(String(p+1), p, false); if(p===garPage) b.classList.add('active'); gPaginas.appendChild(b); }
    if(end<totalPages-1){ var dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; gPaginas.appendChild(dots2); var blast=mk(String(totalPages), totalPages-1, false); if(garPage===totalPages-1) blast.classList.add('active'); gPaginas.appendChild(blast); }
    var nextBtn = mk('>', garPage+1, garPage===totalPages-1); var lastBtn = mk('>>', totalPages-1, garPage===totalPages-1); gPaginas.appendChild(nextBtn); gPaginas.appendChild(lastBtn);
    var info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' vaga(s)'; gPaginas.appendChild(info);
  }
  function renderGarPage(page){ if(!gLista) return; var pageSize = GAR_PAGE_SIZE; if(gPageSizeSel){ var v=parseInt(gPageSizeSel.value,10); if(!isNaN(v)&&v>0) pageSize=v; }
    var sorted = (garagens||[]).slice().sort(function(a,b){ var r=compareGar(a,b); return garSort.dir==='asc'? r : -r; }); var totalPages = Math.ceil(sorted.length / pageSize) || 1; if(page<0) page=0; if(page>=totalPages) page=totalPages-1; garPage=page; var start = page*pageSize; var slice = sorted.slice(start, start+pageSize); gLista.innerHTML = slice.map(function(g,i){ return buildGarRow(g, start+i); }).join(''); buildGarPagination(totalPages, pageSize, sorted.length); }
  function render(){ renderGarPage(garPage); }
  // Carregamento inicial agora será feito via API mais abaixo

  // Eventos da lista agora serão gerenciados após carga API (implementado em nova seção)

  // Botão salvar será redefinido na versão API (seção inferior)
  gLimpar && gLimpar.addEventListener('click', function(){ clearForm(); });
  gCancelar && gCancelar.addEventListener('click', function(){ clearForm(); editIndex=-1; setEditMode(false); });

  function clearForm(){ gNome.value=''; if(gVinc){ gVinc.value=''; } if(gObs){ gObs.value=''; if(gObsCount) gObsCount.textContent='0'; } if(gFoto){ gFoto.value=''; gFotoPrev.src=''; gFotoPrev.classList.add('d-none'); } if(gFotoRemover){ gFotoRemover.classList.add('d-none'); } if(unidades.length===1){ gUnidade.value=unidades[0]._id; } syncVincSelect(); }

  // Inicialização
  if(unidades.length===1 && gUnidade){ gUnidade.value=unidades[0]._id; }
  refreshUnitLogo();
  refreshVincPickerFromSelect();
  // Carregar habitações iniciais se já houver unidade
  (async function(){ if(gUnidade && gUnidade.value){ await carregarHabitacoes(gUnidade.value); } else { syncVincSelect(); } })();
  
  // Helpers HTTP e integração com API
  async function getJson(url){ try{ var res=await fetch(url,{ cache:'no-store' }); if(res.status===503){ showToast('Banco indisponível.','warning'); return null; } if(!res.ok) throw new Error('HTTP '+res.status); return await res.json(); }catch(e){ console.warn('[cadastrar_garagem] GET falhou', url, e); showToast('Falha ao carregar','danger'); return null; } }
  async function sendJson(url, method, body){ try{ var res=await fetch(url,{ method:method||'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) }); if(res.status===503){ showToast('Banco indisponível.','warning'); return null; } if(!res.ok) throw new Error('HTTP '+res.status); var data=await res.json(); showToast(method==='DELETE'? 'Excluído.' : (method==='PUT'? 'Alterado.' : 'Salvo.'),'success'); return data; }catch(e){ console.warn('[cadastrar_garagem] '+(method||'POST')+' falhou', url, e); showToast('Operação falhou','danger'); return null; } }
  async function listarVagas(){ var uid=gUnidade && gUnidade.value ? gUnidade.value : ''; var url = basePath + '/api/garagens/busca' + (uid? ('?unidade='+encodeURIComponent(uid)) : ''); var data=await getJson(url); garagens = Array.isArray(data)? data : []; garPage=0; renderGarPage(garPage); }
  
  function buildGarDeleteLabel(g){
    if(!g) return '—';
    var nome = String(g.nome || '').trim();
    var uidLabel = unidadeLabelByObj(g.unidade) || unidadeLabel(g.unidadeId);
    var label = nome || 'Vaga';
    if(uidLabel) label += ' · ' + uidLabel;
    return label || '—';
  }

  function askGarDeleteConfirm(gLabel){
    var modalEl = byId('garDeleteConfirmModal');
    var nameEl = byId('garDeleteConfirmName');
    var yesBtn = byId('garDeleteConfirmYes');

    // fallback
    if(!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)){
      var suffix = (gLabel && gLabel !== '—') ? (' (' + gLabel + ')') : '';
      return Promise.resolve(window.confirm('Tem certeza que deseja excluir essa vaga?' + suffix + '\n\nEsta exclusão é definitiva e não pode ser desfeita.'));
    }

    if(nameEl) nameEl.textContent = gLabel || '—';

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

  // Render inicial via API (após possíveis habitações)
  (async function(){ try{ await listarVagas(); }catch(_){ } })();

  // Eventos lista (CRUD) com API
  gLista && gLista.addEventListener('click', async function(ev){ var t=ev.target.closest('button'); if(!t) return; 
    if(t.hasAttribute('data-g-del')){
      var i=parseInt(t.getAttribute('data-g-del'),10);
      var g=garagens[i];
      if(!g) return;
      var labelDel = buildGarDeleteLabel(g);
      var okDel = await askGarDeleteConfirm(labelDel);
      if(!okDel) return;
      var delResp = await sendJson(basePath + '/api/garagens/' + encodeURIComponent(g._id), 'DELETE');
      if(!delResp) return;
      await listarVagas();
      return;
    }
  if(t.hasAttribute('data-g-edit')){ var i2=parseInt(t.getAttribute('data-g-edit'),10); var g2=garagens[i2]; if(!g2) return; editIndex=i2; var uidEdit = (g2.unidade && g2.unidade._id) || g2.unidade_id || g2.unidadeId || ''; gUnidade.value = uidEdit; refreshUnitLogo(); await carregarHabitacoes(uidEdit); gNome.value=g2.nome||''; if(g2.link_type && g2.link_id){ gVinc.value=g2.link_type+':'+g2.link_id; } else if(g2.linkType && g2.linkId){ gVinc.value=g2.linkType+':'+g2.linkId; } gObs.value=g2.obs||''; if(gObsCount) gObsCount.textContent=String(gObs.value.length); if(g2.foto){ gFotoPrev.src=g2.foto; gFotoPrev.classList.remove('d-none'); if(gFotoRemover){ gFotoRemover.classList.remove('d-none'); } } else { gFotoPrev.src=''; gFotoPrev.classList.add('d-none'); if(gFotoRemover){ gFotoRemover.classList.add('d-none'); } showToast('Esta vaga não possui foto salva.', 'info'); } setEditMode(true); window.scrollTo({ top:0, behavior:'smooth'}); return; }
    if(t.hasAttribute('data-g-det')){ var i3=parseInt(t.getAttribute('data-g-det'),10); var g3=garagens[i3]; if(!g3) return; abrirDetalhesVaga(g3); return; }
  });

  // Handlers de foto e contador
  gObs && gObs.addEventListener('input', function(){ if(gObsCount) gObsCount.textContent=String(gObs.value.length); });
  gFoto && gFoto.addEventListener('change', function(){ if(gFoto.files && gFoto.files[0]){ var url = URL.createObjectURL(gFoto.files[0]); gFotoPrev.src=url; gFotoPrev.classList.remove('d-none'); } else { gFotoPrev.src=''; gFotoPrev.classList.add('d-none'); } });
  gFotoLimpar && gFotoLimpar.addEventListener('click', function(){ if(gFoto){ gFoto.value=''; } if(gFotoPrev){ gFotoPrev.src=''; gFotoPrev.classList.add('d-none'); } });
  gFotoRemover && gFotoRemover.addEventListener('click', async function(){
    if(editIndex < 0 || !garagens[editIndex] || !garagens[editIndex]._id){ showToast('Remover foto está disponível apenas ao editar.', 'warning'); return; }
    if(!confirm('Remover a foto atual desta vaga?')) return;
    var current = garagens[editIndex];
    var ok = await sendJson(basePath + '/api/garagens/' + encodeURIComponent(current._id), 'PUT', { foto: '' });
    if(ok){
      try{ garagens[editIndex].foto = ''; }catch(_){ }
      if(gFoto){ gFoto.value=''; }
      if(gFotoPrev){ gFotoPrev.src=''; gFotoPrev.classList.add('d-none'); }
      if(gFotoRemover){ gFotoRemover.classList.add('d-none'); }
      await listarVagas();
    }
  });
  gFotoPrev && gFotoPrev.addEventListener('click', function(){ var modalEl = document.getElementById('modalFotoGar'); if(!modalEl || !gFotoPrev.src) return; var img = document.getElementById('fotoGarZoom'); if(img){ img.style.transform='scale(1)'; img.src = gFotoPrev.src; } try{ var m = bootstrap.Modal.getOrCreateInstance(modalEl); m.show(); }catch(_){ } });

  // Modal detalhes
  function abrirDetalhesVaga(g){ var el = document.getElementById('modalDetGarCad'); if(!el) return; var vinc='-';
  if(g.link_type && g.link_id){ if(g.link_type==='hab'){ var h1=habs.find(function(x){ return (x._id||x.id)===g.link_id; }); vinc = h1? habLabel(h1):'-'; } else if(g.link_type==='area'){ var a1=areas.find(function(x){ return x.id===g.link_id; }); vinc = a1? a1.nome:'-'; } }
  else if(g.linkType && g.linkId){ if(g.linkType==='hab'){ var h=habs.find(function(x){ return (x._id||x.id)===g.linkId; }); vinc = h? habLabel(h):'-'; } else if(g.linkType==='area'){ var a=areas.find(function(x){ return x.id===g.linkId; }); vinc = a? a.nome:'-'; } }
  else if(g.habId){ var hf = habs.find(function(x){ return (x._id||x.id)===g.habId; }); vinc = hf? habLabel(hf):'-'; }
    var detU = document.getElementById('detGUnidade'); if(detU) detU.textContent = unidadeLabelByObj(g.unidade) || unidadeLabel(g.unidadeId);
    var detN = document.getElementById('detGNome'); if(detN) detN.textContent = g.nome;
    var detV = document.getElementById('detGVinc'); if(detV) detV.textContent = vinc;
    var detO = document.getElementById('detGObs'); if(detO) detO.textContent = g.obs||'';
    var detF = document.getElementById('detGFoto'); var detFV = document.getElementById('detGFotoVazio');
    if(detF && detFV){ if(g.foto){ detF.src=g.foto; detF.classList.remove('d-none'); detFV.classList.add('d-none'); } else { detF.src=''; detF.classList.add('d-none'); detFV.classList.remove('d-none'); } }
    try{ var m = bootstrap.Modal.getOrCreateInstance(el); m.show(); }catch(_){ }
  }

  // Handler salvar (API)
  async function readFileAsDataURL(file){ return new Promise(function(resolve,reject){ var fr=new FileReader(); fr.onload=function(){ resolve(String(fr.result||'')); }; fr.onerror=function(e){ reject(e); }; fr.readAsDataURL(file); }); }
  gSalvar && gSalvar.addEventListener('click', async function(){ var uid=gUnidade.value; var nome=(gNome.value||'').trim(); var vincVal=gVinc.value||''; if(!uid){ alert('Selecione o condomínio.'); return; } if(!nome){ alert('Informe o nome da vaga.'); return; }
    var dup = garagens.some(function(x,idx){ return String( (x.unidade && x.unidade._id) || x.unidadeId || x.unidade_id )===String(uid) && (x.nome||'').toLowerCase()===nome.toLowerCase() && idx!==editIndex; });
    if(dup){ alert('Já existe uma vaga com este nome neste condomínio.'); return; }
    var link_type='', link_id=null; if(vincVal){ if(vincVal.startsWith('hab:')){ link_type='hab'; link_id=vincVal.substring(4); } else if(vincVal.startsWith('area:')){ link_type='area'; link_id=vincVal.substring(5); } }
    var payload={ unidade_id: uid, nome:nome, link_type:link_type, link_id:link_id, obs:gObs.value||'' };
    if(gFoto && gFoto.files && gFoto.files[0]){ try{ payload.foto = await readFileAsDataURL(gFoto.files[0]); }catch(_e){ showToast('Falha ao ler imagem.','danger'); return; } }
    var resp;
    if(editIndex>=0){ var current = garagens[editIndex]; resp = await sendJson(basePath + '/api/garagens/' + encodeURIComponent(current._id), 'PUT', payload); editIndex=-1; setEditMode(false); }
    else { resp = await sendJson(basePath + '/api/garagens', 'POST', payload); }
    if(resp && payload.foto && !resp.foto_saved){ showToast('Imagem não salva (upload indisponível).','warning'); }
    if(resp && resp.blob_missing_token){ showToast('Configurar token Blob para salvar imagens.','warning'); }
    await listarVagas(); clearForm();
  });

  // Toast util
  function showToast(msg,type){ var c=document.getElementById('toastContainerGar'); if(!c){ c=document.createElement('div'); c.id='toastContainerGar'; c.style.position='fixed'; c.style.top='1rem'; c.style.right='1rem'; c.style.zIndex='1060'; document.body.appendChild(c); } var el=document.createElement('div'); el.className='toast align-items-center text-bg-'+(type||'secondary')+' border-0 show'; el.innerHTML='<div class="d-flex"><div class="toast-body">'+escapeHtml(msg)+'</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>'; c.appendChild(el); setTimeout(function(){ try{ el.remove(); }catch(_){} }, 4000); var btn=el.querySelector('.btn-close'); btn && btn.addEventListener('click', function(){ try{ el.remove(); }catch(_){} }); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]); }); }

  // Paginação e ordenação reinstaladas para API
  if(garTable){ var ths=garTable.querySelectorAll('thead th[data-sort]'); ths.forEach(function(th){ th.addEventListener('click', function(){ var key=th.getAttribute('data-sort'); if(garSort.key===key){ garSort.dir = garSort.dir==='asc'? 'desc':'asc'; } else { garSort.key=key; garSort.dir='asc'; } ths.forEach(function(x){ x.classList.remove('asc','desc'); }); th.classList.add(garSort.dir); renderGarPage(0); }); }); var initTh=garTable.querySelector('thead th[data-sort="'+garSort.key+'"]'); if(initTh){ initTh.classList.add(garSort.dir); } }
  gPaginas && gPaginas.addEventListener('click', function(ev){ var b=ev.target.closest('button[data-page]'); if(!b) return; var pg=parseInt(b.dataset.page,10); if(isNaN(pg)) return; renderGarPage(pg); });
  gPageSizeSel && gPageSizeSel.addEventListener('change', function(){ garPage=0; renderGarPage(garPage); });
})();
