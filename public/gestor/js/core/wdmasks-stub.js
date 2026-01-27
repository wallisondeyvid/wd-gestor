// Stub mínimo de WDMasks para evitar warnings de métodos ausentes
// Substituir por implementação completa quando disponível.
(function(){
  if (window.WDMasks) return; // já existe implementação real
  window.WDMasks = {
    bindMoedaMask(el){
      if(!el) return;
      const format = (v)=>{
        if(v==null||v==='') return '';
        const digits = String(v).replace(/[^0-9]/g,'');
        if(!digits) return '';
        const n = (Number(digits)/100).toFixed(2);
        return n.replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
      };
      const apply=()=>{ const old=el.value; const raw = old.replace(/[^0-9]/g,''); el.value = format(raw); };
      el.addEventListener('input', apply);
      if(el.value) apply();
    },
    bindTituloEleitorMask(){}, bindZonaEleitoralMask(){}, bindSecaoEleitoralMask(){}, bindCnhMask(){},
    bindCPFMask(){}, bindCNPJMask(){}, bindPisMask(){}, bindPorcentagemMask(){},
    bindAgenciaMask(){}, bindContaMask(){},
    formatMoeda(v){
      const raw = String(v||'').replace(/[^0-9]/g,'');
      if(!raw) return '';
      const n = (Number(raw)/100).toFixed(2);
      return n.replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    }
  };
  console.log('[WDMasks stub] Registrado stub mínimo.');
})();
