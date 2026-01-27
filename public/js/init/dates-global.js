// public/js/init/dates-global.js
(function () {
  if(window.__WDDatesCanonicalLoaded){
    console.log('[dates-global][legacy] Detectado canonical já carregado – abortando legacy.');
    return; // evita segunda inicialização
  }
  function addFooter(instance) {
    const cal = instance.calendarContainer;
    if (cal && !cal.querySelector('.flatpickr-footer')) {
      const footer = document.createElement('div');
      footer.className = 'flatpickr-footer';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'flatpickr-clear';
      clear.textContent = 'Limpar';
      clear.addEventListener('click', () => {
        instance.clear();
        instance.close();
        instance._input.dispatchEvent(new Event('blur'));
      });
      footer.appendChild(clear);
      cal.appendChild(footer);
    }
  }

  function enhance(root = document) {
    const inputs = root.querySelectorAll('input.date-br, input.mask-date, input[data-mask="date"]');
    inputs.forEach(el => {
      el.classList.add('date-br');
      if (el.__flatpickr) return;
      
      // Verifica se é um campo de funcionário (não permite datas futuras)
      const isFuncionarioField = el.closest('[id^="aba"]') !== null || 
                                el.id.includes('extra_') || 
                                el.name.includes('data_') ||
                                el.id === 'data_nascimento' ||
                                el.id === 'data_admissao' ||
                                el.id === 'data_termino';
      
      // Exceção: permite datas futuras para validade da CNH e data de início de benefícios
      const isCNHValidity = el.id === 'extra_cnh_validade' || el.name === 'cnh_validade';
      const isBeneficioInicio = el.id === 'beneficio_data_inicio' || el.name === 'beneficio_data_inicio';
      
      const allowFuture = el.hasAttribute('data-allow-future');
      flatpickr(el, {
        locale: 'pt',
        dateFormat: 'd/m/Y',
        allowInput: false, // impede digitação manual
        disableMobile: true,
        // Se explicitamente marcado com data-allow-future, não limitar maxDate
        maxDate: (!allowFuture && (isFuncionarioField && !isCNHValidity && !isBeneficioInicio)) ? new Date() : undefined,
        onReady: addFooter
      });
        // Validação customizada: só acusa erro se houver valor preenchido e não for data válida
        el.addEventListener('blur', function () {
          const val = el.value.trim();
          if (!val) {
            el.classList.remove('is-invalid');
            return;
          }
          // Aceita números enquanto digita
          if (/^\d{1,2}$|^\d{1,2}\/\d{1,2}$/.test(val)) {
            el.classList.remove('is-invalid');
            return;
          }
          // Validação de data completa robusta
          const match = val.match(/^([0-3]\d)\/([0-1]\d)\/(\d{4})$/);
          if (!match) {
            el.classList.add('is-invalid');
            return;
          }
          const d = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          const y = parseInt(match[3], 10);
          const dt = new Date(y, m - 1, d);
          // Verifica se a data existe (ex: 31/02/2025 não existe)
          if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
            el.classList.remove('is-invalid');
          } else {
            el.classList.add('is-invalid');
          }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.Dates?.init();
    enhance();
    const mo = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) enhance(n);
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();
