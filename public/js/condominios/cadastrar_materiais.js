(function(){
  var byId = function(id){ return document.getElementById(id); };
  var basePath=(document.body.getAttribute('data-base-path')||'/condominios').replace(/\/$/,'');
  var unidades=[]; try{ unidades = JSON.parse((byId('unidadesOptionsData')||{textContent:'[]'}).textContent||'[]'); }catch(_){ unidades=[]; }
  function unidadeLabel(id){ var u = unidades.find(function(x){ return String(x._id)===String(id); }); return u ? (u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome) : id; }

  // Estado em memória vindo da API
  var materiais=[]; // itens vindos de /api/materiais/busca
  var areasAll=[];  // vindas de /api/areas-comuns/busca
  var naturezas=[]; // vindas de /api/materiais/naturezas/busca

  // Elements
  var unidadeTop = byId('unidadeTop');
  var unidadeTopLogo = byId('unidadeTopLogo');

  var mUnidade=byId('mUnidade'); var mNome=byId('mNome'); var mSerie=byId('mSerie'); var mGerarSerie=byId('mGerarSerie'); var mData=byId('mDataAquisicao');
  var mMarca=byId('mMarca'); var mModelo=byId('mModelo'); var mNumSerie=byId('mNumSerie'); var mPeso=byId('mPeso'); var mCor=byId('mCor');
  var mFoto=byId('mFoto'); var mFotoPrev=byId('mFotoPrev'); var mFotoLimpar=byId('mFotoLimpar');
  var mAnexo=byId('mAnexo'); var mAnexoLimpar=byId('mAnexoLimpar'); var mAnexoLista=byId('mAnexoLista');
  var vUnidade=byId('vUnidade'); var vArea=byId('vArea'); var vTabela=byId('vTabela'); var btnInserirVinc=byId('btnInserirVinc'); var btnLimparVinc=byId('btnLimparVinc');
  var vUnidadeResumo = byId('vUnidadeResumo');
  var mSalvar=byId('mSalvar'); var mLimpar=byId('mLimpar'); var mCancelar=byId('mCancelar');

  // Natureza form elements
  var nUnidade=byId('nUnidade'); var nTipo=byId('nTipo'); var nNome=byId('nNome');
  var nLimpar=byId('nLimpar'); var nSalvar=byId('nSalvar'); var nCancelar=byId('nCancelar'); var nLista=byId('nLista');
  // Chaves auxiliares para preferências do usuário
  var LS_PREF_TIPO_MAT = 'wdgPrefUltimoTipoMaterial';
  // Recupera último tipo salvo
  var ultimoTipo = (function(){ try{ return localStorage.getItem(LS_PREF_TIPO_MAT)||''; }catch(_){ return ''; } })();
  if(ultimoTipo){ var radio = document.querySelector('input[name="mTipo"][value="'+ultimoTipo+'"]'); if(radio){ radio.checked=true; } }

  var matTable=byId('matTable'); var matLista=byId('matLista'); var matPaginas=byId('matPaginas'); var matPageSizeSel=byId('matPageSize');
  var MAT_PAGE_SIZE=50; var matPage=0; var matSort={ key:'nome', dir:'asc' };
  var editIndex=-1; var currentFotoURL=''; var currentAnexoURL=''; var currentAnexoMeta=null;

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

  function getUnidadeLogoCandidates(uid){
    uid = String(uid || '').trim();
    var base = basePath || '';
    var raw = [];
    if(uid){
      raw.push(base.replace(/\/+$/, '') + '/api/unidades/' + encodeURIComponent(uid) + '/logo');
      raw.push(base + '/api/unidades/' + encodeURIComponent(uid) + '/logo');
      raw.push('/api/unidades/' + encodeURIComponent(uid) + '/logo');
    }
    raw.push('/images/unidade.png');
    raw.push(base + '/images/unidade.png');
    var out = [];
    for(var j=0;j<raw.length;j++){
      var s = String(raw[j] || '').trim();
      if(!s) continue;
      if(out.indexOf(s) >= 0) continue;
      out.push(s);
    }
    return out;
  }

  function refreshLogoFor(sel, img){
    if(!sel || !img) return;
    setImgWithFallback(img, getUnidadeLogoCandidates(sel.value));
  }

  function setMatEditMode(on){
    if(!mSalvar) return;
    if(on){
      mSalvar.textContent = 'Alterar';
      if(mCancelar) mCancelar.classList.remove('d-none');
    } else {
      mSalvar.textContent = 'Cadastrar';
      if(mCancelar) mCancelar.classList.add('d-none');
    }
  }

  function fillUnidadesSelect(sel){
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>' + (unidades||[]).map(function(u){
      return '<option value="'+u._id+'">'+(u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome)+'</option>';
    }).join('');
    if(unidades.length===1){ sel.value=unidades[0]._id; }
  }

  fillUnidadesSelect(unidadeTop);
  fillUnidadesSelect(mUnidade);
  fillUnidadesSelect(nUnidade);

  function syncUnidadeFromTop(){
    if(!unidadeTop) return;
    if(mUnidade) mUnidade.value = unidadeTop.value;
    if(nUnidade) nUnidade.value = unidadeTop.value;
  }

  function syncUnidadeTopFromAny(){
    if(!unidadeTop) return;
    var val = (mUnidade && mUnidade.value) || (nUnidade && nUnidade.value) || '';
    unidadeTop.value = val;
  }

  // Inicializa seletores internos a partir do topo
  syncUnidadeTopFromAny();
  syncUnidadeFromTop();
  refreshLogoFor(unidadeTop, unidadeTopLogo);
  setMatEditMode(false);
  // Vínculo: condomínio como label/plaintext
  function syncVincUnidadeDisplay(){
    if(!vUnidadeResumo) return;
    var opt = mUnidade && mUnidade.options ? mUnidade.options[mUnidade.selectedIndex] : null;
    vUnidadeResumo.textContent = (opt && opt.value) ? opt.text : 'Selecione um condomínio';
  }

  unidadeTop && unidadeTop.addEventListener('change', function(){
    syncUnidadeFromTop();
    rebuildMaterialNomeOptions();
    syncVincUnidadeDisplay();
    syncAreas();
    refreshLogoFor(unidadeTop, unidadeTopLogo);
  });

  syncVincUnidadeDisplay();

  function getSelectedUnidadeId(){
    return (unidadeTop && unidadeTop.value) ? String(unidadeTop.value) : String((mUnidade && mUnidade.value) || (nUnidade && nUnidade.value) || '');
  }

  function syncAreas(){
    var uid=getSelectedUnidadeId();
    if(mUnidade) mUnidade.value = uid;
    if(nUnidade) nUnidade.value = uid;
    var list = (areasAll||[]).filter(function(a){
      var auid=(a.unidade && a.unidade._id)||a.unidade_id||a.unidadeId;
      return String(auid)===String(uid);
    });
    vArea.innerHTML = '<option value="">Selecione...</option>'+ list.map(function(a){
      return '<option value="'+((a._id)||a.id)+'">'+a.nome+'</option>';
    }).join('');
  }
  if(unidades.length===1){ syncAreas(); }

  function rebuildMaterialNomeOptions(){
    if(!mNome) return;
    var uid=getSelectedUnidadeId();
    if(mUnidade) mUnidade.value = uid;
    if(nUnidade) nUnidade.value = uid;
    var tipoEl = document.querySelector('input[name="mTipo"]:checked');
    var tipo = tipoEl ? tipoEl.value : 'Fixo';
    var list = (naturezas||[]).filter(function(n){ var nuid=(n.unidade && n.unidade._id)||n.unidade_id||n.unidadeId; return String(nuid)===String(uid) && String(n.tipo)===String(tipo); }).sort(function(a,b){ return (a.nome||'').localeCompare(b.nome||'', 'pt-BR'); });
    mNome.innerHTML = '<option value="">Selecione...</option>'+ list.map(function(n){ return '<option value="'+((n._id)||n.id)+'">'+(n.nome||'')+'</option>'; }).join('');
  }
  // rebuildMaterialNomeOptions roda quando o condomínio do topo muda ou o tipo muda
  document.querySelectorAll('input[name="mTipo"]').forEach(function(r){ r.addEventListener('change', rebuildMaterialNomeOptions); });
  // Inicializa select nome conforme filtros atuais
  rebuildMaterialNomeOptions();

  // HTTP helpers
  async function getJson(url, tries){
    tries = typeof tries==='number' ? tries : 3;
    try{
      var res=null; var lastStatus=0;
      for(var i=0;i<tries;i++){
        res = await fetch(url,{ cache:'no-store' }); lastStatus = res.status||0;
        if(lastStatus!==503) break;
        // Respeita Retry-After quando presente; fallback exponencial 1s, 2s, 3s
        var ra = parseInt(res.headers.get('Retry-After')||'',10);
        var waitMs = !isNaN(ra) ? (ra*1000) : ((i+1)*1000);
        if(i<tries-1) await new Promise(r=>setTimeout(r, waitMs));
      }
      if(lastStatus===503){ showToast('Banco indisponível. Tente novamente em instantes.','warning'); return null; }
      if(!res.ok) throw new Error('HTTP '+res.status);
      return await res.json();
    }catch(e){ console.warn('[materiais] GET falhou', url, e); showToast('Falha ao carregar','danger'); return null; }
  }
  async function sendJson(url,method,body){
    try{
      var res=await fetch(url,{ method:method||'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
      var text = await res.text(); var payload = null; try{ payload = text ? JSON.parse(text) : null; }catch(_e){ payload=null; }
      if(!res.ok){ var msg=(payload&&(payload.error||payload.detail))||('HTTP '+res.status); showToast(String(msg), res.status>=500?'danger':'warning'); return null; }
      // Evita toast duplicado para QRCode (o caller já mostra 'QR Code salvo.')
      var isQr = typeof url==='string' && url.indexOf('/qrcode')>=0;
      if(!isQr){ showToast(method==='DELETE'? 'Excluído.' : (method==='PUT'? 'Alterado.' : 'Salvo.'),'success'); }
      return payload;
    }catch(e){ console.warn('[materiais] '+(method||'POST')+' falhou', url, e); showToast('Operação falhou','danger'); return null; }
  }

  function buildMatDeleteLabel(m){
    if(!m) return '—';
    var nome = String((m.natureza && m.natureza.nome) || m.nome || '').trim();
    var serie = String(m.serie || '').trim();
    var label = nome;
    if(serie) label = (label ? (label + ' · ') : '') + 'Patrimônio ' + serie;
    label = String(label || '').trim();
    return label || '—';
  }

  function askMatDeleteConfirm(label){
    var modalEl = byId('matDeleteConfirmModal');
    var nameEl = byId('matDeleteConfirmName');
    var yesBtn = byId('matDeleteConfirmYes');

    if(!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)){
      var suffix = (label && label !== '—') ? (' (' + label + ')') : '';
      return Promise.resolve(window.confirm('Tem certeza que deseja excluir este material?' + suffix + '\n\nEsta exclusão é definitiva e não pode ser desfeita.'));
    }

    if(nameEl) nameEl.textContent = label || '—';

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

  // Naturezas CRUD e listagem
  function clearNatForm(retainTipo){
    if(unidades.length===1){
      if(unidadeTop) unidadeTop.value=unidades[0]._id;
      syncUnidadeFromTop();
      refreshLogoFor(unidadeTop, unidadeTopLogo);
    }
    if(nTipo && !retainTipo){ nTipo.value='Fixo'; }
    if(nNome){ nNome.value=''; }
  }
  nLimpar && nLimpar.addEventListener('click', function(){ clearNatForm(false); if(nNome){ nNome.focus(); } });

  function renderNaturezas(){ if(!nLista) return; var rows = (naturezas||[]).slice().sort(function(a,b){ return (a.nome||'').localeCompare(b.nome||'','pt-BR'); }).map(function(n){
      var uid=(n.unidade && n.unidade._id)||n.unidade_id||n.unidadeId; var id=(n._id)||n.id;
      return '<tr data-id="'+id+'"><td>'+unidadeLabel(uid)+'</td><td>'+(n.tipo||'')+'</td><td>'+(n.nome||'')+'</td><td>'+
        '<button type="button" class="wdg-icon-btn" data-action="natEdit" aria-label="Editar natureza"><img src="'+basePath+'/images/editar.png" alt="Editar"/></button> '+
        '<button type="button" class="wdg-icon-btn" data-action="natDel" aria-label="Excluir natureza"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button>'+
      '</td></tr>';
    }).join('');
    nLista.innerHTML = rows || '<tr><td colspan="4" class="text-center text-muted">Nenhuma natureza cadastrada.</td></tr>';
  }

  async function listarNaturezas(){ var url=basePath + '/api/materiais/naturezas/busca'; var data=await getJson(url); naturezas = Array.isArray(data)? data : []; renderNaturezas(); rebuildMaterialNomeOptions(); }

  var natEditId=null;
  function enterNatEditMode(){ if(nSalvar){ nSalvar.textContent='Salvar'; } if(nCancelar){ nCancelar.classList.remove('d-none'); } }
  function exitNatEditMode(){ natEditId=null; if(nSalvar){ nSalvar.textContent='Cadastrar'; } if(nCancelar){ nCancelar.classList.add('d-none'); } }
  nSalvar && nSalvar.addEventListener('click', async function(){
    var uid = getSelectedUnidadeId();
    if(nUnidade) nUnidade.value = uid;
    if(mUnidade) mUnidade.value = uid;
    var tipo=nTipo.value||'Fixo';
    var nome=(nNome.value||'').trim();
    if(!uid){ return alert('Selecione o condomínio.'); }
    if(!nome){ return alert('Informe o nome da natureza.'); }
    // Verificar duplicidade localmente para feedback rápido
    var exists = (naturezas||[]).some(function(n){ var id=(n._id)||n.id; var nuid=(n.unidade && n.unidade._id)||n.unidade_id||n.unidadeId; return id!==natEditId && String(nuid)===String(uid) && String(n.tipo)===String(tipo) && String(n.nome||'').toLowerCase()===nome.toLowerCase(); });
    if(exists){ return alert('Já existe natureza com este nome para o condomínio e tipo.'); }
    var payload={ unidade_id: uid, tipo: tipo, nome: nome };
    var resp;
    if(natEditId){ resp = await sendJson(basePath + '/api/materiais/naturezas/' + encodeURIComponent(natEditId), 'PUT', payload); exitNatEditMode(); }
    else { resp = await sendJson(basePath + '/api/materiais/naturezas', 'POST', payload); }
    await listarNaturezas(); clearNatForm(true); if(nNome){ nNome.focus(); }
  });
  nLista && nLista.addEventListener('click', async function(ev){ var btn=ev.target.closest('button[data-action]'); if(!btn) return; var tr=btn.closest('tr'); if(!tr) return; var id=tr.getAttribute('data-id'); var action=btn.getAttribute('data-action');
    if(action==='natDel'){ if(confirm('Excluir esta natureza?')){ await sendJson(basePath + '/api/materiais/naturezas/' + encodeURIComponent(id), 'DELETE'); await listarNaturezas(); rebuildMaterialNomeOptions(); } return; }
    if(action==='natEdit'){
      var n = (naturezas||[]).find(function(x){ return String((x._id)||x.id)===String(id); });
      if(!n) return;
      natEditId=(n._id)||n.id;
      var nuid=(n.unidade && n.unidade._id)||n.unidade_id||n.unidadeId;
      if(unidadeTop) unidadeTop.value=nuid;
      syncUnidadeFromTop();
      if(nTipo) nTipo.value=n.tipo;
      if(nNome) nNome.value=n.nome;
      rebuildMaterialNomeOptions();
      syncVincUnidadeDisplay();
      syncAreas();
      refreshLogoFor(unidadeTop, unidadeTopLogo);
      enterNatEditMode();
      window.scrollTo({ top:0, behavior:'smooth'});
    }
  });
  nCancelar && nCancelar.addEventListener('click', function(){ exitNatEditMode(); clearNatForm(true); if(nNome){ nNome.focus(); } });

  function randomSerial(){ var chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; var len=Math.floor(Math.random()*12)+4; if(len>15) len=15; var s=''; for(var i=0;i<len;i++){ s+=chars[Math.floor(Math.random()*chars.length)]; } return s; }
  function serialExists(s){ var v = String(s||''); if(!v) return false; return (materiais||[]).some(function(m,idx){ return (idx!==editIndex) && String(m.serie||'').toLowerCase()===v.toLowerCase(); }); }
  mGerarSerie && mGerarSerie.addEventListener('click', function(){ var s=''; do{ s = randomSerial(); }while(serialExists(s)); mSerie.value=s; });

  mFoto && mFoto.addEventListener('change', function(){ if(mFoto.files && mFoto.files[0]){ if(currentFotoURL){ try{ URL.revokeObjectURL(currentFotoURL); }catch(_){ } } currentFotoURL = URL.createObjectURL(mFoto.files[0]); mFotoPrev.src=currentFotoURL; mFotoPrev.classList.remove('d-none'); } else { if(currentFotoURL){ try{ URL.revokeObjectURL(currentFotoURL); }catch(_){ } } currentFotoURL=''; mFotoPrev.src=''; mFotoPrev.classList.add('d-none'); } });
  mFotoLimpar && mFotoLimpar.addEventListener('click', function(){ if(mFoto){ mFoto.value=''; } if(currentFotoURL){ try{ URL.revokeObjectURL(currentFotoURL); }catch(_){ } } currentFotoURL=''; if(mFotoPrev){ mFotoPrev.src=''; mFotoPrev.classList.add('d-none'); } });

  mAnexo && mAnexo.addEventListener('change', function(){ mAnexoLista.innerHTML=''; currentAnexoMeta=null; if(currentAnexoURL){ try{ URL.revokeObjectURL(currentAnexoURL); }catch(_){ } currentAnexoURL=''; }
    var f = mAnexo.files && mAnexo.files[0]; if(f){ if(f.type!=='application/pdf'){ alert('Selecione um arquivo PDF.'); mAnexo.value=''; return; } currentAnexoMeta={ name:f.name, type:f.type }; currentAnexoURL = URL.createObjectURL(f); var li=document.createElement('li'); li.className='list-group-item d-flex justify-content-between align-items-center'; var a=document.createElement('a'); a.href=currentAnexoURL; a.target='_blank'; a.textContent=f.name; var rm=document.createElement('button'); rm.type='button'; rm.className='btn btn-sm btn-outline-danger'; rm.innerText='Remover'; rm.addEventListener('click', function(){ if(mAnexo){ mAnexo.value=''; } if(currentAnexoURL){ try{ URL.revokeObjectURL(currentAnexoURL); }catch(_){ } currentAnexoURL=''; } currentAnexoMeta=null; mAnexoLista.innerHTML=''; }); li.appendChild(a); li.appendChild(rm); mAnexoLista.appendChild(li); }
  });
  mAnexoLimpar && mAnexoLimpar.addEventListener('click', function(){ if(mAnexo){ mAnexo.value=''; } if(currentAnexoURL){ try{ URL.revokeObjectURL(currentAnexoURL); }catch(_){ } currentAnexoURL=''; } currentAnexoMeta=null; mAnexoLista.innerHTML=''; });

  btnInserirVinc && btnInserirVinc.addEventListener('click', function(){
    var uid=getSelectedUnidadeId();
    if(mUnidade) mUnidade.value = uid;
    if(nUnidade) nUnidade.value = uid;
    var aid=vArea.value;
    var uText = (vUnidadeResumo && vUnidadeResumo.textContent) ? vUnidadeResumo.textContent : unidadeLabel(uid);
    var aText = (vArea.options[vArea.selectedIndex]||{}).text || '';
    if(!uid || !aid){ return alert('Selecione o condomínio e a área.'); }
    vTabela.innerHTML='';
    var tr=document.createElement('tr');
    tr.dataset.unidadeId=uid;
    tr.dataset.areaId=aid;
    tr.innerHTML='<td>'+uText+'</td><td>'+aText+'</td><td><button type="button" class="wdg-icon-btn" data-action="remV" aria-label="Remover vinculação"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button></td>';
    vTabela.appendChild(tr);
  });
  btnLimparVinc && btnLimparVinc.addEventListener('click', function(){ vTabela.innerHTML=''; });
  vTabela && vTabela.addEventListener('click', function(ev){ var b=ev.target.closest('button[data-action="remV"]'); if(!b) return; var tr=b.closest('tr'); if(tr) tr.remove(); });

  function buildAreaRotulo(uid, aid){ var uni = unidadeLabel(uid); var area = (areasAll||[]).find(function(a){ var aid0=(a._id)||a.id; return String(aid0)===String(aid); }); var an = area ? area.nome : '-'; return (uni||'-') + ' - ' + an; }

  function compareMat(a,b){ function cmp(x,y){ if(x==null&&y==null) return 0; if(x==null) return -1; if(y==null) return 1; x=(typeof x==='string')?x.toLowerCase():x; y=(typeof y==='string')?y.toLowerCase():y; if(x<y) return -1; if(x>y) return 1; return 0; }
    var an=a.natureza&&a.natureza.nome||a.nome||''; var bn=b.natureza&&b.natureza.nome||b.nome||'';
    switch(matSort.key){
      case 'tipo': return cmp(a.tipo, b.tipo);
      case 'nome': return cmp(an, bn);
      case 'serie': return cmp(a.serie||'', b.serie||'');
      case 'data': return cmp(a.data_aquisicao||'', b.data_aquisicao||'');
      case 'area': default: return cmp(a.area_rotulo||a.areaRotulo||'', b.area_rotulo||b.areaRotulo||'');
    }
  }

  function formatDateBR(iso){ if(!iso) return ''; var d=new Date(iso); if(isNaN(d)) return ''; var dd=String(d.getDate()).padStart(2,'0'); var mm=String(d.getMonth()+1).padStart(2,'0'); var yy=d.getFullYear(); return dd+'/'+mm+'/'+yy; }
  function parseDateBRtoISO(v){ var m=(v||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return ''; var d=new Date(+m[3], +m[2]-1, +m[1]); if(isNaN(d)) return ''; return d.toISOString().slice(0,10); }

  function buildMatRow(m){ var nome = (m.natureza && m.natureza.nome) || m.nome || ''; return '<tr data-id="'+(m._id||'')+'">'+
      '<td>'+ (m.tipo||'') +'</td>'+
      '<td>'+ nome +'</td>'+
      '<td>'+(m.serie||'-')+'</td>'+
      '<td>'+(formatDateBR(m.data_aquisicao)||'-')+'</td>'+
      '<td>'+(m.area_rotulo||m.areaRotulo||'-')+'</td>'+
      '<td>'+
        '<button class="wdg-icon-btn" data-m-det="'+(m._id||'')+'" aria-label="Detalhes"><img src="'+basePath+'/images/detalhe.png" alt="Detalhes"/></button> '+
        '<button class="wdg-icon-btn" data-m-qr="'+(m._id||'')+'" aria-label="QR Code"><img src="'+basePath+'/images/codigo-qr.png" alt="QR Code"/></button> '+
        '<button class="wdg-icon-btn" data-m-edit="'+(m._id||'')+'" aria-label="Editar"><img src="'+basePath+'/images/editar.png" alt="Editar"/></button> '+
        '<button class="wdg-icon-btn" data-m-del="'+(m._id||'')+'" aria-label="Excluir"><img src="'+basePath+'/images/excluir.png" alt="Excluir"/></button>'+
      '</td>'+
    '</tr>'; }

  var matFilter='';

  function sortAndRender(page){ var pageSize = MAT_PAGE_SIZE; if(matPageSizeSel){ var v=parseInt(matPageSizeSel.value,10); if(!isNaN(v)&&v>0) pageSize=v; }
    // Enriquecer rótulos
    materiais.forEach(function(m){ var uid=(m.unidade && m.unidade._id)||m.unidade_id||m.unidadeId; m.unidadeRotulo = unidadeLabel(uid); if(!m.area_rotulo && m.vinculo_area && m.vinculo_area.unidade_id && m.vinculo_area.area_id){ m.areaRotulo = buildAreaRotulo(m.vinculo_area.unidade_id, m.vinculo_area.area_id); } });
    var filtered = (!matFilter)? materiais : materiais.filter(function(m){
      try{
        var nome = (m.natureza && m.natureza.nome) || m.nome || '';
        var serie = m.serie || '';
        var tipo = m.tipo || '';
        var marca = m.marca || '';
        var modelo = m.modelo || '';
        var cor = m.cor || '';
        var area = m.area_rotulo || m.areaRotulo || '';
        var blob = (nome+' '+serie+' '+tipo+' '+marca+' '+modelo+' '+cor+' '+area).toLowerCase();
        return blob.indexOf(matFilter)>=0;
      }catch(_){ return true; }
    });
    var sorted = filtered.slice().sort(function(a,b){ var r=compareMat(a,b); return matSort.dir==='asc'? r : -r; });
    var totalPages = Math.ceil(sorted.length / pageSize) || 1; if(page<0) page=0; if(page>=totalPages) page=totalPages-1; matPage=page; var start=page*pageSize; var slice=sorted.slice(start, start+pageSize);
    matLista.innerHTML = slice.map(function(m){ return buildMatRow(m); }).join('');
    buildPagination(totalPages, pageSize, sorted.length);
  }

  function buildPagination(totalPages, pageSize, totalItems){ if(!matPaginas) return; matPaginas.innerHTML=''; if(totalPages<=1){ var infoOnly=document.createElement('div'); infoOnly.className='w-100 text-center mt-1'; infoOnly.style.fontSize='.7rem'; infoOnly.textContent='Total: '+totalItems+' material(is)'; matPaginas.appendChild(infoOnly); return; }
    function mk(label, page, disabled){ var b=document.createElement('button'); b.type='button'; b.textContent=label; if(page!=null) b.dataset.page=page; if(disabled) b.disabled=true; return b; }
    var firstBtn=mk('<<',0,matPage===0); var prevBtn=mk('<', matPage-1, matPage===0); matPaginas.appendChild(firstBtn); matPaginas.appendChild(prevBtn);
    var windowSize=6; var start=Math.max(0, matPage-Math.floor(windowSize/2)); var end=start+windowSize-1; if(end>=totalPages){ end=totalPages-1; start=Math.max(0, end-windowSize+1);} 
    if(start>0){ var b0=mk('1',0,false); if(matPage===0) b0.classList.add('active'); matPaginas.appendChild(b0); var dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; matPaginas.appendChild(dots); }
    for(var p=start;p<=end;p++){ var b=mk(String(p+1), p, false); if(p===matPage) b.classList.add('active'); matPaginas.appendChild(b); }
    if(end<totalPages-1){ var dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; matPaginas.appendChild(dots2); var blast=mk(String(totalPages), totalPages-1, false); if(matPage===totalPages-1) blast.classList.add('active'); matPaginas.appendChild(blast); }
    var nextBtn=mk('>', matPage+1, matPage===totalPages-1); var lastBtn=mk('>>', totalPages-1, matPage===totalPages-1); matPaginas.appendChild(nextBtn); matPaginas.appendChild(lastBtn);
    var info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' material(is)'; matPaginas.appendChild(info);
  }

  matPaginas && matPaginas.addEventListener('click', function(ev){ var b=ev.target.closest('button[data-page]'); if(!b) return; var pg=parseInt(b.dataset.page,10); if(isNaN(pg)) return; sortAndRender(pg); });
  matPageSizeSel && matPageSizeSel.addEventListener('change', function(){ matPage=0; sortAndRender(matPage); });

  function clearForm(){ mNome.value=''; mSerie.value=''; mData.value=''; if(mMarca) mMarca.value=''; if(mModelo) mModelo.value=''; if(mNumSerie) mNumSerie.value=''; if(mPeso) mPeso.value=''; if(mCor) mCor.value=''; var mDesc=byId('mDesc'); if(mDesc){ mDesc.value=''; var c=byId('mDescCount'); if(c) c.textContent='0'; } if(mFoto){ mFoto.value=''; } if(mFotoPrev){ mFotoPrev.src=''; mFotoPrev.classList.add('d-none'); } if(mAnexo){ mAnexo.value=''; } mAnexoLista.innerHTML=''; currentFotoURL=''; if(currentAnexoURL){ try{ URL.revokeObjectURL(currentAnexoURL); }catch(_){ } currentAnexoURL=''; } currentAnexoMeta=null; vTabela.innerHTML=''; if(unidades.length===1){ if(unidadeTop) unidadeTop.value=unidades[0]._id; syncUnidadeFromTop(); refreshLogoFor(unidadeTop, unidadeTopLogo); } syncVincUnidadeDisplay(); syncAreas(); editIndex=-1; rebuildMaterialNomeOptions(); }
  mLimpar && mLimpar.addEventListener('click', function(){ clearForm(); setMatEditMode(false); });
  mCancelar && mCancelar.addEventListener('click', function(){ clearForm(); setMatEditMode(false); window.scrollTo({ top:0, behavior:'smooth' }); });

  mSalvar && mSalvar.addEventListener('click', async function(){
    var uid=getSelectedUnidadeId();
    if(mUnidade) mUnidade.value = uid;
    if(nUnidade) nUnidade.value = uid;
    var tipo = (document.querySelector('input[name="mTipo"]:checked')||{}).value || 'Fixo';
    var naturezaId=(mNome.value||'').trim();
    var serie=(mSerie.value||'').trim();
    var dataISO = parseDateBRtoISO((mData && mData.value) || '');
    if(!uid){ return alert('Selecione o condomínio.'); } if(!naturezaId){ return alert('Selecione o nome do material.'); }
    if((mData.value||'').trim() && !dataISO){ return alert('Informe a data de aquisição no formato dd/mm/aaaa.'); }
    if(serie){ if(serie.length>15){ return alert('Nº de patrimônio deve ter até 15 caracteres.'); }
      if(!/^[A-Za-z0-9]{1,15}$/.test(serie)){ return alert('Nº de patrimônio deve ser alfanumérico (1 a 15).'); }
    }
    var marca=(mMarca&&mMarca.value||'').trim(); var modelo=(mModelo&&mModelo.value||'').trim(); var numSerie=(mNumSerie&&mNumSerie.value||'').trim(); var peso=(mPeso&&mPeso.value||'').trim(); var cor=(mCor&&mCor.value||'').trim(); var desc=(byId('mDesc')&&byId('mDesc').value||'').trim();
    var vincTr = vTabela.querySelector('tr'); var vinculo = null; if(vincTr){ vinculo = { unidade_id: vincTr.dataset.unidadeId, area_id: vincTr.dataset.areaId }; }
    var payload={ unidade_id: uid, tipo: tipo, natureza_id: naturezaId, serie: serie || '', data_aquisicao: dataISO || '', marca: marca, modelo: modelo, num_serie: numSerie, peso: peso, cor: cor, descricao: desc, vinculo_area: vinculo };
    if(mFoto && mFoto.files && mFoto.files[0]){ try{ payload.foto = await readFileAsDataURL(mFoto.files[0]); }catch(_e){ showToast('Falha ao ler imagem.','danger'); return; } }
    if(mAnexo && mAnexo.files && mAnexo.files[0]){ var f=mAnexo.files[0]; if(f.type!=='application/pdf'){ alert('Selecione um arquivo PDF.'); return; } try{ payload.anexo = await readFileAsDataURL(f); }catch(_e){ showToast('Falha ao ler anexo.','danger'); return; } }
    var resp;
    if(editIndex>=0){ var current=materiais[editIndex]; resp = await sendJson(basePath + '/api/materiais/' + encodeURIComponent(current._id), 'PUT', payload); editIndex=-1; setMatEditMode(false); }
    else { resp = await sendJson(basePath + '/api/materiais', 'POST', payload); }
    if(resp && payload.foto && !resp.foto_saved){ showToast('Imagem não salva (upload indisponível).','warning'); }
    if(resp && payload.anexo && !resp.anexo_saved){ showToast('Anexo não salvo (upload indisponível).','warning'); }
    await listarMateriais(); clearForm(); setMatEditMode(false);
    // Salva preferência do tipo
    try{ localStorage.setItem(LS_PREF_TIPO_MAT, tipo); }catch(_){ }
    var radioPref = document.querySelector('input[name="mTipo"][value="'+tipo+'"]'); if(radioPref){ radioPref.checked=true; }
    rebuildMaterialNomeOptions();
  });

  matLista && matLista.addEventListener('click', async function(ev){ var t=ev.target.closest('button'); if(!t) return;
    if(t.hasAttribute('data-m-del')){
      var id=t.getAttribute('data-m-del');
      var idx=materiais.findIndex(function(x){ return String(x._id)===String(id); });
      var m = idx>=0 ? materiais[idx] : null;
      if(!m) return;
      var ok = await askMatDeleteConfirm(buildMatDeleteLabel(m));
      if(!ok) return;
      await sendJson(basePath + '/api/materiais/' + encodeURIComponent(m._id), 'DELETE');
      await listarMateriais();
      return;
    }
    if(t.hasAttribute('data-m-edit')){ var id2=t.getAttribute('data-m-edit'); var idx2=materiais.findIndex(function(x){ return String(x._id)===String(id2); }); var m=materiais[idx2]; if(!m) return; editIndex=idx2; var uid=(m.unidade && m.unidade._id)||m.unidade_id||m.unidadeId; mUnidade.value=uid; syncVincUnidadeDisplay(); syncAreas(); (m.tipo==='Móvel'? byId('mTipoMovel'):byId('mTipoFixo')).checked=true; rebuildMaterialNomeOptions(); var natId=(m.natureza && m.natureza._id)||m.natureza_id||''; mNome.value=natId; mSerie.value=m.serie||''; mData.value = m.data_aquisicao ? formatDateBR(m.data_aquisicao) : ''; if(mMarca) mMarca.value=m.marca||''; if(mModelo) mModelo.value=m.modelo||''; if(mNumSerie) mNumSerie.value=m.num_serie||''; if(mPeso) mPeso.value=m.peso||''; if(mCor) mCor.value=m.cor||''; var md=byId('mDesc'); if(md){ md.value=m.descricao||''; var c=byId('mDescCount'); if(c) c.textContent=String((m.descricao||'').length); } if(m.foto){ mFotoPrev.src=m.foto; mFotoPrev.classList.remove('d-none'); } else { mFotoPrev.classList.add('d-none'); mFotoPrev.src=''; }
      vTabela.innerHTML=''; if(m.vinculo_area && m.vinculo_area.unidade_id && m.vinculo_area.area_id){ syncAreas(); vArea.value=m.vinculo_area.area_id; btnInserirVinc.click(); }
      if(unidadeTop) unidadeTop.value=uid;
      syncUnidadeFromTop();
      refreshLogoFor(unidadeTop, unidadeTopLogo);
      setMatEditMode(true);
      window.scrollTo({ top:0, behavior:'smooth'}); return; }
    if(t.hasAttribute('data-m-qr')){ var idqr=t.getAttribute('data-m-qr'); var mq=materiais.find(function(x){ return String(x._id)===String(idqr); }); if(!mq) return; var uid0=(mq.unidade && mq.unidade._id)||mq.unidade_id||mq.unidadeId; var uni = unidades.find(function(u){ return String(u._id)===String(uid0); })||{}; try { if(!mq.area_rotulo && mq.vinculo_area && mq.vinculo_area.unidade_id && mq.vinculo_area.area_id){ mq.area_rotulo = buildAreaRotulo(mq.vinculo_area.unidade_id, mq.vinculo_area.area_id); } mq.lotacao = mq.area_rotulo || ''; } catch(_) { }
      var ctx = { material: { id: mq._id, unidadeId: uid0, nome: (mq.natureza&&mq.natureza.nome)||'', marca: mq.marca||'', modelo: mq.modelo||'', cor: mq.cor||'', serie: mq.serie||'', lotacao: mq.lotacao||mq.area_rotulo||'' }, unidade: { nome: uni.nome||'', codigo: uni.codigo||'', razao: uni.razaoSocial||uni.razao||'', cnpj: uni.cnpj||'', endereco: uni.endereco||'', telefone: uni.telefone||'', logo: uni.logoUrl||uni.logo||'' } };
      // Se os dados da unidade pré-carregados não tiverem logo/telefone/razao, busca a versão pública para enriquecer o snapshot
      try {
        var needsEnrich = !(ctx.unidade.logo) || !(ctx.unidade.telefone) || !(ctx.unidade.razao);
        if(needsEnrich && uid0){
          var pub = await getJson('/gestor/api/public/unidades/' + encodeURIComponent(uid0));
          if(pub && pub.success && pub.data){ var d=pub.data; ctx.unidade = { nome: d.nome||ctx.unidade.nome||'', codigo: ctx.unidade.codigo||'', razao: d.razaoSocial||d.razao||ctx.unidade.razao||'', cnpj: d.cnpj||ctx.unidade.cnpj||'', endereco: d.endereco||ctx.unidade.endereco||'', telefone: d.telefone||ctx.unidade.telefone||'', logo: d.logo||ctx.unidade.logo||'' }; }
        }
      }catch(_enrich){}
      // Tenta carregar QR persistido do servidor
      (async function(){ var qrDoc = await getJson(basePath + '/api/materiais/' + encodeURIComponent(mq._id) + '/qrcode'); if(qrDoc && !qrDoc.error){ ctx.material.qrData = { url: qrDoc.url || '', payload: qrDoc.payload || {}, imgUrl: qrDoc.img || '' }; }
        if(window.WDG_MAT_QR && typeof window.WDG_MAT_QR.abrir==='function'){
          window.WDG_MAT_QR.abrir(ctx, async function(updated){ try{ var qr = (updated && updated.qrData) || {}; var body = { url: qr.url || '', payload: qr.payload || {} }; if(qr.imgDataUrl){ body.img = qr.imgDataUrl; } var saved = await sendJson(basePath + '/api/materiais/' + encodeURIComponent(mq._id) + '/qrcode', 'POST', body); if(saved && saved.img){ showToast('QR Code salvo.','success'); } }catch(_){ showToast('Falha ao salvar QR.','danger'); } });
        }
      })();
      return; }
    if(t.hasAttribute('data-m-det')){ var idd=t.getAttribute('data-m-det'); var m3=materiais.find(function(x){ return String(x._id)===String(idd); }); if(!m3) return; var uid1=(m3.unidade && m3.unidade._id)||m3.unidade_id||m3.unidadeId; var det = { unidadeRotulo: unidadeLabel(uid1), tipo: m3.tipo||'', nome: (m3.natureza && m3.natureza.nome)||'', serie: m3.serie||'-', dataAquisicao: formatDateBR(m3.data_aquisicao)||'-', marca: m3.marca||'-', modelo: m3.modelo||'-', numSerie: m3.num_serie||'-', peso: m3.peso||'-', cor: m3.cor||'-', desc: (m3.descricao||'').trim(), vinculos: [], anexos: [], fotoURL: '', anexoURL: '' };
      if(m3.vinculo_area && m3.vinculo_area.unidade_id && m3.vinculo_area.area_id){ det.vinculos.push({ rotulo: buildAreaRotulo(m3.vinculo_area.unidade_id, m3.vinculo_area.area_id) }); }
      if(m3.foto){ det.fotoURL = m3.foto; }
      if(m3.anexo){ det.anexoURL = m3.anexo; det.anexos = [{ name: 'Nota fiscal (PDF)', url: m3.anexo }]; }
      if(window.WDG_MAT_DET && typeof window.WDG_MAT_DET.abrir==='function'){ window.WDG_MAT_DET.abrir(det); }
      return; }
  });

  // Ordenação por cabeçalho
  if(matTable){ var ths = matTable.querySelectorAll('thead th[data-sort]'); ths.forEach(function(th){ th.addEventListener('click', function(){ var key=th.getAttribute('data-sort'); if(matSort.key===key){ matSort.dir = matSort.dir==='asc' ? 'desc' : 'asc'; } else { matSort.key=key; matSort.dir='asc'; } ths.forEach(function(x){ x.classList.remove('asc','desc'); }); th.classList.add(matSort.dir); sortAndRender(0); }); }); var initTh=matTable.querySelector('thead th[data-sort="'+matSort.key+'"]'); if(initTh){ initTh.classList.add(matSort.dir); } }

  async function listarAreas(){
    var data=await getJson(basePath + '/api/areas-comuns/busca');
    areasAll = Array.isArray(data)? data : [];
    syncAreas();
  }
  async function listarMateriais(){ var data=await getJson(basePath + '/api/materiais/busca'); materiais = Array.isArray(data)? data : []; matPage=0; sortAndRender(matPage); }

  (async function init(){
    await listarNaturezas();
    await listarAreas();
    await listarMateriais();
    // Garantir selects sincronizados mesmo sem novo change
    rebuildMaterialNomeOptions();
    syncVincUnidadeDisplay();
    syncAreas();
  })();

  // Contador de descrição
  (function(){ var ta=byId('mDesc'); var ct=byId('mDescCount'); if(!ta||!ct) return; ta.addEventListener('input', function(){ var v=ta.value||''; if(v.length>4000){ ta.value=v.slice(0,4000); v=ta.value; } ct.textContent=String(v.length); }); })();
  // Utilidades
  async function readFileAsDataURL(file){ return new Promise(function(resolve,reject){ var fr=new FileReader(); fr.onload=function(){ resolve(String(fr.result||'')); }; fr.onerror=function(e){ reject(e); }; fr.readAsDataURL(file); }); }
  function showToast(msg,type){ var c=document.getElementById('toastContainerMateriais'); if(!c){ c=document.createElement('div'); c.id='toastContainerMateriais'; c.style.position='fixed'; c.style.top='1rem'; c.style.right='1rem'; c.style.zIndex='1060'; document.body.appendChild(c); } var el=document.createElement('div'); el.className='toast align-items-center text-bg-'+(type||'secondary')+' border-0 show'; el.innerHTML='<div class="d-flex"><div class="toast-body">'+String(msg)+'</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>'; c.appendChild(el); setTimeout(function(){ try{ el.remove(); }catch(_){} },4000); var btn=el.querySelector('.btn-close'); btn && btn.addEventListener('click', function(){ try{ el.remove(); }catch(_){} }); }
})();
