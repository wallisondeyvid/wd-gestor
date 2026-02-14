'use strict';
(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  // Campos
  const email = byId('mEmail');
  const btnVerificar = byId('btnVerificarEmailM');
  const emailMsg = byId('mEmailMsg');
  const nome = byId('mNome');
  const rg = byId('mRg');
  const cpf = byId('mCpf');
  const dn = byId('mDataNasc');
  const idade = byId('mIdade');
  const pai = byId('mPai');
  const mae = byId('mMae');
  const sexo = byId('mSexo');
  const telefone = byId('mTelefone');
  const whatsapp = byId('mWhatsapp');

  const rEmail = byId('rEmail');
  const btnVerResp = byId('btnVerificarResp');
  const rEmailMsg = byId('rEmailMsg');
  const rNome = byId('rNome');
  const boxResp = byId('boxResponsavel');

  const unid = byId('mUnidade');
  const unidadeLogoImg = byId('mUnidadeLogo');
  const unidadeResumo = byId('mUnidadeResumo');
  const hab = byId('mHabitacao');
  const inq = byId('mInquilino');
  const btnInserir = byId('btnInserirVinculoM');
  const btnLimparV = byId('btnLimparVinculosM');
  const tabela = byId('mTabela');
  const btnLimparForm = byId('btnLimparFormM');
  const btnCadastrar = byId('btnCadastrarMor');
  const btnCancelarEdicao = byId('btnCancelarEdicaoMor');
  const morLista = byId('morLista');
  // Paginação
  const mPaginas = byId('mPaginas');
  const mPageSizeSel = byId('mPageSize');
  let MOR_PAGE_SIZE = 50;
  let morPage = 0;
  let morRefreshTimeout = null;
  // Ordenação dinâmica
  let morSortKey = 'email';
  let morSortDir = 'asc'; // 'asc' | 'desc'
  let editMode = false;
  let editingEmail = '';

  // Picker Habitação (mesmo formato do campo Vincular da Garagem)
  const mHabPickerRoot = document.querySelector('[data-m-hab-picker]');
  const mHabPickerBox = mHabPickerRoot ? mHabPickerRoot.querySelector('[data-m-hab-picker-box]') : null;
  const mHabPickerInput = mHabPickerRoot ? mHabPickerRoot.querySelector('[data-m-hab-picker-input]') : null;
  const mHabPickerTokens = mHabPickerRoot ? mHabPickerRoot.querySelector('[data-m-hab-picker-tokens]') : null;
  const mHabPickerMenu = mHabPickerRoot ? mHabPickerRoot.querySelector('[data-m-hab-picker-menu]') : null;
  const mHabPickerPlaceholder = mHabPickerRoot ? mHabPickerRoot.querySelector('[data-m-hab-picker-placeholder]') : null;

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

  function mHabOpenMenu(){ if(mHabPickerMenu) mHabPickerMenu.hidden = false; }
  function mHabCloseMenu(){ if(mHabPickerMenu) mHabPickerMenu.hidden = true; }

  function mHabUpdateDisabledState(){
    if(!mHabPickerRoot || !hab) return;
    var dis = !!hab.disabled;
    mHabPickerRoot.classList.toggle('is-disabled', dis);
    if(mHabPickerInput) mHabPickerInput.disabled = dis;
    if(mHabPickerBox) mHabPickerBox.setAttribute('aria-disabled', dis ? 'true' : 'false');
    if(dis) mHabCloseMenu();
  }

  function mHabRenderToken(label){
    if(!mHabPickerTokens) return;
    if(!label){ mHabPickerTokens.innerHTML=''; return; }
    mHabPickerTokens.innerHTML = '<span class="wdg-enq-token">'
      + escapeHtml(label)
      + ' <button type="button" data-m-hab-clear aria-label="Remover">×</button>'
      + '</span>';
  }

  function mHabGetSelectedLabel(){
    if(!hab) return '';
    var val = String(hab.value || '');
    if(!val) return '';
    var opt = hab.querySelector('option[value="' + cssEscapeValue(val) + '"]');
    return opt ? String(opt.textContent || '').trim() : '';
  }

  function mHabBuildItemsFromSelect(){
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

  function mHabRenderMenu(items, filter){
    if(!mHabPickerMenu) return;
    var q = String(filter || '').trim().toLowerCase();
    var selectedVal = hab ? String(hab.value || '') : '';
    var list = (items || []).filter(function(it){
      if(!it || !it.value) return false;
      if(selectedVal && String(it.value) === selectedVal) return false;
      if(!q) return true;
      return String(it.label || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    if(list.length === 0){
      mHabPickerMenu.innerHTML = '<div class="px-2 py-2 text-muted small">Nenhum resultado.</div>';
      return;
    }
    var unidadeLine = getSelectedUnidadeLabel() || 'Condomínio';
    var avatarSrc = (basePath || '') + '/images/home.png';
    mHabPickerMenu.innerHTML = list.map(function(it){
      return ''
        + '<button type="button" class="wdg-enq-picker-item" data-m-hab-item data-val="' + escapeAttr(it.value) + '">' 
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

  var mHabItemsCache = [];
  function refreshMHabPickerFromSelect(){
    if(!mHabPickerRoot || !hab) return;
    mHabItemsCache = mHabBuildItemsFromSelect();
    var label = mHabGetSelectedLabel();
    mHabRenderToken(label);
    if(mHabPickerPlaceholder) mHabPickerPlaceholder.hidden = true;
    if(mHabPickerInput) mHabPickerInput.value = '';
    mHabRenderMenu(mHabItemsCache, '');
    mHabUpdateDisabledState();
    mHabCloseMenu();
  }

  if(mHabPickerBox){
    mHabPickerBox.addEventListener('click', function(){
      if(hab && hab.disabled) return;
      if(mHabPickerInput) mHabPickerInput.focus();
      mHabOpenMenu();
    });
    mHabPickerBox.addEventListener('keydown', function(e){
      if(!e) return;
      if(hab && hab.disabled) return;
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); mHabOpenMenu(); if(mHabPickerInput) mHabPickerInput.focus(); }
      if(e.key==='Escape'){ mHabCloseMenu(); }
    });
  }
  if(mHabPickerInput){
    mHabPickerInput.addEventListener('input', function(){
      mHabRenderMenu(mHabItemsCache, mHabPickerInput.value);
      mHabOpenMenu();
    });
    mHabPickerInput.addEventListener('focus', function(){
      if(hab && hab.disabled) return;
      mHabRenderMenu(mHabItemsCache, mHabPickerInput.value);
      mHabOpenMenu();
    });
    mHabPickerInput.addEventListener('keydown', function(e){
      if(!e) return;
      if(e.key==='Escape'){ mHabCloseMenu(); return; }
    });
  }
  if(mHabPickerRoot){
    mHabPickerRoot.addEventListener('click', function(e){
      if(hab && hab.disabled) return;
      var btn = e && e.target ? e.target.closest('[data-m-hab-item]') : null;
      if(btn && hab){
        var v = String(btn.getAttribute('data-val') || '');
        hab.value = v;
        refreshMHabPickerFromSelect();
        return;
      }
      var clearBtn = e && e.target ? e.target.closest('[data-m-hab-clear]') : null;
      if(clearBtn && hab){
        hab.value = '';
        refreshMHabPickerFromSelect();
        return;
      }
    });
  }
  document.addEventListener('click', function(e){
    if(!mHabPickerRoot || !mHabPickerMenu) return;
    var t = e && e.target ? e.target : null;
    if(!t) return;
    if(mHabPickerRoot.contains(t)) return;
    mHabCloseMenu();
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

  // Dados
  const existingUsers = safeJSON('existingUsersData', []);
  // Habitações (preferir storages oficiais do módulo, com fallback legado)
  let habs = safeJSON('habitacoesLivresData', []);
  try {
    const main = JSON.parse(localStorage.getItem('wdgHabMain')||'[]');
    if(Array.isArray(main) && main.length) habs = main;
  } catch(_) { /* ignore */ }
  if(!habs || !habs.length){
    try { habs = JSON.parse(localStorage.getItem('wdgCondoHabitacoesLocal')||'[]'); } catch(_) { habs = []; }
  }
  let blocos = [];
  let andares = [];
  try { blocos = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]') || []; } catch(_) { blocos = []; }
  try { andares = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]') || []; } catch(_) { andares = []; }
  const unidades = safeJSON('unidadesData', []);

  function safeJSON(id, fb){ try{ const el=byId(id); return el? JSON.parse(el.textContent||'[]'):fb; }catch{ return fb; } }

  function setBlocked(block){
    [nome, rg, cpf, dn, pai, mae, sexo].forEach(el=>{ if(!el) return; el.disabled=!!block; el.classList.toggle('blocked', !!block && el.tagName!=='BUTTON'); });
    mHabUpdateDisabledState();
  }
  function enableAll(){ setBlocked(false); }
  function disableAll(){ setBlocked(true); }

  // Controles de vínculo (Unidade/Habitação/Inserir/Limpar) devem permanecer habilitados mesmo quando o usuário vier do Gestor
  function enableVinculos(){
    [unid, hab, btnInserir, btnLimparV, inq].forEach(function(el){ if(!el) return; el.disabled=false; el.classList.remove('blocked'); });
    mHabUpdateDisabledState();
  }

  function fillSelect(select,data,mapper){ if(!select) return; select.innerHTML=''; const opt=document.createElement('option'); opt.value=''; opt.textContent='Selecione...'; select.appendChild(opt); (data||[]).forEach(item=>{ const {value,label}=(mapper?mapper(item):{value:item._id,label:item.nome}); const o=document.createElement('option'); o.value=value; o.textContent=label; select.appendChild(o); }); }

  function updateUnidadeResumo(){
    if(!unidadeResumo) return;
    if(!unid || !unid.value){ unidadeResumo.textContent = 'Selecione um condomínio'; return; }
    const selected = unid.options[unid.selectedIndex]?.text || '';
    unidadeResumo.textContent = selected || 'Selecione um condomínio';
  }

  function populateUnidades(){
    fillSelect(unid, unidades, u=>({ value:u._id, label:u.codigo? u.codigo+' - '+u.nome : u.nome }));
    if(unid){
      const selectable = Array.from(unid.options).filter(opt => opt.value);
      if(selectable.length === 1){
        selectable[0].selected = true;
      }
    }
    updateUnidadeResumo();
    refreshUnitLogo();
  }
  function labelById(arr,id){ const x=(arr||[]).find(o=> String(o.id)===String(id)); return x? x.nome : ''; }
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
  async function populateHabitacoesFiltro(uid){
    if(!hab) return;
    if(!uid){
      fillSelect(hab, []);
      hab.disabled = true;
      hab.classList.add('blocked');
      if(inq){ inq.disabled = true; inq.classList.add('blocked'); inq.checked = false; }
      refreshMHabPickerFromSelect();
      return;
    }
    // Exibe todas as habitações do condomínio selecionado vindas do banco (morador pode existir mais de um por habitação)
    const lista = await fetchHabitacoesByUnidade(uid);
    fillSelect(hab, lista, h=>{
      const idVal = (h._id ?? h.id ?? '');
      const blocoNome = (h.bloco && h.bloco.nome) || h.bloco_nome || h.bloco || labelById(blocos, h.blocoId) || '';
      const andarNome = (h.andar && h.andar.nome) || h.andar_nome || h.andar || labelById(andares, h.andarId) || '';
      const numero = (h.numero || h.identificador || h.label || '—');
      const parts = [blocoNome, andarNome, numero].filter(Boolean);
      return { value: idVal, label: parts.join(' - ') };
    });
    var vincDisabled = !!(btnInserir && btnInserir.disabled);
    hab.disabled = vincDisabled;
    hab.classList.remove('blocked');
    if(inq){
      inq.disabled = vincDisabled;
      inq.classList.toggle('blocked', vincDisabled);
      if(vincDisabled) inq.checked = false;
      else inq.classList.remove('blocked');
    }
    refreshMHabPickerFromSelect();
  }

  function formatCPF(v){ if(!v) return ''; const d=String(v).replace(/\D/g,'').slice(0,11); if(d.length<=3) return d; if(d.length<=6) return `${d.slice(0,3)}.${d.slice(3)}`; if(d.length<=9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`; return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`; }
  function isValidCPF(v){ const s=String(v).replace(/\D/g,''); if(s.length!==11) return false; if(/^(\d)\1{10}$/.test(s)) return false; let sum=0; for(let i=0;i<9;i++) sum+=parseInt(s[i])*(10-i); let rest=sum%11; let d1= rest<2?0:11-rest; sum=0; for(let i=0;i<10;i++) sum+=parseInt(s[i])*(11-i); rest=sum%11; let d2= rest<2?0:11-rest; return (+s[9]===d1 && +s[10]===d2); }
  function calcIdadeFromBR(v){ const m=v&&v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return ''; const d=new Date(+m[3],+m[2]-1,+m[1]); if(isNaN(d)) return ''; const t=new Date(); let age=t.getFullYear()-d.getFullYear(); const md=t.getMonth()-d.getMonth(); if(md<0 || (md===0 && t.getDate()<d.getDate())) age--; return age>=0? String(age):''; }

  function isoToBr(s){ if(!s) return ''; try{ const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return `${m[3]}/${m[2]}/${m[1]}`; return String(s); }catch{ return ''; } }

  function findUserByEmail(e){ const em=String(e||'').trim().toLowerCase(); return existingUsers.find(u=> String(u.email||'').toLowerCase()===em) || null; }
  function isGestorUser(u){
    if(!u) return false;
    const match = existingUsers.find(x=> String(x.email||'').toLowerCase()===String(u.email||'').toLowerCase());
    return !!(match && match.isFuncionario);
  }
  function hydrateFromGestorShadow(u){
    if(!u || !isGestorUser(u)) return false;
          if(!unid || !unid.value) return alert('Selecione um condomínio.');
    if(u.nome) nome.value=u.nome; if(u.rg) rg.value=u.rg; if(u.cpf) cpf.value=formatCPF(u.cpf);
    if(u.data_nascimento || u.data_nascimento_br){ dn.value=u.data_nascimento_br||u.data_nascimento; }
    if(u.pai) pai.value=u.pai; if(u.mae) mae.value=u.mae; if(u.sexo) sexo.value=u.sexo;
    if(u.telefone) telefone.value=formatPhoneBR(u.telefone);
    if(u.whatsapp) whatsapp.checked=!!u.whatsapp;
    // Bloqueia dados pessoais (exceto telefone/whatsapp)
    setBlocked(true);
    if(telefone){ telefone.disabled=false; telefone.classList.remove('blocked'); }
    if(whatsapp){ whatsapp.disabled=false; whatsapp.classList.remove('blocked'); }
    // Vinculação de habitações permanece liberada
    enableVinculos();
    return true;
  }

  function clearForm(options){
    const { preserveEmail = true, preserveUnidade = true } = options || {};
    $$('#formMorador input, #formMorador select').forEach(el=>{
      if(el.id==='mEmail' && preserveEmail) return;
      if(el.id==='mUnidade' && preserveUnidade) return;
      if(el.type==='button') return;
      el.value='';
    });
    tabela.innerHTML='';
    cpf.classList.remove('is-invalid');
    emailMsg.classList.add('d-none');
    disableAll();
    btnCadastrar.disabled=true;
    boxResp.style.display='none';
    rEmail.value='';
    rNome.value='';
    rEmailMsg.classList.add('d-none');
    if(whatsapp) whatsapp.checked=false;
    if(!preserveEmail) email.value='';
    if(preserveUnidade){
      updateUnidadeResumo();
      populateHabitacoesFiltro(unid ? unid.value : '');
    } else {
      updateUnidadeResumo();
      populateHabitacoesFiltro('');
    }
    editMode = false;
    editingEmail = '';
    setEditModeUI(false);
  }

  email.addEventListener('input', ()=> emailMsg.classList.add('d-none'));
  cpf.addEventListener('input', ()=>{ cpf.value=formatCPF(cpf.value); });
  function updateIdadeFromDN(){
    idade.value = calcIdadeFromBR(dn.value)||'';
    toggleResponsavel();
  }
  dn.addEventListener('input', updateIdadeFromDN);
  dn.addEventListener('change', updateIdadeFromDN);
  telefone && telefone.addEventListener('input', ()=>{
    const d = telefone.value.replace(/\D/g,'').slice(0,11);
    if(!d){ telefone.value=''; return; }
    const ddd = d.slice(0,2);
    const nums = d.slice(2);
    if(nums.length <= 1){ telefone.value = `(${ddd}) ${nums}`; return; }
    if(nums.length <= 4){ telefone.value = `(${ddd}) ${nums}`; return; }
    if(nums.length === 8){ telefone.value = `(${ddd}) ${nums.slice(0,4)}-${nums.slice(4)}`; return; }
    if(nums.length < 9){ const first = nums.slice(0,1); const rest = nums.slice(1); if(rest.length <= 4){ telefone.value = `(${ddd}) ${first} ${rest}`; return; } telefone.value = `(${ddd}) ${first} ${rest.slice(0,4)}-${rest.slice(4)}`; return; }
    const first = nums.slice(0,1); const rest = nums.slice(1);
    telefone.value = `(${ddd}) ${first} ${rest.slice(0,4)}-${rest.slice(4)}`;
  });

  function toggleResponsavel(){
    const age = parseInt(idade.value,10);
    if(!isNaN(age) && age < 18){
      boxResp.style.display = 'block';
    } else {
      boxResp.style.display = 'none';
    }
  }

  populateUnidades();
  populateHabitacoesFiltro(unid ? unid.value : '');
  refreshMHabPickerFromSelect();
  unid && unid.addEventListener('change', ()=> {
    updateUnidadeResumo();
    populateHabitacoesFiltro(unid.value);
    refreshUnitLogo();
    refreshMHabPickerFromSelect();
  });

  btnVerificar.addEventListener('click', ()=>{
    if(!unid || !unid.value){ alert('Selecione um condomínio antes de verificar o e-mail.'); return; }
    const em = (email.value||'').trim(); if(!em){ emailMsg.textContent='Informe um e-mail.'; emailMsg.classList.remove('d-none'); return; }
    const u = findUserByEmail(em); emailMsg.classList.add('d-none');
    if(!u){ enableAll(); [nome, rg, cpf, dn, pai, mae, sexo, telefone, whatsapp].forEach(el=>{ if(!el) return; el.disabled=false; el.classList.remove('blocked'); }); enableVinculos(); btnCadastrar.disabled=false; email.dataset.fromGestor=''; editMode = false; editingEmail=''; setEditModeUI(false); return; }
    nome.value=u.nome||''; rg.value=u.rg||''; cpf.value=formatCPF(u.cpf||'');
    let dval = u.data_nascimento_br || u.data_nascimento || '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(dval)){ const [yyyy,mm,dd]=dval.split('-'); dval=`${dd}/${mm}/${yyyy}`; }
    dn.value = dval;
    idade.value = calcIdadeFromBR(dval)||'';
    pai.value=u.pai||''; mae.value=u.mae||''; sexo.value=u.sexo||''; telefone.value=u.telefone? formatPhoneBR(u.telefone):''; whatsapp.checked=!!u.whatsapp; toggleResponsavel(); enableAll();
  const gestor = hydrateFromGestorShadow(u);
    // Independente da origem (Gestor ou Condomínios), após verificação do e-mail
    // os campos Telefone e os controles de Vínculos (condomínio/habitação) devem ficar habilitados
    if(telefone){ telefone.disabled=false; telefone.classList.remove('blocked'); }
    if(whatsapp){ whatsapp.disabled=false; whatsapp.classList.remove('blocked'); }
    enableVinculos();
    email.dataset.fromGestor = gestor ? '1' : '';
    btnCadastrar.disabled=false;
    editMode = false;
    editingEmail='';
    setEditModeUI(false);
  });

  btnVerResp.addEventListener('click', ()=>{
    const rem = (rEmail.value||'').trim(); if(!rem){ rEmailMsg.textContent='Informe e-mail do responsável.'; rEmailMsg.classList.remove('d-none'); return; }
    const ru = findUserByEmail(rem); rEmailMsg.classList.add('d-none');
    if(!ru){ rNome.value=''; alert('Responsável não encontrado em usuários. Cadastre como Proprietário/Responsável primeiro.'); return; }
    rNome.value = ru.nome||'(Sem nome)';
  });

  btnInserir.addEventListener('click', ()=>{
    const uid=unid.value, uidText=unid.options[unid.selectedIndex]?.text||'';
    const hid=hab.value, hidText=hab.options[hab.selectedIndex]?.text||'';
    if(!uid||!hid) return alert('Selecione condomínio e habitação.');
    const isInq = !!(inq && inq.checked);
    const tr=document.createElement('tr'); tr.dataset.unidadeId=uid; tr.dataset.habitacaoId=hid; tr.dataset.mora='S'; tr.dataset.inquilino = isInq ? 'S' : 'N';
    const inqBadge = isInq ? '<span class="badge bg-primary">Sim</span>' : '<span class="badge bg-secondary">Não</span>';
  tr.innerHTML=`<td>${uidText}</td><td>${hidText}</td><td>${inqBadge}</td><td><button type=\"button\" class=\"wdg-icon-btn\" data-action=\"rem\" aria-label=\"Remover vínculo\" title=\"Remover vínculo\"><img src=\"${basePath}/images/excluir.png\" alt=\"Remover\"/></button></td>`;
    tabela.appendChild(tr); hab.value=''; if(inq) inq.checked=false;
    refreshMHabPickerFromSelect();
  });
  tabela.addEventListener('click', e=>{ const b=e.target.closest('button[data-action="rem"]'); if(!b) return; b.closest('tr')?.remove(); });
  btnLimparV.addEventListener('click', ()=>{ tabela.innerHTML=''; refreshMHabPickerFromSelect(); });
  btnLimparForm.addEventListener('click', ()=> clearForm({ preserveEmail:true }));
  btnCancelarEdicao && btnCancelarEdicao.addEventListener('click', ()=>{
    clearForm({ preserveEmail:false });
  });

  btnCadastrar.addEventListener('click', async ()=>{
    const em=(email.value||'').trim().toLowerCase(); if(!em) return alert('Informe o e-mail.');
    const cpfDigits=(cpf.value||'').replace(/\D/g,''); if(cpfDigits && !isValidCPF(cpfDigits)){ cpf.classList.add('is-invalid'); return; } else cpf.classList.remove('is-invalid');
  const age = +idade.value || 0; const menor = age < 18;
    if(menor){ if(!rEmail.value.trim()){ return alert('Menor de idade: informe e-mail do responsável.'); } if(!rNome.value.trim()){ return alert('Verifique o responsável primeiro.'); } }

    // Vinculos inseridos agora (todos morador true nesta tela)
  const novosVincMoradores = Array.from(tabela.querySelectorAll('tr')).map(tr=>({ unidade_id: tr.dataset.unidadeId, habitacao_id: tr.dataset.habitacaoId, morador: true, inquilino: (tr.dataset.inquilino==='S') }));
    // Evitar duplicidades por habitação
    const seenHab = new Set();
    const vinculosUnicos = novosVincMoradores.filter(v=>{ const k=String(v.habitacao_id||''); if(!k) return false; if(seenHab.has(k)) return false; seenHab.add(k); return true; });

    const payload = {
      email: em,
      nome: nome.value||'',
      rg: rg.value||'',
      cpf: cpfDigits||'',
      data_nascimento: dn.value||'',
      sexo: sexo.value||'',
      telefone: (telefone.value||'').replace(/\D/g,''),
      pai: (pai.value||''),
      mae: (mae.value||''),
      whatsapp: !!(whatsapp && whatsapp.checked),
      responsavel_email: menor ? (rEmail.value||'').trim().toLowerCase() : '',
      responsavel_nome: menor ? (rNome.value||'') : '',
      unidade_id: unid.value || null,
      vinculos: vinculosUnicos
    };

    try{
      const res = await fetch(basePath + '/api/moradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      if(!res.ok){ const txt = await res.text(); throw new Error('Falha ao salvar: '+txt); }
      const out = await res.json();
      alert('Morador cadastrado no banco de dados.');
      try { await renderMorPage(0); } catch(_){ }
      clearForm({ preserveEmail:false, preserveUnidade:true });
    } catch(e){
      console.error('[cadastro morador] erro', e);
      alert('Não foi possível salvar no servidor. Tente novamente.');
    }
  });

  function upsertMoradorRow(u){
    const tbody = morLista; if(!tbody) return;
    const tr = tbody.querySelector(`tr[data-email="${CSS.escape(String(u.email).toLowerCase())}"]`) || document.createElement('tr');
    tr.dataset.email = String(u.email).toLowerCase();
    if(u && u._id) tr.setAttribute('data-mor-id', String(u._id));
    const conds = montarListaCondominios(u.vinculos||[]);
    const habs = montarListaHabsDetalhada(u.vinculos||[], { incluirUnidade:false });
    tr.innerHTML = `<td>${u.email||''}</td><td>${u.nome||''}</td><td>${conds||'-'}</td><td>${habs||'-'}</td><td class="text-nowrap"><button type="button" class="wdg-icon-btn" data-action="detalhes" aria-label="Detalhes" title="Detalhes"><img src="${basePath}/images/detalhe.png" alt="Detalhes"/></button> <button type="button" class="wdg-icon-btn" data-action="edit" aria-label="Editar" title="Editar"><img src="${basePath}/images/editar.png" alt="Editar"/></button> <button type="button" class="wdg-icon-btn" data-action="del-mor" aria-label="Excluir" title="Excluir"><img src="${basePath}/images/excluir.png" alt="Excluir"/></button></td>`;
    if(!tr.parentNode) tbody.appendChild(tr);
  }
  function shortUnidade(id){ const u=unidades.find(x=>String(x._id)===String(id)); if(!u) return id||'-'; return u.codigo? (u.codigo+' - '+u.nome):u.nome; }
  function shortHabitacao(id){
    const h=(habs||[]).find(x=> String((x._id??x.id))===String(id));
    if(!h) return id||'-';
    const blocoNome = (h.bloco_nome || h.bloco || labelById(blocos, h.blocoId) || '');
    const andarNome = (h.andar_nome || h.andar || labelById(andares, h.andarId) || '');
    const numero = (h.numero || h.identificador || '—');
    return [blocoNome, andarNome, numero].filter(Boolean).join(' - ');
  }

  function montarListaCondominios(vinculos){
    const nomes = [];
    const seen = new Set();
    (vinculos||[]).forEach(v => {
      const unidadeId = v && v.unidade_id ? String(v.unidade_id) : '';
      if(!unidadeId || seen.has(unidadeId)) return;
      seen.add(unidadeId);
      nomes.push(shortUnidade(unidadeId));
    });
    return nomes.join('<br>');
  }

  function montarListaHabsDetalhada(vinculos, options){
    const incluirUnidade = !(options && options.incluirUnidade === false);
    // Preferir rótulo fornecido pelo servidor quando disponível (hab_label)
    let allHab=[]; try{ allHab = JSON.parse(localStorage.getItem('wdgHabMain')||'[]'); }catch{ allHab=[]; }
    let allBlocos=[]; try{ allBlocos = JSON.parse(localStorage.getItem('wdgHabBloc')||'[]'); }catch{ allBlocos=[]; }
    let allAndares=[]; try{ allAndares = JSON.parse(localStorage.getItem('wdgHabAndar')||'[]'); }catch{ allAndares=[]; }
    return (vinculos||[]).map(v => {
      const unidadeRotulo = shortUnidade(v.unidade_id);
      if(v && v.hab_label){
        const papel = v.morador ? (v.inquilino ? 'morador (inq.)' : 'morador') : 'não morador';
        const base = `${v.hab_label} (${papel})`;
        return incluirUnidade ? `${unidadeRotulo} - ${base}` : base;
      }
      const h = allHab.find(x=> String((x._id??x.id))===String(v.habitacao_id));
      const papelDesc = v.morador ? (v.inquilino ? 'morador (inq.)' : 'morador') : 'não morador';
      if(!h){
        const baseDesconhecida = `Habitação desconhecida (${papelDesc})`;
        return incluirUnidade ? `${unidadeRotulo} - ${baseDesconhecida}` : baseDesconhecida;
      }
      const bloco = (allBlocos.find(b=> String(b.id)===String(h.blocoId))||{}).nome || (h.bloco_nome||'');
      const andar = (allAndares.find(a=> String(a.id)===String(h.andarId))||{}).nome || (h.andar_nome||'');
      const numero = h.numero || h.identificador || '';
      const descricaoHab = `${h.tipo||'Hab.'}${bloco? ' - '+bloco:''}${andar? ' - '+andar:''} - ${numero} (${papelDesc})`;
      return incluirUnidade ? `${unidadeRotulo} - ${descricaoHab}` : descricaoHab;
    }).join('<br>');
  }

  // Texto simples para ordenação por colunas dinâmicas
  function sortTextHabs(vinculos){
    return montarListaHabsDetalhada(vinculos, { incluirUnidade:false }).replace(/<br\s*\/?\>/gi, ' ');
  }

  function sortTextCondominios(vinculos){
    return montarListaCondominios(vinculos).replace(/<br\s*\/?\>/gi, ' ');
  }

  // Delegação ações tabela Moradores
  morLista.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-action]'); if(!btn) return; const tr = btn.closest('tr'); if(!tr) return; const email = tr.dataset.email;
    if(btn.dataset.action==='detalhes') window.abreDetalhesMorador(email);
    else if(btn.dataset.action==='edit') editarMorador(email);
    else if(btn.dataset.action==='del' || btn.dataset.action==='del-mor'){
      const mid = tr.getAttribute('data-mor-id');
      if(!mid) return alert('ID de morador não encontrado.');
      if(!confirm('Confirma remover este morador?')) return;
      fetch(basePath + '/api/moradores/' + encodeURIComponent(mid) + '?hard=1', { method:'DELETE', credentials:'same-origin' })
        .then(async r=>{ if(!r.ok){ throw new Error(await r.text()); } })
        .then(async ()=>{ await renderMorPage(0); })
        .catch(err=>{ console.error('[del morador] erro', err); alert('Falha ao remover.'); });
    }
  });

  async function editarMorador(email){
    try{
      const tr = morLista && morLista.querySelector(`tr[data-email="${CSS.escape(String(email).toLowerCase())}"]`);
      const id = tr ? (tr.getAttribute('data-mor-id')||'') : '';
      let lista = await getMoradores(); if(!Array.isArray(lista)) lista=[];
      const u = (id? lista.find(x=> String(x._id)===String(id)) : null) || lista.find(x=> String(x.email||'').toLowerCase()===String(email).toLowerCase());
      if(!u){ alert('Registro não encontrado no servidor.'); return; }
      byId('mEmail').value = u.email||'';
      nome.value = u.nome||'';
      rg.value = u.rg||'';
      cpf.value = formatCPF(u.cpf||'');
      const dval = isoToBr(u.data_nascimento)||'';
      dn.value = dval;
      idade.value = calcIdadeFromBR(dval)||'';
      toggleResponsavel();
      pai.value = u.pai||'';
      mae.value = u.mae||'';
      sexo.value = u.sexo||'';
      telefone.value = u.telefone? formatPhoneBR(u.telefone):'';
      whatsapp.checked = !!u.whatsapp;
      if(unid){
        const primeiraUnidade = (u.vinculos||[]).find(v => v && v.unidade_id)?.unidade_id || (u.unidade_id || '');
        if(primeiraUnidade){
          unid.value = String(primeiraUnidade);
        }
        updateUnidadeResumo();
        await populateHabitacoesFiltro(unid.value);
      }
      enableAll(); enableVinculos(); btnCadastrar.disabled=false;
      tabela.innerHTML='';
      (u.vinculos||[]).forEach(v=>{
        const uidText=shortUnidade(v.unidade_id);
        const hidText=v.hab_label || shortHabitacao(v.habitacao_id);
        const isInq = !!v.inquilino;
        const inqBadge = isInq ? '<span class="badge bg-primary">Sim</span>' : '<span class="badge bg-secondary">Não</span>';
        const trEl=document.createElement('tr');
        trEl.dataset.unidadeId=v.unidade_id; trEl.dataset.habitacaoId=v.habitacao_id; trEl.dataset.mora='S'; trEl.dataset.inquilino = isInq ? 'S' : 'N';
        trEl.innerHTML=`<td>${uidText}</td><td>${hidText}</td><td>${inqBadge}</td><td><button type='button' class='wdg-icon-btn' data-action='rem' aria-label='Remover vínculo' title='Remover vínculo'><img src='${basePath}/images/excluir.png' alt='Remover'/></button></td>`;
        tabela.appendChild(trEl);
      });
      editMode = true;
      editingEmail = String(u.email||'').toLowerCase();
      setEditModeUI(true);
    }catch(err){ console.warn('[editarMorador] erro', err); alert('Falha ao carregar dados do servidor.'); }
  }

  async function populateSexo(){
    try{ const res = await fetch(basePath + '/data/sexo.json'); const data = await res.json(); fillSelect(sexo, data, s=>({ value: s.codigo, label: s.descricao })); }catch(_e){ fillSelect(sexo, [{codigo:'',descricao:'Selecione...'}], s=>({value:s.codigo,label:s.descricao})); }
  }
  populateSexo();

  function formatPhoneBR(d){
    const s=String(d||'').replace(/\D/g,'').slice(0,11);
    if(s.length<=2) return s;
    if(s.length<=6) return `(${s.slice(0,2)}) ${s.slice(2)}`;
    if(s.length<=10) return `(${s.slice(0,2)}) ${s.slice(2,6)}-${s.slice(6,10)}`;
    return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7,11)}`;
  }

  // Removido legado de exclusão local: exclusão agora sempre via API
  
  // === Listagem com paginação ===
  async function getMoradores(){
    try{
      const res = await fetch(basePath + '/api/moradores/busca', { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return Array.isArray(data)? data : [];
    }catch(e){ console.warn('[moradores] falha ao carregar lista do servidor', e); return []; }
  }
  function buildMorRow(u){
    const conds = montarListaCondominios(u.vinculos||[]);
    const habs = montarListaHabsDetalhada(u.vinculos||[], { incluirUnidade:false });
    return `<tr data-email="${String(u.email||'').toLowerCase()}" data-mor-id="${u._id||''}"><td>${u.email||''}</td><td>${u.nome||''}</td><td>${conds||'-'}</td><td>${habs||'-'}</td><td class="text-nowrap"><button type="button" class="wdg-icon-btn" data-action="detalhes" aria-label="Detalhes" title="Detalhes"><img src="${basePath}/images/detalhe.png" alt="Detalhes"/></button> <button type="button" class="wdg-icon-btn" data-action="edit" aria-label="Editar" title="Editar"><img src="${basePath}/images/editar.png" alt="Editar"/></button> <button type="button" class="wdg-icon-btn" data-action="del-mor" aria-label="Excluir" title="Excluir"><img src="${basePath}/images/excluir.png" alt="Excluir"/></button></td></tr>`;
  }
  async function renderMorPage(page){ if(!morLista) return; let pageSize=MOR_PAGE_SIZE; if(mPageSizeSel){ const v=parseInt(mPageSizeSel.value,10); if(!isNaN(v)&&v>0) pageSize=v; }
    // Obtém e ordena dados conforme chave/direção atuais
    let data = await getMoradores(); data = Array.isArray(data)? data.slice() : [];
    const key = morSortKey;
    const dir = morSortDir === 'desc' ? -1 : 1;
    function getMorSortValue(u, key){
      if(key==='habitacoes') return sortTextHabs(u?.vinculos||[]);
      if(key==='condominio') return sortTextCondominios(u?.vinculos||[]);
      return String((u&&u[key])||'');
    }
    data.sort((a,b)=> {
      const av = String(getMorSortValue(a, key)).toLowerCase();
      const bv = String(getMorSortValue(b, key)).toLowerCase();
      if(av < bv) return -1*dir;
      if(av > bv) return 1*dir;
      return 0;
    });
    const totalPages = Math.ceil(data.length / pageSize) || 1; if(page<0) page=0; if(page>=totalPages) page=totalPages-1; morPage=page;
    const start = page*pageSize; const slice = data.slice(start, start+pageSize);
    morLista.innerHTML = slice.map(buildMorRow).join('');
    buildMorPagination(totalPages, pageSize, data.length);
    updateMorSortClasses();
  }
  function buildMorPagination(totalPages, pageSize, totalItems){ if(!mPaginas) return; mPaginas.innerHTML=''; if(totalPages<=1){ const infoOnly=document.createElement('div'); infoOnly.className='w-100 text-center mt-1'; infoOnly.style.fontSize='.7rem'; infoOnly.textContent='Total: '+totalItems+' morador(es)'; mPaginas.appendChild(infoOnly); return; }
    function mk(label, go, dis){ const b=document.createElement('button'); b.type='button'; b.textContent=label; b.disabled=!!dis; b.addEventListener('click', ()=> renderMorPage(go)); return b; }
    const win=5; const start=Math.max(0, morPage-Math.floor(win/2)); const end=Math.min(totalPages-1, start+win-1);
    const firstBtn=mk('<<',0,morPage===0); const prevBtn=mk('<',morPage-1,morPage===0); mPaginas.appendChild(firstBtn); mPaginas.appendChild(prevBtn);
    if(start>0){ const b0=mk('1',0,false); if(morPage===0) b0.classList.add('active'); mPaginas.appendChild(b0); const dots=document.createElement('span'); dots.textContent='...'; dots.style.padding='0 .4rem'; mPaginas.appendChild(dots); }
    for(let p=start; p<=end; p++){ const b=mk(String(p+1), p, false); if(p===morPage) b.classList.add('active'); mPaginas.appendChild(b); }
    if(end<totalPages-1){ const dots2=document.createElement('span'); dots2.textContent='...'; dots2.style.padding='0 .4rem'; mPaginas.appendChild(dots2); const blast=mk(String(totalPages), totalPages-1, false); if(morPage===totalPages-1) blast.classList.add('active'); mPaginas.appendChild(blast); }
    const nextBtn=mk('>', morPage+1, morPage===totalPages-1); const lastBtn=mk('>>', totalPages-1, morPage===totalPages-1); mPaginas.appendChild(nextBtn); mPaginas.appendChild(lastBtn);
    const info=document.createElement('div'); info.className='w-100 text-center mt-1'; info.style.fontSize='.7rem'; info.textContent='Total: '+totalItems+' morador(es)'; mPaginas.appendChild(info);
  }
  mPageSizeSel && mPageSizeSel.addEventListener('change', ()=> renderMorPage(0));
  // Render inicial
  (async function(){ try { await renderMorPage(0); } catch(_e){} })();
  // Garante avaliação inicial caso idade já esteja preenchida (edições)
  toggleResponsavel();

  // === Ordenação (clique nos cabeçalhos com data-sort) ===
  function attachMorSorting(){
    const thead = document.querySelector('#tblMoradores thead'); if(!thead) return;
    thead.addEventListener('click', e=>{
      const th = e.target.closest('th[data-sort]'); if(!th) return;
      const key = th.getAttribute('data-sort'); if(!key) return;
      if(morSortKey === key){ morSortDir = (morSortDir === 'asc' ? 'desc' : 'asc'); }
      else { morSortKey = key; morSortDir = 'asc'; }
      renderMorPage(0); // volta para primeira página ao alterar ordenação
    });
  }
  function updateMorSortClasses(){
    const ths = document.querySelectorAll('#tblMoradores thead th[data-sort]');
    ths.forEach(th=>{
      th.classList.remove('asc','desc');
      const key = th.getAttribute('data-sort');
      if(key === morSortKey){ th.classList.add(morSortDir); }
    });
  }
  attachMorSorting();
  updateMorSortClasses();

  document.addEventListener('habitacao:moradores:atualizado', () => {
    if(!morLista) return;
    if(morRefreshTimeout){ clearTimeout(morRefreshTimeout); }
    morRefreshTimeout = setTimeout(() => {
      renderMorPage(morPage).catch(()=>{});
    }, 120);
  });
})();
