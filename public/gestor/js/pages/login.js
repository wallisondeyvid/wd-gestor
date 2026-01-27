/* =========================================================================
 * LOGIN — Cópia de public/js/login.js
 * ========================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Validação do formulário (robusta para diferentes ids/nomes)
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', (event) => {
      const emailEl = document.getElementById('email')
        || document.getElementById('usuario')
        || document.querySelector('input[name="email"]');
      const senhaEl = document.getElementById('senha')
        || document.querySelector('input[type="password"][name="senha"]')
        || document.querySelector('input[type="password"]');
      const emailVal = (emailEl && typeof emailEl.value === 'string') ? emailEl.value.trim() : '';
      const senhaVal = (senhaEl && typeof senhaEl.value === 'string') ? senhaEl.value.trim() : '';
      if (!emailVal || !senhaVal) {
        event.preventDefault();
        alert('Por favor, preencha ambos os campos: E-mail e Senha.');
      }
    });
  }

  // Tratamento de foco por parâmetro de erro (compatível com id/nome diferentes)
  (function(){
    try {
      const params = new URLSearchParams(window.location.search);
      const erro = params.get('erro');
      const emailEl = document.getElementById('email')
        || document.getElementById('usuario')
        || document.querySelector('input[name="email"]');
      const senhaEl = document.getElementById('senha')
        || document.querySelector('input[type="password"][name="senha"]')
        || document.querySelector('input[type="password"]');
      if (erro === 'usuario') { if (emailEl) emailEl.value = ''; if (senhaEl) senhaEl.value = ''; emailEl && emailEl.focus(); }
      else if (erro === 'senha') { if (senhaEl) senhaEl.value = ''; senhaEl && senhaEl.focus(); }
    } catch(e){}
  })();

  // Mostrar/ocultar senha (se presente)
  const toggleBtn = document.querySelector('.toggle-pass');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      const input = document.getElementById('senha')
        || document.querySelector('input[type="password"][name="senha"]')
        || document.querySelector('input[type="password"]');
      const icon = e.currentTarget.querySelector('i');
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      if (icon) {
        icon.classList.toggle('bi-eye', showing);
        icon.classList.toggle('bi-eye-slash', !showing);
      }
    });
  }
  // Sem alterações visuais automáticas: respeita o CSS original da página
});
