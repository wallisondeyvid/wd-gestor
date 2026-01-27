// Wrapper único que delega para a versão consolidada do módulo gestor
(function loadPerfilGestor(){
  if (document.getElementById('wd-perfil-loader')) return;
  const tag = document.createElement('script');
  tag.id = 'wd-perfil-loader';
  tag.src = '/gestor/js/pages/perfil.js';
  tag.defer = true;
  tag.onerror = () => console.warn('[perfil wrapper] Falha ao carregar /gestor/js/pages/perfil.js');
  document.head.appendChild(tag);
})();