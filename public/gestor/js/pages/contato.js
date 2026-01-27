// contato.js (namespace gestor)
// Página estática de contato - mantido simples para futura expansão (ex: formulário)
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    // Placeholder para futura lógica: tracking, carregamento dinâmico, etc.
    console.debug('[gestor] contato.js carregado');
    const voltar = document.querySelector('a.btn.btn-outline-primary');
    if (voltar) {
      voltar.addEventListener('click', () => {
        console.debug('[gestor] Navegando de volta ao login');
      });
    }
  });
})();
