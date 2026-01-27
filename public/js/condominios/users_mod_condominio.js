// v4 - dados carregados do backend (/api/usuarios/busca), sem localStorage; listas somente leitura
(function(){
  var BASE = (document.body && document.body.getAttribute('data-base-path')) || '/condominios';
  var byId = function(id){ return document.getElementById(id); };
  // Listas e controles: Gestor
  var elListaGestor = byId('uListaGestor');
  var pagerGestor = byId('gPaginas');
  var pageSizeSelGestor = byId('gPageSize');
  var tblHeadGestor = document.querySelector('#tblUsersGestor thead');
  // Listas e controles: Gestão de Condomínios
  var elListaCondo = byId('uListaCondo');
  var pagerCondo = byId('uPaginas');
  var pageSizeSelCondo = byId('uPageSize');
  var tblHeadCondo = document.querySelector('#tblUsersCondo thead');
  var PAGE_SIZE_DEFAULT = 50;
  // Estado de paginação/ordenação separado por lista
  var stateGestor = { page: 0, sortKey: 'email', sortDir: 'asc' };
  var stateCondo = { page: 0, sortKey: 'email', sortDir: 'asc' };
  // Formulário removido: página somente listagem
  // Estado de dados carregados do backend
  var fetchedUsers = [];
  // Fallback: dados inline (se fetch falhar)
  var inlineExisting = []; try{ inlineExisting = JSON.parse((byId('existingUsersData')||{textContent:'[]'}).textContent || '[]') || []; }catch(_){ inlineExisting = []; }

  // Carrega habitações do localStorage (mantidas pela página Habitação)
  var habs = []; try{ habs = JSON.parse(localStorage.getItem('wdgHabMain')||'[]'); }catch(_){ habs=[]; }
  // Unidades (para rotular a coluna Condomínio)
  var unidades = []; try{ unidades = JSON.parse((byId('unidadesOptionsData')||{textContent:'[]'}).textContent||'[]'); }catch(_){ unidades=[]; }
  function unidadeLabelById(id){ if(!id && id!==0) return ''; var u = (unidades||[]).find(function(x){ return String(x._id)===String(id); }); return u ? (u.codigo ? (u.codigo + ' - ' + u.nome) : u.nome) : String(id); }
  var blocosCache = []; var andaresCache = []; try{ blocosCache = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]'); }catch(_){ blocosCache=[]; } try{ andaresCache = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]'); }catch(_){ andaresCache=[]; }
  function habLabel(h){ if(!h) return ''; var label=''; try{ if(window.WDG_HAB && typeof window.WDG_HAB.label==='function'){ label = window.WDG_HAB.label(h, blocosCache, andaresCache, { incluirTipo:true }); } else { var bloco = h.blocoId? (blocosCache.find(function(b){return b.id===h.blocoId;})||{}).nome:''; var andar = h.andarId? (andaresCache.find(function(a){return a.id===h.andarId;})||{}).nome:''; label = [bloco, andar, h.numero].filter(Boolean).join(' - '); } }catch(_){ label=''; }
    return label; }
  // Sem select de habitação nesta página

  // Sem edição nesta página

  // Removidos helpers de validação de formulário
  function getHabUnidadeId(hid){ if(!hid) return null; var h = (habs||[]).find(function(x){ return String(x.id)===String(hid); }); return h? h.unidadeId : null; }
  function getUnitFromRec(u){ return u && (u.unidadeId || u.unidade_id || getHabUnidadeId(u.habId) || null); }
  // Determina se vínculo é de propriedade (proprietário) – compatível com dados legados sem flag.
  function isOwnerVinculo(v){
    if(!v) return false;
    if(v.proprietario === true) return true;
    if(v.proprietario === false) return false;
    // Legado: sem flag => proprietário quando não é morador
    var mv = v.morador; var isMor = (mv===true || mv==='S' || mv==='true' || mv===1 || mv==='1');
    return !isMor;
  }
  // Utilidades: data de nascimento e idade
  function parseDateBRorISO(s){
    if(!s) return null; s=String(s).trim();
    // dd/mm/aaaa
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m){ var d=new Date(+m[3], +m[2]-1, +m[1]); return isNaN(d)? null : d; }
    // ISO
    var d2 = new Date(s); return isNaN(d2)? null : d2;
  }
  function calcIdade(d){ if(!d) return null; var t=new Date(); var a=t.getFullYear()-d.getFullYear(); var m=t.getMonth()-d.getMonth(); if(m<0 || (m===0 && t.getDate()<d.getDate())) a--; return a; }
  // Sem exclusão nesta página (somente leitura)
  // (sem verificação de duplicidade nesta página)

  // (sem listeners de formulário)

  // Construção das listas (a partir de fetchedUsers)
  function collectAll(){
    var users = Array.isArray(fetchedUsers) ? fetchedUsers : [];
    // Normaliza para exibição nos dois blocos
    var gestMerged = users
      // Mostrar SOMENTE colaboradores do Gestor (possuem vínculo de funcionário)
      .filter(function(u){ return !!u.is_funcionario; })
      .map(function(u, idx){
      var email = String(u.email||'').toLowerCase();
      var nome = u.nome || u.name || '';
      var nivel = (u.role||u.nivel||'').toLowerCase();
      var funcao = u.funcao || u.funcao_nome || '';
  // IMPORTANTE: na lista de Colaboradores, a coluna "Condomínio" deve refletir a unidade do usuário no Gestor.
  // Não usar vínculos do Portal (vinculos/habitações), pois podem ser de outras unidades e "trocar" o condomínio exibido.
  var unidadeEfetiva = (u.unidade_id!=null) ? u.unidade_id : ((u.unidadeId!=null) ? u.unidadeId : null);
      return {
        email: email,
        nome: nome,
        nivel: nivel,
        funcao: funcao,
        perms: Array.isArray(u.perms)? u.perms.slice() : [],
        unidade: unidadeLabelById(unidadeEfetiva),
        origem:'gestor', origemTipo:'gestor', existingIndex: idx, unidade_id: unidadeEfetiva || null,
        shadowIndex: -1
      };
    });

    // Usuários Condôminos: todos os usuários que NÃO são colaboradores do Gestor.
    // - Se tiverem vínculos/perm. (Prop/Mora) exibimos os rótulos e o botão fica desabilitado.
    // - Se não tiverem vínculos (caso do usuário removido de proprietários/moradores) ainda aparecem com botão excluir habilitado.
    var condoOnly = users.filter(function(u){
      var permsArr0 = Array.isArray(u.perms)? u.perms : [];
      var vincs0 = Array.isArray(u.vinculos)? u.vinculos : [];
      var hasCondoVinc0 = (permsArr0.indexOf('Prop')!==-1 || permsArr0.indexOf('Mora')!==-1 || (vincs0 && vincs0.length>0));
      var isCondUserRole = String(u.role||'').toLowerCase() === 'condominio';
      var hasCondDuplicado = !!u.cond_usuario_id || isCondUserRole;
      // Incluir usuários do Gestor que possuam vínculos de condomínio ou já possuam duplicata no módulo condominial
      return hasCondoVinc0 || !u.is_funcionario || hasCondDuplicado;
    }).map(function(u){
      var permsArr = Array.isArray(u.perms)? u.perms.slice() : [];
      var vincs = Array.isArray(u.vinculos)? u.vinculos : [];
      // Agrupar vínculos por habitação para combinar papéis (proprietário, morador - inquilino)
      var byHab = {};
      var unitLblSet = new Set();
      (vincs||[]).forEach(function(v){
        if(!v) return;
        var hid = (v.habitacao_id!=null ? v.habitacao_id : v.habId) || '';
        if(!hid) return;
        var uid = v.unidade_id || getHabUnidadeId(hid) || '';
        var keyH = String(uid)+'|'+String(hid);
        var entry = byHab[keyH];
        var unitLbl0 = unidadeLabelById(uid) || '';
        if(unitLbl0) unitLblSet.add(unitLbl0);
        if(!entry){
          var habLbl0 = (v.hab_label || formatHab(hid) || ('#'+String(hid)));
          entry = byHab[keyH] = { uid: uid, hid: hid, unitLbl: unitLbl0, habLbl: habLbl0, isProp: false, isMor: false, isInq: false };
        }
        var mv = v && v.morador; var isMor = (mv===true || mv==='S' || mv==='true' || mv===1 || mv==='1');
        var isProp = isOwnerVinculo(v);
        var isInq = false; try { isInq = !!v.inquilino; } catch(_) { isInq = false; }
        entry.isProp = entry.isProp || isProp;
        entry.isMor = entry.isMor || isMor;
        entry.isInq = entry.isInq || (isMor && isInq);
      });
      var habHtml = Object.keys(byHab).map(function(k){
        var e = byHab[k];
        var papelParts = [];
        if(e.isProp) papelParts.push('proprietário');
        if(e.isMor) papelParts.push('morador' + (e.isInq ? ' - inquilino' : ''));
        var tag = papelParts.length ? (' (' + papelParts.join(', ') + ')') : '';
        return (e.unitLbl? (e.unitLbl+' - ') : '') + e.habLbl + tag;
      }).join('<br>');
      var unitList = Array.from(unitLblSet).filter(Boolean);
      if(!unitList.length){
        var fallbackUnit = unidadeLabelById(u.unidade_id);
        if(fallbackUnit) unitList.push(fallbackUnit);
      }
      var condHtml = unitList.length ? unitList.join('<br>') : ' - ';
      var condSort = unitList.length ? unitList.join(' | ') : '';
      var isCondUser = String(u.role||'') === 'condominio';
      var gestorUserId = null;
      if(isCondUser){
        gestorUserId = u.usuario_id || null;
      } else {
        gestorUserId = u._id || u.id || null;
      }
      return {
        id: u._id || u.id || null,
        usuario_id: gestorUserId,
        cond_usuario_id: isCondUser ? (u.cond_usuario_id || u._id || u.id || null) : (u.cond_usuario_id || null),
        email: String(u.email||'').toLowerCase(),
        nome: u.nome || u.name || '',
        perms: permsArr,
        hab: habHtml,
        cond: condSort,
        condHtml: condHtml,
        hasLinks: (permsArr.indexOf('Prop')!==-1 || permsArr.indexOf('Mora')!==-1 || (vincs && vincs.length>0)),
        isFuncionario: !!u.is_funcionario
      };
    });

    return { gestMerged: gestMerged, condoOnly: condoOnly };
  }
  function sortData(data, state){
    var key = state.sortKey; var dir = state.sortDir === 'desc' ? -1 : 1;
    function value(u){ if(key==='perms') return (u.perms||[]).join('|'); return String(u[key]||''); }
    data.sort(function(a,b){ var av=value(a).toLowerCase(); var bv=value(b).toLowerCase(); if(av<bv) return -1*dir; if(av>bv) return 1*dir; return 0; });
    return data;
  }

  function pageSlice(data, state, getSize){
    var size = getSize();
    var totalPages = Math.ceil(data.length / size) || 1;
    if(state.page < 0) state.page = 0;
    if(state.page >= totalPages) state.page = totalPages - 1;
    var start = state.page * size;
    return { slice: data.slice(start, start+size), totalPages: totalPages, totalItems: data.length };
  }

  function buildPager(container, state, totalPages, totalItems, onRender){ if(!container) return; container.innerHTML=''; if(totalPages<=1){ var info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' usuário(s)'; container.appendChild(info); return; }
    function mk(label, go, dis){ var b=document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=!!dis; b.addEventListener('click', function(){ state.page=go; onRender(); }); return b; }
    var win=5; var start=Math.max(0, state.page-Math.floor(win/2)); var end=Math.min(totalPages-1, start+win-1);
    container.appendChild(mk('<<',0,state.page===0)); container.appendChild(mk('<',state.page-1,state.page===0));
    if(start>0){ var b0=mk('1',0,false); if(state.page===0) b0.classList.add('active'); container.appendChild(b0); var dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; container.appendChild(dots); }
    for(var p=start;p<=end;p++){ var b=mk(String(p+1),p,false); if(p===state.page) b.classList.add('active'); container.appendChild(b); }
    if(end<totalPages-1){ var dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; container.appendChild(dots2); var blast=mk(String(totalPages), totalPages-1,false); if(state.page===totalPages-1) blast.classList.add('active'); container.appendChild(blast); }
    container.appendChild(mk('>', state.page+1, state.page===totalPages-1)); container.appendChild(mk('>>', totalPages-1, state.page===totalPages-1));
    var info2=document.createElement('div'); info2.className='w-100 text-center mt-1'; info2.style.fontSize='.7rem'; info2.textContent='Total: '+totalItems+' usuário(s)'; container.appendChild(info2);
  }

  function getPageSizeGestor(){ if(!pageSizeSelGestor) return PAGE_SIZE_DEFAULT; var v=parseInt(pageSizeSelGestor.value,10); return (!isNaN(v)&&v>0)? v : PAGE_SIZE_DEFAULT; }
  function getPageSizeCondo(){ if(!pageSizeSelCondo) return PAGE_SIZE_DEFAULT; var v=parseInt(pageSizeSelCondo.value,10); return (!isNaN(v)&&v>0)? v : PAGE_SIZE_DEFAULT; }
  pageSizeSelGestor && pageSizeSelGestor.addEventListener('change', function(){ stateGestor.page=0; renderGestor(); });
  pageSizeSelCondo && pageSizeSelCondo.addEventListener('change', function(){ stateCondo.page=0; renderCondo(); });

  function updateSortClasses(head, state){ if(!head) return; var ths = head.querySelectorAll('th[data-sort]'); ths.forEach(function(th){ th.classList.remove('asc','desc'); var k=th.getAttribute('data-sort'); if(k===state.sortKey){ th.classList.add(state.sortDir); } }); }
  tblHeadGestor && tblHeadGestor.addEventListener('click', function(e){ var th=e.target.closest('th[data-sort]'); if(!th) return; var k=th.getAttribute('data-sort'); if(k===stateGestor.sortKey){ stateGestor.sortDir = (stateGestor.sortDir==='asc'?'desc':'asc'); } else { stateGestor.sortKey=k; stateGestor.sortDir='asc'; } stateGestor.page=0; renderGestor(); });
  tblHeadCondo && tblHeadCondo.addEventListener('click', function(e){ var th=e.target.closest('th[data-sort]'); if(!th) return; var k=th.getAttribute('data-sort'); if(k===stateCondo.sortKey){ stateCondo.sortDir = (stateCondo.sortDir==='asc'?'desc':'asc'); } else { stateCondo.sortKey=k; stateCondo.sortDir='asc'; } stateCondo.page=0; renderCondo(); });
  function formatHab(id){ if(!id) return ''; var h = (habs||[]).find(function(x){ return String(x.id)===String(id); }); return h? habLabel(h) : ''; }

  // Sem CRUD: página somente leitura

  function renderGestor(){ if(!elListaGestor) return; var lists = collectAll(); var data = lists.gestMerged.slice(); sortData(data, stateGestor); var pg = pageSlice(data, stateGestor, getPageSizeGestor); var rows = pg.slice.map(function(u){
      return '<tr><td>'+u.email+'</td><td>'+u.nome+'</td><td>'+u.nivel+'</td><td>'+(u.funcao||'')+'</td><td>'+(u.unidade||'')+'</td></tr>';
    }).join(''); elListaGestor.innerHTML = rows; buildPager(pagerGestor, stateGestor, pg.totalPages, pg.totalItems, renderGestor); updateSortClasses(tblHeadGestor, stateGestor); }

  function renderCondo(){ if(!elListaCondo) return; var lists = collectAll();
    // Usuários do condomínio (somente leitura)
    var data = lists.condoOnly.slice();
    sortData(data, stateCondo); var pg = pageSlice(data, stateCondo, getPageSizeCondo); var rows = pg.slice.map(function(u){
      var permsLabel = (u.perms && u.perms.length) ? u.perms.map(function(p){ return p === 'resp' ? 'Resp' : p; }).join(', ') : '';
      var condDisplay = u.condHtml || (u.cond ? u.cond.replace(/\s*\|\s*/g, '<br>') : ' - ');
      var condUserId = u.cond_usuario_id || '';
      var canDelete = !u.hasLinks && !!condUserId;
      var title;
      if(!condUserId){
        title = 'Usuário sem cadastro no módulo Condôminos';
      } else if(u.hasLinks){
        title = 'Usuário possui vínculos ativos';
      } else {
        title = 'Remover do módulo Condôminos';
      }
      var disabled = canDelete ? '' : ' disabled';
      var btn = '<button type="button" class="wdg-icon-btn" data-action="del-user" data-cond-user-id="'+(condUserId||'')+'" aria-label="'+title+'" title="'+title+'"'+disabled+'><img src="'+BASE+'/images/excluir.png" alt="Excluir"/></button>';
      return '<tr data-gestor-id="'+(u.usuario_id||'')+'" data-cond-user-id="'+(condUserId||'')+'"><td>'+u.email+'</td><td>'+u.nome+'</td><td>'+permsLabel+'</td><td>'+condDisplay+'</td><td>'+(u.hab||'')+'</td><td class="text-nowrap">'+btn+'</td></tr>';
    }).join(''); elListaCondo.innerHTML = rows; buildPager(pagerCondo, stateCondo, pg.totalPages, pg.totalItems, renderCondo); updateSortClasses(tblHeadCondo, stateCondo); }

  function renderAll(){ renderGestor(); renderCondo(); }

  // Carregar do backend e iniciar renderização
  function loadFromBackend(){
    // Evita 304 adicionando cache-buster e instruindo o fetch a não usar cache
  var url = BASE + '/api/usuarios/busca.v2?_ts=' + Date.now();
    return fetch(url, { method:'GET', credentials:'same-origin', headers:{ 'Accept':'application/json' }, cache: 'no-store' })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(data){ fetchedUsers = Array.isArray(data)? data : (Array.isArray(data && data.items)? data.items : []); })
      .catch(function(){
        // Fallback para inline, caso API indisponível
        fetchedUsers = (inlineExisting||[]).map(function(u){ return {
          email:(u.email||'').toLowerCase(), nome:u.nome||'', role:(u.role||'').toLowerCase(),
          perms:Array.isArray(u.perms)? u.perms.slice():[], vinculos: Array.isArray(u.vinculos)? u.vinculos.slice():[]
        }; });
      });
  }

  loadFromBackend().finally(function(){ renderAll(); });

  // Delegação: exclusão de usuário (condomínios) – permitido apenas quando não há vínculos
  if (document.getElementById('tblUsersCondo')) {
    document.getElementById('tblUsersCondo').addEventListener('click', function(e){
      var btn = e.target.closest('button[data-action="del-user"]');
      if(!btn) return;
      if(btn.disabled) return;
      var condId = btn.getAttribute('data-cond-user-id') || (btn.closest('tr') && btn.closest('tr').getAttribute('data-cond-user-id')) || '';
      if(!condId){ alert('Não foi possível identificar o cadastro do módulo Condôminos.'); return; }
      if(!confirm('Confirmar remoção deste usuário do módulo Condôminos?')) return;
      var endpoint = BASE + '/api/cond-usuarios/' + encodeURIComponent(condId);

      function performDelete(url){
        return fetch(url, { method:'DELETE', credentials:'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept':'application/json' } })
          .then(function(r){
            if(!r.ok){
              var err = new Error('HTTP '+r.status);
              err.status = r.status;
              return r.text().then(function(text){ if(text) err.message = text; throw err; });
            }
            return r.json();
          })
          .then(function(resp){ if(resp && resp.success===false){ throw new Error(resp.error||'Falha ao excluir'); } return loadFromBackend(); })
          .then(function(){ renderAll(); });
      }

      performDelete(endpoint)
        .catch(function(err){ console.error('[users_mod_condominio] excluir usuário Condômino erro:', err); alert('Não foi possível remover o usuário do módulo Condôminos: '+(err && err.message || 'erro')); });
    });
  }
})();
