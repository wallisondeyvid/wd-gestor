// Migrado de public/js/filiais-module.js
(function(){
  function reclasificarFiliaisOrfas(principalId){ try { if(!principalId) return; const principalRow=document.querySelector(`tr.unidade-row[data-id="${principalId}"]`); if(!principalRow) return; const candidatas=Array.from(document.querySelectorAll('tr.unidade-row'))
      .filter(tr=>tr.getAttribute('data-id')!==principalId)
      .filter(tr=>!tr.classList.contains('filial-row'))
      .filter(tr=>tr.getAttribute('data-unidade-principal-id')===principalId); if(!candidatas.length) return; candidatas.forEach(tr=>{ tr.classList.add('filial-row',`filial-of-${principalId}`); tr.style.display='none'; }); } catch(e){ console.warn('[filiais] reclassificar falhou', e); } }
  function toggleFiliais(principalId, forceState){ if(!principalId) return; reclasificarFiliaisOrfas(principalId); let filialRows=document.querySelectorAll(`.filial-of-${principalId}`); if(!filialRows.length){ const candidatas=Array.from(document.querySelectorAll('tr.unidade-row'))
      .filter(tr=>tr.getAttribute('data-id')!==principalId)
      .filter(tr=>tr.getAttribute('data-unidade-principal-id')===principalId); if(candidatas.length){ candidatas.forEach(tr=>{ tr.classList.add('filial-row',`filial-of-${principalId}`); tr.style.display='none'; }); filialRows=document.querySelectorAll(`.filial-of-${principalId}`); } }
    if(!filialRows.length) return; const btn=document.querySelector(`button.toggle-filiais[data-principal-id="${principalId}"]`); let expandir=forceState; if(expandir===undefined){ const algumVisivel=Array.from(filialRows).some(r=>r.style.display!== 'none'); expandir=!algumVisivel; }
    filialRows.forEach(r=> r.style.display=expandir?'':'none'); if(btn){ btn.textContent=expandir?'-':'+'; btn.setAttribute('aria-expanded', expandir?'true':'false'); btn.title=expandir?'Recolher filiais':'Mostrar filiais'; } }
  function inicializarFiliaisOrfas(){ const principais=Array.from(document.querySelectorAll('tr.unidade-row[data-principal="true"]')); principais.forEach(tr=>{ reclasificarFiliaisOrfas(tr.getAttribute('data-id')); }); }
  function bind(){ inicializarFiliaisOrfas(); document.querySelectorAll('button.toggle-filiais').forEach(btn=> btn.addEventListener('click', ()=> toggleFiliais(btn.getAttribute('data-principal-id')))); document.addEventListener('click', e=>{ const origem=e.target.closest('button.toggle-filiais'); if(!origem) return; toggleFiliais(origem.getAttribute('data-principal-id')); }); }
  document.addEventListener('DOMContentLoaded', bind); if (document.readyState !== 'loading') setTimeout(bind,0); window.FiliaisModule={ toggleFiliais }; console.debug('[filiais-module] carregado');
})();
