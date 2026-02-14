'use strict';
(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  const emailInput = byId('pEmail');
  const btnVerificar = byId('btnVerificarEmail');
  const emailMsg = byId('pEmailMsg');
  const nome = byId('pNome');
  const rg = byId('pRg');
  const cpf = byId('pCpf');
  const dn = byId('pDataNasc');
  const idade = byId('pIdade');
  const pai = byId('pPai');
  const mae = byId('pMae');
  const sexo = byId('pSexo');
  const telefone = byId('pTelefone');
  const whatsapp = byId('pWhatsapp');
  const unid = byId('vUnidade');
  const unidadeLogoImg = byId('pUnidadeLogo');
  const unidadeResumo = byId('vUnidadeResumo');
  const hab = byId('vHabitacao');
  const morador = byId('vMorador');
  const btnInserir = byId('btnInserirVinculo');
  const btnLimparVinc = byId('btnLimparVinculos');
  const vTabela = byId('vTabela');
  const btnLimparForm = byId('btnLimparForm');
  const btnCadastrar = byId('btnCadastrarProp');
  const btnCancelarEdicao = byId('btnCancelarEdicaoProp');
  const propLista = byId('propLista');
  // Paginação
  const pPaginas = byId('pPaginas');
  const pPageSizeSel = byId('pPageSize');
  let PROP_PAGE_SIZE = 50; let propPage = 0;
  // Ordenação dinâmica
  let propSortKey = 'email';
  let propSortDir = 'asc';
  let editMode = false;
  let editingEmail = '';

  // Picker Habitação (mesmo formato do campo Vincular da Garagem)
  const pHabPickerRoot = document.querySelector('[data-p-hab-picker]');
  const pHabPickerBox = pHabPickerRoot ? pHabPickerRoot.querySelector('[data-p-hab-picker-box]') : null;
  const pHabPickerInput = pHabPickerRoot ? pHabPickerRoot.querySelector('[data-p-hab-picker-input]') : null;
  const pHabPickerTokens = pHabPickerRoot ? pHabPickerRoot.querySelector('[data-p-hab-picker-tokens]') : null;
  const pHabPickerMenu = pHabPickerRoot ? pHabPickerRoot.querySelector('[data-p-hab-picker-menu]') : null;
  const pHabPickerPlaceholder = pHabPickerRoot ? pHabPickerRoot.querySelector('[data-p-hab-picker-placeholder]') : null;

  function escapeHtml(str){
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function cssEscapeValue(v){
    var s = String(v || '');
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
  function escapeAttr(v){
    return escapeHtml(String(v || '')).replace(/"/g,'&quot;');
  }

  function getSelectedUnidadeLabel(){
    try{
      var txt = unidadeResumo ? String(unidadeResumo.textContent || '').trim() : '';
      if(txt && txt !== 'Selecione um condomínio') return txt;
    }catch(_){ }
    try{
      return (unid && unid.options && unid.selectedIndex >= 0) ? String(unid.options[unid.selectedIndex].text || '').trim() : '';
    }catch(_2){ }
    return '';
  }

  function pHabOpenMenu(){ if(pHabPickerMenu) pHabPickerMenu.hidden = false; }
  function pHabCloseMenu(){ if(pHabPickerMenu) pHabPickerMenu.hidden = true; }

  function pHabUpdateDisabledState(){
    if(!pHabPickerRoot || !hab) return;
    var dis = !!hab.disabled;
    pHabPickerRoot.classList.toggle('is-disabled', dis);
    if(pHabPickerInput) pHabPickerInput.disabled = dis;
    if(pHabPickerBox) pHabPickerBox.setAttribute('aria-disabled', dis ? 'true' : 'false');
    if(dis) pHabCloseMenu();
  }

  function pHabRenderToken(label){
    if(!pHabPickerTokens) return;
    if(!label){ pHabPickerTokens.innerHTML=''; return; }
    pHabPickerTokens.innerHTML = '<span class="wdg-enq-token">'
      + escapeHtml(label)
      + ' <button type="button" data-p-hab-clear aria-label="Remover">×</button>'
      + '</span>';
  }

  function pHabGetSelectedLabel(){
    if(!hab) return '';
    var val = String(hab.value || '');
    if(!val) return '';
    var opt = hab.querySelector('option[value="' + cssEscapeValue(val) + '"]');
    return opt ? String(opt.textContent || '').trim() : '';
  }

  function pHabBuildItemsFromSelect(){
    var items = [];
    if(!hab) return items;
    (hab.querySelectorAll('option') || []).forEach(function(opt){
      var val = String(opt.value || '').trim();
      if(!val) return;
      var label = String(opt.textContent || '').trim();
      items.push({ value: val, label: label });
    });
    return items;
  }

  function pHabRenderMenu(items, filter){
    if(!pHabPickerMenu) return;
    var q = String(filter || '').trim().toLowerCase();
    var selectedVal = hab ? String(hab.value || '') : '';
    var list = (items || []).filter(function(it){
      if(!it || !it.value) return false;
      if(selectedVal && String(it.value) === selectedVal) return false;
      if(!q) return true;
      return String(it.label || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    if(list.length === 0){
      pHabPickerMenu.innerHTML = '<div class="px-2 py-2 text-muted small">Nenhum resultado.</div>';
      return;
    }
    var unidadeLine = getSelectedUnidadeLabel() || 'Condomínio';
    var avatarSrc = (basePath || '') + '/images/home.png';
    pHabPickerMenu.innerHTML = list.map(function(it){
      return ''
        + '<button type="button" class="wdg-enq-picker-item" data-p-hab-item data-val="' + escapeAttr(it.value) + '">' 
        +   '<span class="wdg-pick-avatar">'
        +     '<img src="' + escapeAttr(avatarSrc) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' + escapeAttr(avatarSrc) + '\';">'
        +   '</span>'
        +   '<span class="wdg-pick-lines">'
        +     '<span class="wdg-pick-name">' + escapeHtml(unidadeLine) + '</span>'
        +     '<span class="wdg-pick-hab">' + escapeHtml(it.label || it.value) + '</span>'
        +   '</span>'
        + '</button>';
    }).join('');
  }

  var pHabItemsCache = [];
  function refreshPHabPickerFromSelect(){
    if(!pHabPickerRoot || !hab) return;
    pHabItemsCache = pHabBuildItemsFromSelect();
    var label = pHabGetSelectedLabel();
    pHabRenderToken(label);
    if(pHabPickerPlaceholder) pHabPickerPlaceholder.hidden = true;
    if(pHabPickerInput) pHabPickerInput.value = '';
    pHabRenderMenu(pHabItemsCache, '');
    pHabUpdateDisabledState();
    pHabCloseMenu();
  }

  // Picker do vínculo (single-select)
  if(pHabPickerBox){
    pHabPickerBox.addEventListener('click', function(){
      if(hab && hab.disabled) return;
      if(pHabPickerInput) pHabPickerInput.focus();
      pHabOpenMenu();
    });
    pHabPickerBox.addEventListener('keydown', function(e){
      if(!e) return;
      if(hab && hab.disabled) return;
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pHabOpenMenu(); if(pHabPickerInput) pHabPickerInput.focus(); }
      if(e.key==='Escape'){ pHabCloseMenu(); }
    });
  }
  if(pHabPickerInput){
    pHabPickerInput.addEventListener('input', function(){
      pHabRenderMenu(pHabItemsCache, pHabPickerInput.value);
      pHabOpenMenu();
    });
    pHabPickerInput.addEventListener('focus', function(){
      if(hab && hab.disabled) return;
      pHabRenderMenu(pHabItemsCache, pHabPickerInput.value);
      pHabOpenMenu();
    });
    pHabPickerInput.addEventListener('keydown', function(e){
      if(!e) return;
      if(e.key==='Escape'){ pHabCloseMenu(); return; }
    });
  }
  if(pHabPickerRoot){
    pHabPickerRoot.addEventListener('click', function(e){
      if(hab && hab.disabled) return;
      var btn = e && e.target ? e.target.closest('[data-p-hab-item]') : null;
      if(btn && hab){
        var v = String(btn.getAttribute('data-val') || '');
        hab.value = v;
        refreshPHabPickerFromSelect();
        return;
      }
      var clearBtn = e && e.target ? e.target.closest('[data-p-hab-clear]') : null;
      if(clearBtn && hab){
        hab.value = '';
        refreshPHabPickerFromSelect();
        return;
      }
    });
  }
  document.addEventListener('click', function(e){
    if(!pHabPickerRoot || !pHabPickerMenu) return;
    var t = e && e.target ? e.target : null;
    if(!t) return;
    if(pHabPickerRoot.contains(t)) return;
    pHabCloseMenu();
  });

  function setEditModeUI(on){
    if(!btnCadastrar) return;
    if(on){
      btnCadastrar.textContent = 'Alterar';
      btnCancelarEdicao && btnCancelarEdicao.classList.remove('d-none');
    } else {
      btnCadastrar.textContent = 'Cadastrar';
      btnCancelarEdicao && btnCancelarEdicao.classList.add('d-none');
    }
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

  function getUnidadeLogoCandidates(uid){
    uid = String(uid || '').trim();
    var base = basePath || '';
    var raw = [];
    if(uid){
      raw.push('/gestor/api/unidades/' + encodeURIComponent(uid) + '/logo');
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

  function refreshUnitLogo(){
    if(!unidadeLogoImg) return;
    var uid = String((unid && unid.value) || '').trim();
    setImgWithFallback(unidadeLogoImg, getUnidadeLogoCandidates(uid));
  }

  // dados iniciais vindos do servidor
  const existingUsers = safeJSON('existingUsersData', []);
  // Dados locais de habitações/blocos/andares mantidos pela página Cadastrar Habitação
  // Preferimos o localStorage oficial do módulo: wdgHabMain (habitações), wdgHabBloc (blocos), wdgHabAndar (andares)
  let habs = safeJSON('habitacoesLivresData', []); // pode vir vazio do servidor; usamos como fallback
  let blocos = []; let andares = [];
  try { const ls = JSON.parse(localStorage.getItem('wdgHabMain')||'[]'); if(Array.isArray(ls) && ls.length) habs = ls; } catch(_){ /* ignore */ }
  try { blocos = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]') || []; } catch(_){ blocos = []; }
  try { andares = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]') || []; } catch(_){ andares = []; }
  const unidades = safeJSON('unidadesData', []);

  function safeJSON(scriptId, fallback){
    try{ const el = byId(scriptId); return el ? JSON.parse(el.textContent||'[]') : fallback; }catch{ return fallback; }
  }

  function setBlocked(block){
    const targets = [nome, rg, cpf, dn, pai, mae, sexo, telefone, whatsapp, hab, morador, btnInserir, btnLimparVinc, btnCadastrar];
    targets.forEach(el=>{ if(!el) return; el.disabled = !!block; el.classList.toggle('blocked', !!block && el.tagName!=='BUTTON'); });
    pHabUpdateDisabledState();
  }

  // Helper para identificar se vínculo é de propriedade.
  // Se v.proprietario === true => proprietário.
  // Se v.proprietario === false => não proprietário.
  // Se ausente (dados legados) => proprietário quando v.morador === false.
  function isOwnerVinculo(v){
    if(!v) return false;
    if(v.proprietario === true) return true;
    if(v.proprietario === false) return false;
    return v.morador === false;
  }

  function fillSelect(select, data, mapper){
    if(!select) return; select.innerHTML = '';
    const optEmpty = document.createElement('option'); optEmpty.value=''; optEmpty.textContent='Selecione...'; select.appendChild(optEmpty);
    (data||[]).forEach(item => {
      const {value,label} = (mapper?mapper(item):{value:item._id,label:item.nome});
      const opt = document.createElement('option'); opt.value = value; opt.textContent = label; select.appendChild(opt);
    });
  }

  function updateUnidadeResumo(){
    if(!unidadeResumo) return;
    if(!unid || !unid.value){ unidadeResumo.textContent = 'Selecione um condomínio'; return; }
    const selected = unid.options[unid.selectedIndex]?.text || '';
    unidadeResumo.textContent = selected || 'Selecione um condomínio';
  }

  function populateUnidades(){
    fillSelect(unid, unidades, u=>({ value: u._id, label: u.codigo? (u.codigo+' - '+u.nome): u.nome }));
    if(unid){
      const selectable = Array.from(unid.options).filter(opt => opt.value);
      if(selectable.length === 1){ selectable[0].selected = true; }
    }
    updateUnidadeResumo();
    refreshUnitLogo();
  }
  async function populateSexo(){
    try{
      const res = await fetch(basePath + '/data/sexo.json');
      const data = await res.json();
      fillSelect(sexo, data, s=>({ value: s.codigo, label: s.descricao }));
    }catch(_e){ fillSelect(sexo, [{codigo:'',descricao:'Selecione...'}], s=>({value:s.codigo,label:s.descricao})); }
  }
  function labelById(arr,id){ const x = (arr||[]).find(o=> String(o.id)===String(id)); return x? x.nome : ''; }
  function getOccupiedHabIdsExcluding(email){
    // Lê usuários locais com permissão Prop e coleta habitacao_id ocupadas por outros proprietários
    let set = new Set();
    try{
      const all = JSON.parse(localStorage.getItem('wdgCondoUsersLocal')||'[]');
      const me = String(email||'').trim().toLowerCase();
      (all||[]).forEach(u=>{
        const isProp = Array.isArray(u.permissoes) ? u.permissoes.includes('Prop') : false;
        if(!isProp) return;
        const ue = String(u.email||'').toLowerCase();
        if(ue === me) return; // não considerar as do usuário em edição
  (u.vinculos||[]).filter(isOwnerVinculo).forEach(v=>{ if(v && v.habitacao_id!=null){ set.add(String(v.habitacao_id)); } });
      });
    }catch(_e){}
    return set;
  }
  function currentVinculoHabIds(){
    const s = new Set();
    try{ $$('#vTabela tr').forEach(tr=>{ const id = tr.getAttribute('data-habitacao-id') || tr.dataset.habitacaoId; if(id!=null) s.add(String(id)); }); }catch(_e){}
    return s;
  }
  async function fetchHabitacoesByUnidade(unidadeId){
    if(!unidadeId) return [];
    try{
      const url = `${basePath}/api/habitacoes/busca?unidade=${encodeURIComponent(unidadeId)}`;
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return Array.isArray(data)? data : [];
    }catch(e){ console.warn('[habitacoes] falha ao carregar do servidor', e); return []; }
  }
  async function populateHabitacoesFiltro(unidadeId){
    if(!hab) return;
    if(!unidadeId){
      fillSelect(hab, []);
      hab.disabled = true;
      refreshPHabPickerFromSelect();
      return;
    }
    // Carrega do banco as habitações da unidade
    const listaSrv = await fetchHabitacoesByUnidade(unidadeId);
    // Nesta tela, o rótulo é "Habitação (livre)": filtrar por habitações sem proprietario
    const jaVinculadasAqui = currentVinculoHabIds();
    const livres = (listaSrv||[]).filter(h => !h.proprietario)
      .filter(h => !jaVinculadasAqui.has(String(h._id||'')));
    fillSelect(hab, livres, h=>{
      const blocoNome = (h.bloco && h.bloco.nome) || labelById(blocos, h.blocoId) || h.bloco_nome || '';
      const andarNome = (h.andar && h.andar.nome) || labelById(andares, h.andarId) || h.andar_nome || '';
      const numero = h.numero || h.identificador || '—';
      const parts = [blocoNome, andarNome, numero].filter(Boolean);
      return { value: (h._id||h.id), label: parts.join(' - ') };
    });
    // Mantém consistência com o fluxo: se o vínculo ainda estiver bloqueado, o picker deve ficar desabilitado
    hab.disabled = !!(btnInserir && btnInserir.disabled);
    refreshPHabPickerFromSelect();
  }

  function calcIdadeFromBR(dstr){
    const m = dstr && dstr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return '';
    const d = new Date(+m[3], +m[2]-1, +m[1]); if(isNaN(d)) return '';
    const today = new Date(); let age = today.getFullYear()-d.getFullYear();
    const mDiff = today.getMonth()-d.getMonth();
    if(mDiff<0 || (mDiff===0 && today.getDate()<d.getDate())) age--;
    return age>=0 ? String(age) : '';
  }

  function formatCPF(v){
    if(!v) return ''; const d = String(v).replace(/\D/g,'').slice(0,11);
    if(d.length<=3) return d; if(d.length<=6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if(d.length<=9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }

  function isoToBr(s){
    if(!s) return '';
    try{
      const str = String(s);
      const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(m) return `${m[3]}/${m[2]}/${m[1]}`;
      return str;
    }catch{ return ''; }
  }
  function isValidCPF(v){
    const s = String(v).replace(/\D/g,''); if(s.length!==11) return false; if(/^(\d)\1{10}$/.test(s)) return false;
    let sum=0; for(let i=0;i<9;i++) sum+=parseInt(s[i])*(10-i); let rest=sum%11; let d1= rest<2?0:11-rest;
    sum=0; for(let i=0;i<10;i++) sum+=parseInt(s[i])*(11-i); rest=sum%11; let d2= rest<2?0:11-rest;
    return (+s[9]===d1 && +s[10]===d2);
  }

  // email → existingUsers lookup (lista vem de users_mod_condominio)
  function findUserByEmail(email){
    const e = String(email||'').trim().toLowerCase();
    return existingUsers.find(u => String(u.email||'').toLowerCase()===e) || null;
  }

  function hydrateFromGestorShadow(u){
    // Bloqueia campos pessoais para usuário do Gestor; telefone/whatsapp continuam livres
    if(!u) return false;
    const match = existingUsers.find(x=> String(x.email||'').toLowerCase()===String(u.email||'').toLowerCase());
    const isGestor = !!(match && match.isFuncionario);
    if(!isGestor) return false;
    if(u.nome) nome.value = u.nome;
    if(u.rg) rg.value = u.rg;
    if(u.cpf) cpf.value = formatCPF(u.cpf);
    if(u.data_nascimento) dn.value = u.data_nascimento_br || u.data_nascimento;
    if(u.pai) pai.value = u.pai;
    if(u.mae) mae.value = u.mae;
    if(sexo && u.sexo) sexo.value = u.sexo;
    if(telefone && u.telefone) telefone.value = u.telefone;
    if(whatsapp) whatsapp.checked = !!u.whatsapp;
    [nome, rg, cpf, dn, pai, mae, sexo].forEach(el=>{ if(!el) return; el.disabled = true; el.classList.add('blocked'); });
    if(telefone) telefone.disabled=false; if(whatsapp) whatsapp.disabled=false;
    return true;
  }

  function enableAll(){ setBlocked(false); }
  function disableAll(){ setBlocked(true); }

  function clearForm(options){
    const { preserveEmail = true } = options || {};
    $$('#formProprietario input, #formProprietario select').forEach(el=>{
      if(el.id==='pEmail' && preserveEmail) return;
      if(el.type==='button') return;
      el.value='';
      if(el === idade) el.value='';
    });
    if(whatsapp) whatsapp.checked=false;
    vTabela.innerHTML='';
    cpf.classList.remove('is-invalid');
    emailMsg.classList.add('d-none');
    disableAll();
    btnCadastrar.disabled = true;
    if(!preserveEmail) emailInput.value='';
    editMode = false;
    editingEmail = '';
    setEditModeUI(false);
    updateUnidadeResumo();
    populateHabitacoesFiltro(unid ? unid.value : '');
  }

  emailInput.addEventListener('input', ()=>{ emailMsg.classList.add('d-none'); });
  cpf.addEventListener('input', ()=>{ cpf.value = formatCPF(cpf.value); });
  function updateIdade(){ idade.value = calcIdadeFromBR(dn.value)||''; }
  dn.addEventListener('input', updateIdade);
  dn.addEventListener('change', updateIdade);
  telefone && telefone.addEventListener('input', ()=>{
    // Máscara: (DD) D NNNN-NNNN (celular) ou (DD) NNNN-NNNN (fixo)
    const d = telefone.value.replace(/\D/g,'').slice(0,11);
    if(!d){ telefone.value=''; return; }
    const ddd = d.slice(0,2);
    const nums = d.slice(2);
    if(nums.length <= 1){ telefone.value = `(${ddd}) ${nums}`; return; }
    if(nums.length <= 4){ telefone.value = `(${ddd}) ${nums}`; return; }
    if(nums.length === 8){ telefone.value = `(${ddd}) ${nums.slice(0,4)}-${nums.slice(4)}`; return; }
    if(nums.length < 9){ const first=nums.slice(0,1); const rest=nums.slice(1); if(rest.length<=4){ telefone.value=`(${ddd}) ${first} ${rest}`; } else { telefone.value=`(${ddd}) ${first} ${rest.slice(0,4)}-${rest.slice(4)}`; } return; }
    const first=nums.slice(0,1); const rest=nums.slice(1); telefone.value = `(${ddd}) ${first} ${rest.slice(0,4)}-${rest.slice(4)}`;
  });

  populateUnidades();
  populateHabitacoesFiltro(unid ? unid.value : '');
  refreshPHabPickerFromSelect();
  populateSexo();
  unid && unid.addEventListener('change', ()=> {
    updateUnidadeResumo();
    populateHabitacoesFiltro(unid.value);
    refreshUnitLogo();
    refreshPHabPickerFromSelect();
  });

  btnVerificar.addEventListener('click', ()=>{
    if(!unid || !unid.value){ alert('Selecione um condomínio antes de verificar o e-mail.'); return; }
    const email = (emailInput.value||'').trim();
    if(!email){ emailMsg.textContent='Informe um e-mail.'; emailMsg.classList.remove('d-none'); return; }
    emailMsg.classList.add('d-none');

  const u = findUserByEmail(email);
    if(!u){
      // Novo usuário: liberar campos para cadastro
      enableAll();
      [nome, rg, cpf, dn, pai, mae, sexo, telefone, whatsapp].forEach(el=>{ if(!el) return; el.disabled=false; el.classList.remove('blocked'); });
      btnCadastrar.disabled = false;
      editMode = false;
      editingEmail = '';
      setEditModeUI(false);
      return;
    }
    // Usuário existente: preencher e liberar edição dos campos conhecidos
    // Campos provenientes do Gestor ficam bloqueados
    nome.value = u.nome||'';
    rg.value = u.rg||'';
    cpf.value = formatCPF(u.cpf||'');
    dn.value = u.data_nascimento_br || u.data_nascimento || '';
    idade.value = calcIdadeFromBR(dn.value)||'';
  pai.value = u.pai || '';
  mae.value = u.mae || '';
  if(sexo) sexo.value = u.sexo || '';
  if(telefone) telefone.value = u.telefone || '';
  if(whatsapp) whatsapp.checked = !!u.whatsapp;

    enableAll();
    const lockedByGestor = hydrateFromGestorShadow(u);
    emailInput.dataset.fromGestor = lockedByGestor ? '1' : '';
    btnCadastrar.disabled = false;
    editMode = false;
    editingEmail = '';
    setEditModeUI(false);
  });

  btnInserir.addEventListener('click', ()=>{
    const uid = unid.value, uidText = unid.options[unid.selectedIndex]?.text || '';
    const hid = hab.value, hidText = hab.options[hab.selectedIndex]?.text || '';
    const mora = morador.value || 'N';
    if(!uid || !hid){ return alert('Selecione condomínio e habitação.'); }
    // Apenas uma linha pode ter Morador = S
    if(mora==='S' && vTabela.querySelector('tr[data-mora="S"]')){
      return alert('Apenas uma habitação pode estar marcada como "Morador = Sim".');
    }
  const tr = document.createElement('tr');
  tr.dataset.unidadeId = uid; tr.dataset.habitacaoId = hid; tr.dataset.mora = mora; tr.dataset.proprietario = 'S';
    tr.innerHTML = `
      <td>${uidText}</td>
      <td>${hidText}</td>
      <td>${mora==='S' ? '<span class="badge bg-success">Sim</span>' : '<span class="badge badge-morador-nao">Não</span>'}</td>
      <td>
  <button type="button" class="wdg-icon-btn" data-action="rem" aria-label="Remover vínculo" title="Remover vínculo"><img src="${basePath}/images/excluir.png" alt="Remover"/></button>
      </td>`;
    vTabela.appendChild(tr);
    hab.value=''; morador.value='N';
    refreshPHabPickerFromSelect();
    // remover da lista de livres (e prevenir duplicidade)
    populateHabitacoesFiltro(unid ? unid.value : '');
  });
  vTabela.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-action="rem"]'); if(!btn) return;
    btn.closest('tr')?.remove();
    populateHabitacoesFiltro(unid ? unid.value : '');
  });
  btnLimparVinc.addEventListener('click', ()=>{ vTabela.innerHTML=''; populateHabitacoesFiltro(unid ? unid.value : ''); refreshPHabPickerFromSelect(); });

  btnLimparForm.addEventListener('click', ()=> clearForm({ preserveEmail:true }));
  btnCancelarEdicao && btnCancelarEdicao.addEventListener('click', ()=>{
    clearForm({ preserveEmail:false });
  });

  btnCadastrar.addEventListener('click', async ()=>{
    // Validações simples
    const emailNorm = (emailInput.value||'').trim().toLowerCase(); if(!emailNorm) return alert('Informe o e-mail.');
    const cpfDigits = (cpf.value||'').replace(/\D/g,''); if(cpfDigits && !isValidCPF(cpfDigits)) { cpf.classList.add('is-invalid'); return; } else { cpf.classList.remove('is-invalid'); }
    // Monta payload para backend
    const vinculos = Array.from(vTabela.querySelectorAll('tr')).map(tr => ({
      unidade_id: tr.dataset.unidadeId,
      habitacao_id: tr.dataset.habitacaoId,
      morador: tr.dataset.mora==='S',
      proprietario: true
    }));
    const payload = {
      email: emailNorm,
      nome: nome.value||'', rg: rg.value||'', cpf: cpfDigits||'',
      data_nascimento: dn.value||'', pai: pai.value||'', mae: mae.value||'',
      sexo: sexo?.value||'', telefone: (telefone?.value||'').replace(/\D/g,''), whatsapp: !!(whatsapp&&whatsapp.checked),
      vinculos: vinculos.slice(),
      fromGestor: emailInput.dataset.fromGestor==='1'
    };
    try{
      const res = await fetch(basePath + '/api/proprietarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if(!res.ok){ const txt = await res.text(); throw new Error('Falha ao salvar: '+txt); }
      const out = await res.json();
      alert('Proprietário cadastrado no banco de dados.');
      // Recarrega a listagem do servidor
      try { await renderPropPage(0); } catch(_){}
      clearForm({ preserveEmail:false });
      editMode = false;
      editingEmail = '';
      setEditModeUI(false);
    }catch(e){
      console.error('[cadastro proprietario] erro', e);
      alert('Não foi possível salvar no servidor. Tente novamente.');
    }
  });

  function upsertProprietarioRow(u){
    const tbody = propLista; if(!tbody) return;
    const tr = tbody.querySelector(`tr[data-email="${CSS.escape(String(u.email).toLowerCase())}"]`) || document.createElement('tr');
    tr.dataset.email = String(u.email).toLowerCase();
    if(u && u._id) tr.setAttribute('data-prop-id', String(u._id));
    const condominios = montarListaCondominios(u.vinculos||[]);
    const habs = montarListaHabsDetalhada(u.vinculos||[]);
    tr.innerHTML = `
      <td>${u.email||''}</td>
      <td>${u.nome||''}</td>
      <td>${condominios||'-'}</td>
      <td>${habs||'-'}</td>
      <td class="text-nowrap">
  <button type="button" class="wdg-icon-btn" data-action="detalhes" aria-label="Detalhes" title="Detalhes"><img src="${basePath}/images/detalhe.png" alt="Detalhes"/></button>
  <button type="button" class="wdg-icon-btn" data-action="edit" aria-label="Editar" title="Editar"><img src="${basePath}/images/editar.png" alt="Editar"/></button>
  <button type="button" class="wdg-icon-btn" data-action="del-prop" aria-label="Excluir" title="Excluir"><img src="${basePath}/images/excluir.png" alt="Excluir"/></button>
      </td>`;
    if(!tr.parentNode) tbody.appendChild(tr);
  }

  function shortUnidade(id){
    const u = unidades.find(x=>String(x._id)===String(id)); if(!u) return id||'-';
    return u.codigo ? (u.codigo+' - '+u.nome) : u.nome;
  }
  function shortHabitacao(id){
    const h = (habs||[]).find(x=> String(x.id)===String(id));
    if(!h) return id||'-';
    const bloco = labelById(blocos, h.blocoId);
    const andar = labelById(andares, h.andarId);
    return [bloco||'Bloco/Torre', andar||'Andar', (h.numero||'—')].filter(Boolean).join(' - ');
  }

  function montarListaCondominios(vinculos){
    const owners = (vinculos||[]).filter(isOwnerVinculo);
    const labels = [];
    owners.forEach(v => {
      const label = shortUnidade(v.unidade_id);
      if(label && !labels.includes(label)) labels.push(label);
    });
    return labels.length ? labels.join('<br>') : '-';
  }

  function montarListaHabsDetalhada(vinculos){
    // Preferir rótulo fornecido pelo servidor; fallback para storages locais
    let allHab=[]; try{ allHab = JSON.parse(localStorage.getItem('wdgHabMain')||'[]'); }catch{ allHab=[]; }
    let allBlocos=[]; try{ allBlocos = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]'); }catch{ allBlocos=[]; }
    let allAndares=[]; try{ allAndares = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]'); }catch{ allAndares=[]; }
    return (vinculos||[]).filter(isOwnerVinculo).map(v => {
      const unidadeRotulo = shortUnidade(v.unidade_id);
      if(v && v.hab_label){
        const papel = v.morador ? 'proprietário, morador' : 'proprietário';
        return `${unidadeRotulo} - ${v.hab_label} (${papel})`;
      }
      const h = allHab.find(x=> String((x._id??x.id))===String(v.habitacao_id));
      if(!h) return `${unidadeRotulo} - Habitação desconhecida (${v.morador? 'proprietário, morador':'proprietário'})`;
      const bloco = (allBlocos.find(b=> String(b.id)===String(h.blocoId))||{}).nome || (h.bloco_nome||'');
      const andar = (allAndares.find(a=> String(a.id)===String(h.andarId))||{}).nome || (h.andar_nome||'');
      const numero = h.numero || '';
      const papel = v.morador ? 'proprietário, morador' : 'proprietário';
      return `${unidadeRotulo} - ${h.tipo||'Hab.'}${bloco? ' - '+bloco:''}${andar? ' - '+andar:''} - ${numero} (${papel})`;
    }).join('<br>');
  }

  function buildPropDeleteLabelFromRow(tr){
    if(!tr) return '—';
    var email = String(tr.getAttribute('data-email') || '').trim();
    var nome = '';
    try{
      var tds = tr.querySelectorAll('td');
      if(tds && tds[1]) nome = String(tds[1].textContent || '').trim();
    }catch(_){ /* ignore */ }
    var label = (nome || email || '—').trim();
    if(nome && email) label = nome + ' (' + email + ')';
    return label || '—';
  }

  function askPropDeleteConfirm(pLabel){
    var modalEl = byId('propDeleteConfirmModal');
    var nameEl = byId('propDeleteConfirmName');
    var yesBtn = byId('propDeleteConfirmYes');

    // fallback (caso Bootstrap/modal não esteja disponível)
    if(!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)){
      var suffix = (pLabel && pLabel !== '—') ? ('\n\nProprietário: ' + pLabel) : '';
      return Promise.resolve(window.confirm('Confirma remover este proprietário? As habitações vinculadas ficarão sem proprietário.' + suffix + '\n\nEsta exclusão é definitiva e não pode ser desfeita.'));
    }

    if(nameEl) nameEl.textContent = pLabel || '—';

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

  // Delegação ações tabela
  propLista.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-action]'); if(!btn) return;
    const tr = btn.closest('tr'); if(!tr) return;
    const email = tr.dataset.email;
    if(btn.dataset.action==='detalhes'){
      window.abreDetalhesProprietario(email);
    } else if(btn.dataset.action==='edit'){
      editarProprietario(email);
    } else if(btn.dataset.action==='del-prop' || btn.dataset.action==='del'){
      const pid = tr.getAttribute('data-prop-id');
      if(!pid) return alert('ID de proprietário não encontrado.');
      const labelDel = buildPropDeleteLabelFromRow(tr);
      const okDel = await askPropDeleteConfirm(labelDel);
      if(!okDel) return;
      try{
        const r = await fetch(basePath + '/api/proprietarios/' + encodeURIComponent(pid) + '?hard=1', { method:'DELETE', credentials:'same-origin' });
        if(!r.ok){
          let msg='';
          try{ msg = await r.text(); }catch(_){ msg=''; }
          throw new Error(msg || ('HTTP ' + r.status));
        }
        await renderPropPage(0);
      }catch(err){
        console.error('[del proprietario] erro', err);
        alert('Falha ao remover.');
      }
    }
  });

  async function editarProprietario(email){
    try{
      const tr = propLista && propLista.querySelector(`tr[data-email="${CSS.escape(String(email).toLowerCase())}"]`);
      const id = tr ? (tr.getAttribute('data-prop-id')||'') : '';
      let lista = await getProprietarios();
      if(!Array.isArray(lista)) lista=[];
      const u = (id? lista.find(x=> String(x._id)===String(id)) : null) || lista.find(x=> String(x.email||'').toLowerCase()===String(email).toLowerCase());
      if(!u){ alert('Registro não encontrado no servidor.'); return; }
      // Prefill dos campos
      emailInput.value = u.email||'';
      nome.value = u.nome||'';
      rg.value = u.rg||'';
      cpf.value = formatCPF(u.cpf||'');
      dn.value = isoToBr(u.data_nascimento)||'';
      idade.value = calcIdadeFromBR(dn.value)||'';
      pai.value = u.pai||'';
      mae.value = u.mae||'';
      if(sexo) sexo.value = u.sexo||'';
      if(telefone) telefone.value = u.telefone? formatPhoneBR(u.telefone):'';
      if(whatsapp) whatsapp.checked = !!u.whatsapp;
      enableAll();
      btnCadastrar.disabled=false;
      // Recria vínculos na tabela
      vTabela.innerHTML='';
      (u.vinculos||[]).filter(isOwnerVinculo).forEach(v => {
        const uidText = shortUnidade(v.unidade_id);
        const hidText = v.hab_label || shortHabitacao(v.habitacao_id);
        const trEl = document.createElement('tr'); trEl.dataset.unidadeId=v.unidade_id; trEl.dataset.habitacaoId=v.habitacao_id; trEl.dataset.mora=v.morador?'S':'N'; trEl.dataset.proprietario='S';
        trEl.innerHTML = `<td>${uidText}</td><td>${hidText}</td><td>${v.morador? '<span class="badge bg-success">Sim</span>' : '<span class="badge badge-morador-nao">Não</span>'}</td><td><button type='button' class='wdg-icon-btn' data-action='rem' aria-label='Remover vínculo' title='Remover vínculo'><img src='${basePath}/images/excluir.png' alt='Remover'/></button></td>`;
        vTabela.appendChild(trEl);
      });
      editMode = true;
      editingEmail = String(u.email||'').toLowerCase();
      setEditModeUI(true);
    }catch(err){ console.warn('[editarProprietario] erro', err); alert('Falha ao carregar dados do servidor.'); }
  }

  function formatPhoneBR(d){
    const s = String(d||'').replace(/\D/g,'').slice(0,11);
    if(s.length<=2) return s;
    const ddd=s.slice(0,2), rest=s.slice(2);
    if(rest.length<=4) return `(${ddd}) ${rest}`;
    if(rest.length===8) return `(${ddd}) ${rest.slice(0,4)}-${rest.slice(4)}`; // fixo
    if(rest.length>=1){ const first=rest.slice(0,1); const tail=rest.slice(1); if(tail.length<=4) return `(${ddd}) ${first} ${tail}`; return `(${ddd}) ${first} ${tail.slice(0,4)}-${tail.slice(4)}`; }
    return `(${ddd})`;
  }

  // Removido legado de exclusão local: exclusão agora sempre via API

  // === Listagem com paginação ===
  async function getProprietarios(){
    try{
      const res = await fetch(basePath + '/api/proprietarios/busca', { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      // Normaliza para o formato esperado pela renderização (vinculos com unidade_id/habitacao_id)
      return Array.isArray(data)? data : [];
    }catch(e){ console.warn('[proprietarios] falha ao carregar lista do servidor', e); return []; }
  }
  function buildPropRow(u){
    const condominios = montarListaCondominios(u.vinculos||[]);
    const habs = montarListaHabsDetalhada(u.vinculos||[]);
    return `
      <tr data-email="${String(u.email||'').toLowerCase()}" data-prop-id="${u._id||''}">
        <td>${u.email||''}</td>
        <td>${u.nome||''}</td>
        <td>${condominios||'-'}</td>
        <td>${habs||'-'}</td>
        <td class="text-nowrap">
          <button type="button" class="wdg-icon-btn" data-action="detalhes" aria-label="Detalhes" title="Detalhes"><img src="${basePath}/images/detalhe.png" alt="Detalhes"/></button>
          <button type="button" class="wdg-icon-btn" data-action="edit" aria-label="Editar" title="Editar"><img src="${basePath}/images/editar.png" alt="Editar"/></button>
          <button type="button" class="wdg-icon-btn" data-action="del-prop" aria-label="Excluir" title="Excluir"><img src="${basePath}/images/excluir.png" alt="Excluir"/></button>
        </td>
      </tr>`;
  }
  function sortTextHabs(vinculos){
    let allHab=[]; try{ allHab = JSON.parse(localStorage.getItem('wdgHabMain')||'[]'); }catch{ allHab=[]; }
    let allBlocos=[]; try{ allBlocos = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]'); }catch{ allBlocos=[]; }
    let allAndares=[]; try{ allAndares = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]'); }catch{ allAndares=[]; }
    return (vinculos||[]).filter(isOwnerVinculo).map(v => {
      const h = allHab.find(x=> String(x.id)===String(v.habitacao_id));
      if(!h) return `${shortUnidade(v.unidade_id)} desconhecida`;
      const unidadeRotulo = shortUnidade(h.unidadeId);
      const bloco = (allBlocos.find(b=> String(b.id)===String(h.blocoId))||{}).nome || '';
      const andar = (allAndares.find(a=> String(a.id)===String(h.andarId))||{}).nome || '';
      const numero = h.numero || '';
      return `${unidadeRotulo} ${bloco} ${andar} ${numero}`;
    }).join(' | ');
  }
  async function renderPropPage(page){ if(!propLista) return; let pageSize=PROP_PAGE_SIZE; if(pPageSizeSel){ const v=parseInt(pPageSizeSel.value,10); if(!isNaN(v)&&v>0) pageSize=v; }
    let data = await getProprietarios(); data = Array.isArray(data)? data.slice() : [];
    const key = propSortKey; const dir = propSortDir==='desc' ? -1 : 1;
    function getPropSortValue(u, key){
      if(key==='habitacoes' || key==='habs') return sortTextHabs(u?.vinculos||[]);
      if(key==='condominio') return sortTextCondominios(u?.vinculos||[]);
      return String((u&&u[key])||'');
    }
    data.sort((a,b)=>{
      const av = String(getPropSortValue(a, key)).toLowerCase();
      const bv = String(getPropSortValue(b, key)).toLowerCase();
      if(av<bv) return -1*dir; if(av>bv) return 1*dir; return 0;
    });
    const totalPages = Math.ceil(data.length / pageSize) || 1; if(page<0) page=0; if(page>=totalPages) page=totalPages-1; propPage=page;
    const start = page*pageSize; const slice = data.slice(start, start+pageSize);
    propLista.innerHTML = slice.map(buildPropRow).join('');
    buildPropPagination(totalPages, pageSize, data.length);
    updatePropSortClasses();
  }
  function sortTextCondominios(vinculos){
    const html = montarListaCondominios(vinculos);
    return String(html||'').replace(/<br\s*\/?>(\s)?/gi, ' ').trim();
  }
  function buildPropPagination(totalPages, pageSize, totalItems){
    if(!pPaginas) return;
    pPaginas.innerHTML='';
    function mk(label, go, dis){
      const b=document.createElement('button');
      b.type='button';
      b.textContent=label;
      b.disabled=!!dis;
      if(!dis) b.addEventListener('click', ()=> renderPropPage(go));
      return b;
    }
    if(totalPages<=1){
      const firstOnly = mk('<<', 0, true);
      const prevOnly = mk('<', 0, true);
      const oneOnly = mk('1', 0, true);
      const nextOnly = mk('>', 0, true);
      const lastOnly = mk('>>', 0, true);
      oneOnly.classList.add('active');
      pPaginas.appendChild(firstOnly);
      pPaginas.appendChild(prevOnly);
      pPaginas.appendChild(oneOnly);
      pPaginas.appendChild(nextOnly);
      pPaginas.appendChild(lastOnly);
      const infoOnly=document.createElement('div');
      infoOnly.className='w-100 text-center mt-1';
      infoOnly.style.fontSize='.7rem';
      infoOnly.textContent='Total: '+totalItems+' proprietário(s)';
      pPaginas.appendChild(infoOnly);
      return;
    }
    const win=5; const start=Math.max(0, propPage-Math.floor(win/2)); const end=Math.min(totalPages-1, start+win-1);
    const firstBtn=mk('<<',0,propPage===0); const prevBtn=mk('<',propPage-1,propPage===0); pPaginas.appendChild(firstBtn); pPaginas.appendChild(prevBtn);
    if(start>0){ const b0=mk('1',0,false); if(propPage===0) b0.classList.add('active'); pPaginas.appendChild(b0); const dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; pPaginas.appendChild(dots); }
    for(let p=start; p<=end; p++){ const b=mk(String(p+1), p, false); if(p===propPage) b.classList.add('active'); pPaginas.appendChild(b); }
    if(end<totalPages-1){ const dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; pPaginas.appendChild(dots2); const blast=mk(String(totalPages), totalPages-1, false); if(propPage===totalPages-1) blast.classList.add('active'); pPaginas.appendChild(blast); }
    const nextBtn=mk('>', propPage+1, propPage===totalPages-1); const lastBtn=mk('>>', totalPages-1, propPage===totalPages-1); pPaginas.appendChild(nextBtn); pPaginas.appendChild(lastBtn);
    const info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' proprietário(s)'; pPaginas.appendChild(info);
  }
  pPageSizeSel && pPageSizeSel.addEventListener('change', ()=> renderPropPage(0));
  // Render inicial
  (async function(){ try { await renderPropPage(0); } catch(_e){} })();

  // === Ordenação (clique nos cabeçalhos com data-sort) ===
  function attachPropSorting(){
    const thead = document.querySelector('#tblProprietarios thead'); if(!thead) return;
    thead.addEventListener('click', e=>{
      const th = e.target.closest('th[data-sort]'); if(!th) return;
      const key = th.getAttribute('data-sort'); if(!key) return;
      if(propSortKey === key){ propSortDir = (propSortDir === 'asc' ? 'desc' : 'asc'); }
      else { propSortKey = key; propSortDir = 'asc'; }
      renderPropPage(0);
    });
  }
  function updatePropSortClasses(){
    const ths = document.querySelectorAll('#tblProprietarios thead th[data-sort]');
    ths.forEach(th=>{
      th.classList.remove('asc','desc');
      const key = th.getAttribute('data-sort');
      if(key === propSortKey){ th.classList.add(propSortDir); }
    });
  }
  attachPropSorting();
  updatePropSortClasses();

})();
