// Stub simples para compatibilidade: carrega versão moderna e nada mais.
(function(){
  const script = document.createElement('script');
  script.src = '/gestor/js/pages/recursos.js';
  script.defer = true;
  script.onload = ()=> console.debug('[recursos stub] versão moderna carregada');
  script.onerror = ()=> console.warn('[recursos stub] falha ao carregar /gestor/js/pages/recursos.js');
  document.head.appendChild(script);
})();