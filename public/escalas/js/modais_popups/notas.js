(function(){
  'use strict';
  let MAX = 300; // padrão; pode ser sobrescrito via options.max ao abrir
  let modal, bsModal, txt, cnt, onSave, tituloEl;
  function $(sel, root=document){ return root.querySelector(sel); }
  function updateCnt(){ const v = txt.value||''; cnt.textContent = `${v.length}/${MAX}`; cnt.classList.toggle('text-danger', v.length>MAX); }
  function ensure(){
    if(modal) return;
    modal = document.getElementById('modalNotasEquipe');
    if(!modal){ console.warn('[modal-notas] elemento #modalNotasEquipe não encontrado'); return; }
    bsModal = window.bootstrap && bootstrap.Modal ? new bootstrap.Modal(modal) : null;
  txt = $('#esNotasTxt', modal); cnt = $('#esNotasCnt', modal); tituloEl = $('#modalNotasTitulo', modal);
    const btnLimpar = $('#esNotasLimpar', modal);
    const btnSalvar = $('#esNotasSalvar', modal);
    if(txt){ txt.addEventListener('input', updateCnt); }
    if(btnLimpar){ btnLimpar.addEventListener('click', ()=>{ txt.value=''; updateCnt(); txt.focus(); }); }
  if(btnSalvar){ btnSalvar.addEventListener('click', ()=>{ const v=txt.value||''; if(v.length>MAX){ const msg=`Notas acima do limite (${MAX} caracteres).`; if(window.alertTop) alertTop(msg,'warning'); else alert(msg); return; } if(onSave) onSave(v); }); }
  }
  function open(prefill, cb, options){
    ensure(); if(!modal) return; onSave = cb;
    // aplica max sob demanda (ex.: equipe 1000, recurso 300)
    if(options && typeof options.max==='number'){ MAX = Math.max(0, Math.floor(options.max)); }
    try { if(txt) txt.maxLength = MAX; } catch(_){ }
    txt.value = prefill || ''; updateCnt();
    if(options && options.title && tituloEl){ tituloEl.textContent = options.title; }
    if(bsModal) bsModal.show(); else modal.style.display='block'; txt.focus();
  }
  function close(){ if(bsModal) bsModal.hide(); else if(modal) modal.style.display='none'; }
  window.modalNotasEquipe = { open, close };
})();
