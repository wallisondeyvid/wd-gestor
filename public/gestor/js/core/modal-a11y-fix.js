// modal-a11y-fix.js - Correção de aria-hidden persistente em modais abertas
// Problema observado: elementos .modal permanecem com aria-hidden="true" mesmo após exibidos
// causando warning: "Blocked aria-hidden on an element because its descendant retained focus".
// Causa provável: abertura manual via display:block ou manipulações antes do evento show.bs.modal
// Solução: listeners globais que removem aria-hidden em show e revalidam após transições.
(function(){
  if (window.__ModalA11yFixApplied) return; window.__ModalA11yFixApplied = true;
  function sanitizeModal(modal){
    if(!modal) return; const attr = modal.getAttribute('aria-hidden');
    if(attr === 'true' && modal.classList.contains('show')){ modal.setAttribute('aria-hidden','false'); }
  }
  document.addEventListener('show.bs.modal', ev => {
    // bootstrap coloca style / classes; garantimos aria-hidden coerente
    const m = ev.target; requestAnimationFrame(()=> sanitizeModal(m));
  });
  document.addEventListener('shown.bs.modal', ev => {
    const m = ev.target; sanitizeModal(m);
    // Garante que modais anteriores ocultas continuem com aria-hidden=true
    document.querySelectorAll('.modal').forEach(other => {
      if(other !== m){ if(other.classList.contains('show')) other.setAttribute('aria-hidden','false'); else other.setAttribute('aria-hidden','true'); }
    });
  });
  // Observa mutações para detectar toggles via display:block sem eventos bootstrap
  const obs = new MutationObserver(list => {
    list.forEach(rec => {
      if(rec.type === 'attributes' && rec.attributeName === 'class'){
        const el = rec.target; if(el.classList && el.classList.contains('modal')) sanitizeModal(el);
      }
    });
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal').forEach(m => { obs.observe(m, { attributes:true }); });
  });
  // Caso modais sejam injetadas dinamicamente
  const rootObs = new MutationObserver(list => {
    list.forEach(m => { m.addedNodes && m.addedNodes.forEach(n => { if(n.nodeType===1 && n.classList && n.classList.contains('modal')) obs.observe(n, { attributes:true }); }); });
  });
  rootObs.observe(document.documentElement, { childList:true, subtree:true });
})();