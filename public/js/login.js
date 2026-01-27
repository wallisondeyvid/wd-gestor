document.addEventListener('DOMContentLoaded', () => {
  // Validação do formulário
  const form = document.querySelector('form');
  form.addEventListener('submit', (event) => {
    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value.trim();
    if (!usuario || !senha) {
      event.preventDefault();
      alert('Por favor, preencha ambos os campos: Usuário e Senha.');
    }
  });

  // Foco/limpeza conforme parâmetro de erro (?erro=usuario|senha)
  (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // STUB TEMPORÁRIO login: delega para nova versão em gestor
      (function loadDelegated(){
        const script = document.createElement('script');
        script.src = '/gestor/js/pages/login.js';
        script.defer = true;
        document.head.appendChild(script);
      })();