// Versão API: substitui localStorage por chamadas ao backend
(function(){
  var byId=function(id){return document.getElementById(id);};
  var basePath=(document.body.getAttribute('data-base-path')||'/condominios').replace(/\/$/,'');
  var unidades=[]; try{ unidades = JSON.parse((byId('unidadesOptionsData')||{textContent:'[]'}).textContent||'[]'); }catch(_){ unidades=[]; }
  function unidadeLabel(id){ var u = unidades.find(function(x){ return String(x._id)===String(id); }); return u ? (u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome) : id; }

  // Campos
  var acUnidade = byId('acUnidade'); var acNome = byId('acNome'); var acArea = byId('acArea'); var acCapacidade = byId('acCapacidade');
  var acFoto = byId('acFoto'); var acFotoPrev = byId('acFotoPrev'); var acFotoLimpar = byId('acFotoLimpar');
  var acObs = byId('acObs'); var acObsCount = byId('acObsCount');
  var acSalvar = byId('acSalvar'); var acLimpar = byId('acLimpar'); var acCancelar = byId('acCancelarEdicao'); var acLista = byId('acLista');
  var acTable = byId('acTable'); var acPaginas = byId('acPaginas'); var acPageSizeSel = byId('acPageSize');
  var AC_PAGE_SIZE = 50; var acPage = 0; var acSort = { key: 'unidade', dir: 'asc' };

  var MAX_CAPACIDADE = 999999;
  function clampCapacidadeNumber(num){ if(!Number.isFinite(num)) return null; if(num < 0) num = 0; if(num > MAX_CAPACIDADE) num = MAX_CAPACIDADE; return Math.round(num); }
  function sanitizeCapacidadeDigits(raw){ if(raw===null || raw===undefined) return ''; var digits = String(raw).replace(/\D/g,''); if(!digits) return ''; var num = clampCapacidadeNumber(Number(digits)); if(num===null) return ''; return String(num); }
  function formatCapacidadeDisplayFromNumber(num){ if(num===null || num===undefined || num==='') return ''; var clamped = clampCapacidadeNumber(Number(num)); if(clamped===null) return ''; var numberText; if(clamped===0){ numberText='0'; } else if(clamped<10){ numberText=String(clamped).padStart(2,'0'); } else { numberText=String(clamped); } var suffix = clamped===1 ? ' pessoa' : ' pessoas'; return numberText + suffix; }
  function updateCapacidadeInputFromDigits(digits){ if(!acCapacidade) return; var normalizedDigits = sanitizeCapacidadeDigits(digits); if(normalizedDigits===''){ acCapacidade.dataset.rawCapacidade=''; acCapacidade.value=''; requestAnimationFrame(function(){ try{ acCapacidade.setSelectionRange(0,0); }catch(_){ } }); return; } var num = Number(normalizedDigits); var display = formatCapacidadeDisplayFromNumber(num); var caret = display.indexOf(' '); if(caret<0) caret = display.length; acCapacidade.dataset.rawCapacidade = String(normalizedDigits); acCapacidade.value = display; requestAnimationFrame(function(){ try{ acCapacidade.setSelectionRange(caret, caret); }catch(_){ } }); }
  function getCapacidadeValue(){ if(!acCapacidade) return null; var digits = acCapacidade.dataset.rawCapacidade || ''; if(!digits){ digits = sanitizeCapacidadeDigits(acCapacidade.value); } if(!digits) return null; var num = clampCapacidadeNumber(Number(digits)); return num===null ? null : num; }
  function formatCapacidadeHuman(num){ var txt = formatCapacidadeDisplayFromNumber(num); return txt || '-'; }

  var areas = []; // agora vindo da API
  var editIndex=-1;
  function setEditMode(on){ if(!acCancelar || !acSalvar) return; if(on){ acCancelar.classList.remove('d-none'); acSalvar.textContent='Salvar alterações'; } else { acCancelar.classList.add('d-none'); acSalvar.textContent='Cadastrar'; } }

  function compareAC(a,b){ function cmp(x,y){ if(x==null&&y==null) return 0; if(x==null) return -1; if(y==null) return 1; x=(typeof x==='string')?x.toLowerCase():x; y=(typeof y==='string')?y.toLowerCase():y; if(x<y) return -1; if(x>y) return 1; return 0; }
    switch(acSort.key){ case 'nome': return cmp(a.nome,b.nome); case 'unidade': default: return cmp(unidadeLabel( (a.unidade && a.unidade._id)||a.unidade_id||a.unidadeId ), unidadeLabel( (b.unidade && b.unidade._id)||b.unidade_id||b.unidadeId )); }
  }
  function buildACRow(a,i){
    var uid = (a.unidade && a.unidade._id)||a.unidade_id||a.unidadeId;
    return '<tr>' +
      '<td>' + unidadeLabel(uid) + '</td>' +
      '<td>' + escapeHtml(a.nome) + '</td>' +
      '<td>' +
        '<button class="wdg-icon-btn" data-ac-det="' + i + '" aria-label="Detalhes" title="Detalhes"><img src="' + basePath + '/images/detalhe.png" alt="Detalhes"/></button> ' +
        '<button class="wdg-icon-btn" data-ac-edit="' + i + '" aria-label="Editar" title="Editar"><img src="' + basePath + '/images/editar.png" alt="Editar"/></button> ' +
        '<button class="wdg-icon-btn" data-ac-del="' + i + '" aria-label="Excluir" title="Excluir"><img src="' + basePath + '/images/excluir.png" alt="Excluir"/></button>' +
      '</td>' +
    '</tr>';
  }
  function buildACPagination(totalPages, pageSize, totalItems){ if(!acPaginas) return; acPaginas.innerHTML=''; if(totalPages<=1){ var infoOnly=document.createElement('div'); infoOnly.className='w-100 text-center mt-1'; infoOnly.style.fontSize='.7rem'; infoOnly.textContent='Total: '+totalItems+' área(s)'; acPaginas.appendChild(infoOnly); return; }
    function mk(label,page,disabled){ var b=document.createElement('button'); b.type='button'; b.textContent=label; if(page!=null) b.dataset.page=page; if(disabled) b.disabled=true; return b; }
    var firstBtn=mk('<<',0,acPage===0); var prevBtn=mk('<',acPage-1,acPage===0); acPaginas.appendChild(firstBtn); acPaginas.appendChild(prevBtn);
    var windowSize=6; var start=Math.max(0, acPage-Math.floor(windowSize/2)); var end=start+windowSize-1; if(end>=totalPages){ end=totalPages-1; start=Math.max(0, end-windowSize+1); }
    if(start>0){ var b0=mk('1',0,false); if(acPage===0) b0.classList.add('active'); acPaginas.appendChild(b0); var dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; acPaginas.appendChild(dots); }
    for(var p=start;p<=end;p++){ var b=mk(String(p+1),p,false); if(p===acPage) b.classList.add('active'); acPaginas.appendChild(b); }
    if(end<totalPages-1){ var dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; acPaginas.appendChild(dots2); var blast=mk(String(totalPages), totalPages-1, false); if(acPage===totalPages-1) blast.classList.add('active'); acPaginas.appendChild(blast); }
    var nextBtn=mk('>',acPage+1,acPage===totalPages-1); var lastBtn=mk('>>', totalPages-1, acPage===totalPages-1); acPaginas.appendChild(nextBtn); acPaginas.appendChild(lastBtn);
    var info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' área(s)'; acPaginas.appendChild(info);
  }
  function renderACPage(page){ if(!acLista) return; var pageSize=AC_PAGE_SIZE; if(acPageSizeSel){ var v=parseInt(acPageSizeSel.value,10); if(!isNaN(v)&&v>0) pageSize=v; }
    var sorted=(areas||[]).slice().sort(function(a,b){ var r=compareAC(a,b); return acSort.dir==='asc'? r : -r; }); var totalPages=Math.ceil(sorted.length / pageSize)||1; if(page<0) page=0; if(page>=totalPages) page=totalPages-1; acPage=page; var start=page*pageSize; var slice=sorted.slice(start,start+pageSize); acLista.innerHTML=slice.map(function(a,i){ return buildACRow(a,start+i); }).join(''); buildACPagination(totalPages,pageSize,sorted.length); }
  function render(){ renderACPage(acPage); }

  // HTTP helpers
  async function getJson(url){ try{ var res=await fetch(url,{ cache:'no-store' }); if(res.status===503){ showToast('Banco indisponível.','warning'); return null; } if(!res.ok) throw new Error('HTTP '+res.status); return await res.json(); }catch(e){ console.warn('[areas-comuns] GET falhou', url, e); showToast('Falha ao carregar','danger'); return null; } }
  async function sendJson(url,method,body){
    try{
      var res=await fetch(url,{ method:method||'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
      var text = await res.text();
      var payload = null; try{ payload = text ? JSON.parse(text) : null; }catch(_e){ payload=null; }
      if(!res.ok){
        var msg = (payload && (payload.error||payload.detail)) || ('HTTP '+res.status);
        showToast(String(msg), res.status>=500?'danger':'warning');
        return null;
      }
      showToast(method==='DELETE'? 'Excluído.' : (method==='PUT'? 'Alterado.' : 'Salvo.'),'success');
      return payload;
    }catch(e){ console.warn('[areas-comuns] '+(method||'POST')+' falhou', url, e); showToast('Operação falhou','danger'); return null; }
  }
  // Lista sem filtro por unidade: backend aplica escopo do usuário (admin/master vê tudo; user/diretor vê somente suas unidades)
  async function listarAreas(){ var url=basePath + '/api/areas-comuns/busca'; var data=await getJson(url); areas = Array.isArray(data)? data : []; acPage=0; renderACPage(acPage); }

  // Carregamento inicial
  (async function(){ try{ await listarAreas(); }catch(_){ } })();

  // Eventos lista CRUD
  acLista && acLista.addEventListener('click', async function(ev){ var t=ev.target.closest('button'); if(!t) return;
    if(t.hasAttribute('data-ac-del')){ var i=parseInt(t.getAttribute('data-ac-del'),10); var a=areas[i]; if(!a) return; if(!confirm('Excluir esta área?')) return; await sendJson(basePath + '/api/areas-comuns/' + encodeURIComponent(a._id), 'DELETE'); await listarAreas(); return; }
    if(t.hasAttribute('data-ac-edit')){ var i2=parseInt(t.getAttribute('data-ac-edit'),10); var a2=areas[i2]; if(!a2) return; editIndex=i2; var uidEdit=(a2.unidade && a2.unidade._id) || a2.unidade_id || a2.unidadeId || ''; acUnidade.value=uidEdit; acNome.value=a2.nome||''; acArea.value= a2.area_m2!=null ? a2.area_m2 : ''; if(acCapacidade) updateCapacidadeInputFromDigits(a2.capacidade!=null ? String(a2.capacidade) : ''); acObs.value=a2.obs||''; if(acObsCount) acObsCount.textContent=String(acObs.value.length); if(a2.foto){ acFotoPrev.src=a2.foto; acFotoPrev.classList.remove('d-none'); } else { acFotoPrev.src=''; acFotoPrev.classList.add('d-none'); } setEditMode(true); window.scrollTo({ top:0, behavior:'smooth'}); return; }
    if(t.hasAttribute('data-ac-det')){ var i3=parseInt(t.getAttribute('data-ac-det'),10); var a3=areas[i3]; if(!a3) return; abrirDetalhesArea(a3); return; }
  });

  acSalvar && acSalvar.addEventListener('click', async function(){ var uid=acUnidade.value; var nome=(acNome.value||'').trim(); if(!uid){ alert('Selecione o condomínio.'); return; } if(!nome){ alert('Informe o nome da área.'); return; }
    var dup = areas.some(function(x,idx){ var xuid=(x.unidade && x.unidade._id) || x.unidade_id || x.unidadeId; return String(xuid)===String(uid) && (x.nome||'').toLowerCase()===nome.toLowerCase() && idx!==editIndex; });
    if(dup){ alert('Já existe uma área com este nome neste condomínio.'); return; }
  var areaStr = (acArea && typeof acArea.value==='string') ? acArea.value.replace(',', '.') : '';
  var capValue = getCapacidadeValue();
  var payload={ unidade_id: uid, nome:nome, area_m2: areaStr || '', capacidade: capValue!=null ? capValue : null, obs: acObs.value || '' };
    if(acFoto && acFoto.files && acFoto.files[0]){ try{ payload.foto = await readFileAsDataURL(acFoto.files[0]); }catch(_e){ showToast('Falha ao ler imagem.','danger'); return; } }
    var resp;
    if(editIndex>=0){ var current=areas[editIndex]; resp = await sendJson(basePath + '/api/areas-comuns/' + encodeURIComponent(current._id), 'PUT', payload); editIndex=-1; setEditMode(false); }
    else { resp = await sendJson(basePath + '/api/areas-comuns', 'POST', payload); }
    if(resp && payload.foto && !resp.foto_saved){ showToast('Imagem não salva (upload indisponível).','warning'); }
    if(resp && resp.blob_missing_token){ showToast('Configurar token Blob para salvar imagens.','warning'); }
    await listarAreas(); clearForm();
  });

  acLimpar && acLimpar.addEventListener('click', function(){ clearForm(); editIndex=-1; setEditMode(false); });
  acCancelar && acCancelar.addEventListener('click', function(){ clearForm(); editIndex=-1; setEditMode(false); });

  function clearForm(){ acNome.value=''; acArea.value=''; if(acCapacidade){ updateCapacidadeInputFromDigits(''); } if(acObs){ acObs.value=''; if(acObsCount) acObsCount.textContent='0'; } if(acFoto){ acFoto.value=''; acFotoPrev.src=''; acFotoPrev.classList.add('d-none'); } if(unidades.length===1){ acUnidade.value=unidades[0]._id; } }

  // Foto e contador
  acObs && acObs.addEventListener('input', function(){ if(acObsCount) acObsCount.textContent=String(acObs.value.length); });
  acFoto && acFoto.addEventListener('change', function(){ if(acFoto.files && acFoto.files[0]){ var url=URL.createObjectURL(acFoto.files[0]); acFotoPrev.src=url; acFotoPrev.classList.remove('d-none'); } else { acFotoPrev.src=''; acFotoPrev.classList.add('d-none'); } });
  acFotoLimpar && acFotoLimpar.addEventListener('click', function(){ if(acFoto){ acFoto.value=''; } if(acFotoPrev){ acFotoPrev.src=''; acFotoPrev.classList.add('d-none'); } });
  acFotoPrev && acFotoPrev.addEventListener('click', function(){ var modalEl=document.getElementById('modalFotoAreaComum'); if(!modalEl || !acFotoPrev.src) return; var img=document.getElementById('fotoAreaComumZoom'); if(img){ img.style.transform='scale(1)'; img.src=acFotoPrev.src; } try{ var m=bootstrap.Modal.getOrCreateInstance(modalEl); m.show(); }catch(_){ } });

  function abrirDetalhesArea(a){ var el=document.getElementById('modalDetAreaConstCad'); if(!el) return; var detU=byId('detACUnidade'); if(detU) detU.textContent = unidadeLabel( (a.unidade && a.unidade._id) || a.unidade_id || a.unidadeId ); var detN=byId('detACNome'); if(detN) detN.textContent = a.nome; var detA=byId('detACArea'); if(detA) detA.textContent = a.area_m2!=null ? (a.area_m2+' m²') : '-'; var detCap=byId('detACCapacidade'); if(detCap) detCap.textContent = formatCapacidadeHuman(a.capacidade); var detO=byId('detACObs'); if(detO) detO.textContent = a.obs||''; var detF=byId('detACFoto'); var detFV=byId('detACFotoVazio'); if(detF && detFV){ if(a.foto){ detF.classList.remove('d-none'); detFV.classList.add('d-none'); detF.src=a.foto; } else { detF.classList.add('d-none'); detFV.classList.remove('d-none'); detF.src=''; } } try{ var m=bootstrap.Modal.getOrCreateInstance(el); m.show(); }catch(_){ } }

  if(acCapacidade){
    acCapacidade.dataset.rawCapacidade = sanitizeCapacidadeDigits(acCapacidade.value);
    acCapacidade.addEventListener('input', function(){ var digits = sanitizeCapacidadeDigits(acCapacidade.value); updateCapacidadeInputFromDigits(digits); });
    acCapacidade.addEventListener('focus', function(){ var val = acCapacidade.value || ''; var caret = val.indexOf(' '); if(caret<0) caret = val.length; requestAnimationFrame(function(){ try{ acCapacidade.setSelectionRange(caret, caret); }catch(_){ } }); });
  }

  // Utilidades
  async function readFileAsDataURL(file){ return new Promise(function(resolve,reject){ var fr=new FileReader(); fr.onload=function(){ resolve(String(fr.result||'')); }; fr.onerror=function(e){ reject(e); }; fr.readAsDataURL(file); }); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[c]; }); }
  function showToast(msg,type){ var c=document.getElementById('toastContainerAreas'); if(!c){ c=document.createElement('div'); c.id='toastContainerAreas'; c.style.position='fixed'; c.style.top='1rem'; c.style.right='1rem'; c.style.zIndex='1060'; document.body.appendChild(c); } var el=document.createElement('div'); el.className='toast align-items-center text-bg-'+(type||'secondary')+' border-0 show'; el.innerHTML='<div class="d-flex"><div class="toast-body">'+escapeHtml(msg)+'</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>'; c.appendChild(el); setTimeout(function(){ try{ el.remove(); }catch(_){} },4000); var btn=el.querySelector('.btn-close'); btn && btn.addEventListener('click', function(){ try{ el.remove(); }catch(_){} }); }

  // Inicialização de seleção de unidade única
  if(unidades.length===1 && acUnidade){ acUnidade.value=unidades[0]._id; }
  // Paginação eventos
  acPaginas && acPaginas.addEventListener('click', function(ev){ var b=ev.target.closest('button[data-page]'); if(!b) return; var pg=parseInt(b.dataset.page,10); if(isNaN(pg)) return; renderACPage(pg); });
  acPageSizeSel && acPageSizeSel.addEventListener('change', function(){ acPage=0; renderACPage(acPage); });
  // Ordenação cabeçalho
  if(acTable){ var ths=acTable.querySelectorAll('thead th[data-sort]'); ths.forEach(function(th){ th.addEventListener('click', function(){ var key=th.getAttribute('data-sort'); if(acSort.key===key){ acSort.dir = acSort.dir==='asc'? 'desc':'asc'; } else { acSort.key=key; acSort.dir='asc'; } ths.forEach(function(x){ x.classList.remove('asc','desc'); }); th.classList.add(acSort.dir); renderACPage(0); }); }); var initTh=acTable.querySelector('thead th[data-sort="'+acSort.key+'"]'); if(initTh){ initTh.classList.add(acSort.dir); } }
})();
