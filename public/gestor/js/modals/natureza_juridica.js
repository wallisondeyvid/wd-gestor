// Gestor: modal Natureza Jurídica (refatorado para remover fetch direto /data)
(() => {
  const MODAL_ID        = 'modalNaturezaJuridica';
  const BTN_OPEN_ID     = 'btnSelecionarNaturezaJuridica';
  const BTN_CLEAR_ID    = 'btnExcluirNaturezaJuridica';
  const INPUT_TARGET_ID = 'naturezaJuridica';
  const SEARCH_ID       = 'filtroNaturezaJuridica';
  const LIST_ID         = 'listaNaturezasJuridicas';
  const BTN_MODAL_CLEAR = 'btnLimparNaturezaJuridica';
  const BTN_CONFIRM_ID  = 'btnInserirNaturezaJuridica';

  let cacheNaturezas = [];
  const norm = s => String(s || '').replace(/\D+/g, '');
  function modal(){ const el = document.getElementById(MODAL_ID); if(!el) return null; try { return bootstrap.Modal.getOrCreateInstance(el, { backdrop:true, keyboard:true }); } catch { return null; } }
  function sortByCodigo(arr){ return arr.sort((a,b)=>{ const toNum=v=>parseInt(String(v).replace(/\D/g,''),10)||0; return toNum(a.codigo)-toNum(b.codigo); }); }
  function normalize(raw){
    if(!raw) return [];
    if(Array.isArray(raw)){
      return sortByCodigo(raw.map(x=>{ if(!x) return null; const codigo=(x.codigo??x.cod??x.code??x.id??x.value??x.CODIGO??x['código'])?.toString().trim(); const nome=(x.nome??x.descricao??x.DESCRICAO??x.label??x.name)?.toString().trim(); return (codigo&&nome)?{codigo,nome}:null; }).filter(Boolean));
    }
    if(Array.isArray(raw?.naturezas)) return normalize(raw.naturezas);
    if(Array.isArray(raw?.items)) return normalize(raw.items);
    if(typeof raw === 'object'){
      const out=[]; for(const [k,v] of Object.entries(raw)){ const codigo=String(k).trim(); const nome= typeof v==='string'? v.trim() : (v?.nome??v?.descricao??v?.label??'').toString().trim(); if(codigo&&nome) out.push({codigo,nome}); }
      return sortByCodigo(out);
    }
    return [];
  }

  async function fetchGestorData(nome){ const r=await window.wdgFetchGestorJson?.(nome); return r&&r.ok? r.data:null; }

  async function carregarJSON(){
    if(cacheNaturezas.length) return cacheNaturezas;
    const dados = await fetchGestorData('naturezas_juridicas.json');
    cacheNaturezas = normalize(dados||[]);
    return cacheNaturezas;
  }

  function renderLista(items){
    const ul = document.getElementById(LIST_ID);
    if(!ul) return;
    if(!items.length){ ul.innerHTML = `<li class="list-group-item text-muted small">Nenhum resultado.</li>`; return; }
    ul.innerHTML = items.map((n,i)=>{ const id=`nj_${i}`; const val=`${n.codigo} - ${n.nome}`; return `\n<li class="list-group-item item-grid" style="padding:0;border:0;">\n  <div class="col-sel">\n    <input class="form-check-input" type="radio" name="njOpt" id="${id}" value="${val}" data-code="${n.codigo}">\n  </div>\n  <div class="col-cod">${n.codigo}</div>\n  <label class="col-desc w-100" for="${id}" title="${n.nome}">${n.nome}</label>\n</li>`; }).join('');
    ul.querySelectorAll('.item-grid').forEach(row=>{ row.addEventListener('click',()=>{ const r=row.querySelector('input[type="radio"]'); if(!r) return; r.checked=true; ul.querySelectorAll('.item-grid').forEach(n=>n.classList.remove('is-selected')); row.classList.add('is-selected'); }); });
    preSelecionar();
  }

  function filtrarLista(){ const q=(document.getElementById(SEARCH_ID)?.value||'').toLowerCase().trim(); const ul=document.getElementById(LIST_ID); if(!ul) return; ul.querySelectorAll('li.list-group-item').forEach(li=>{ const txt=(li.textContent||'').toLowerCase(); li.style.display = q ? (txt.includes(q)?'':'none') : ''; }); }
  function codigoAtualDoCampo(){ const inputTarget=document.getElementById(INPUT_TARGET_ID); if(!inputTarget) return ''; const ds=inputTarget.dataset?.naturezaCodigo; if(ds) return ds.trim(); const v=(inputTarget.value||'').trim(); if(!v) return ''; const i=v.indexOf(' - '); return (i>-1? v.slice(0,i):v).trim(); }
  function preSelecionar(){ const ul=document.getElementById(LIST_ID); if(!ul) return; const wanted=codigoAtualDoCampo(); if(!wanted) return; let target=null; ul.querySelectorAll('input[name="njOpt"]').forEach(radio=>{ const code=radio.dataset.code||''; if(norm(code)===norm(wanted)) target=radio; }); if(!target){ const f=document.getElementById(SEARCH_ID); if(f&&f.value){ f.value=''; filtrarLista(); target=Array.from(ul.querySelectorAll('input[name="njOpt"]')).find(r=>norm(r.dataset.code||'')===norm(wanted)); } } if(target){ target.checked=true; ul.querySelectorAll('.item-grid').forEach(n=>n.classList.remove('is-selected')); const row=target.closest('item-grid'); if(row){ row.classList?.add('is-selected'); row.scrollIntoView({ block:'center' }); } } }

  async function abrirModal(){ const inst=modal(); if(!inst) return; const lista=await carregarJSON(); renderLista(lista); document.getElementById(SEARCH_ID)?.focus(); inst.show(); }

  document.addEventListener('DOMContentLoaded', ()=>{
    document.addEventListener('click', e=>{ const t=e.target.closest(`#${BTN_OPEN_ID}`); if(t) abrirModal(); });
    const btnClearForm=document.getElementById(BTN_CLEAR_ID); const inputTarget=document.getElementById(INPUT_TARGET_ID);
    if(btnClearForm && inputTarget){ btnClearForm.addEventListener('click', ()=>{ inputTarget.value=''; delete inputTarget.dataset.naturezaCodigo; inputTarget.dispatchEvent(new Event('change',{bubbles:true})); }); }
    const inputSearch=document.getElementById(SEARCH_ID); if(inputSearch) inputSearch.addEventListener('input', filtrarLista);
    const btnModalClear=document.getElementById(BTN_MODAL_CLEAR); if(btnModalClear){ btnModalClear.addEventListener('click', ()=>{ const marcado=document.querySelector(`#${LIST_ID} input[type="radio"]:checked`); if(marcado){ marcado.checked=false; document.querySelectorAll(`#${LIST_ID} .item-grid`).forEach(n=>n.classList.remove('is-selected')); } }); }
    const btnConfirm=document.getElementById(BTN_CONFIRM_ID); if(btnConfirm && inputTarget){ btnConfirm.addEventListener('click', ()=>{ const marcado=document.querySelector(`#${LIST_ID} input[type="radio"]:checked`); if(!marcado){ alert('Selecione uma Natureza Jurídica.'); return; } inputTarget.value=marcado.value; inputTarget.dataset.naturezaCodigo=marcado.dataset.code||''; inputTarget.dispatchEvent(new Event('change',{bubbles:true})); modal()?.hide(); }); }
  });
})();
