// Migrated from public/js/utils/datepicker-init.js
(function () {
  const DEBUG_FLAGS = ['WDG_DEBUG_UNIDADES', 'WDG_DEBUG_GESTOR_ASSETS'];
  const debugLog = (...args) => window.WDGDebug?.log?.(DEBUG_FLAGS, 'debug', ...args);
  // Se o inicializador canônico de datas já está carregado, não duplicar
  if (window.__WDDatesCanonicalLoaded) {
    debugLog('[datepicker-init] Abortando: dates-global canônico já está ativo.');
    return;
  }
  function ensureISOFromBR(str) { if (!window.Dates) return ''; return Dates.toISODateString(str || ''); }
  function initFlatpickrs() {
    if (!window.flatpickr) { debugLog('[datepicker-init] flatpickr indisponível no momento'); return; }
    const locale = (flatpickr.l10ns && flatpickr.l10ns.pt) ? flatpickr.l10ns.pt : {
      firstDayOfWeek: 1,
      weekdays: { shorthand: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], longhand: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'] },
      months: { shorthand: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], longhand: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] }
    };

    // Seleciona qualquer input com classe date-br (mesmo que não tenha data-calendar)
    const candidates = Array.from(document.querySelectorAll('input.date-br'));
    if (!candidates.length) {
      debugLog('[datepicker-init] nenhum input.date-br encontrado');
      return;
    }
    candidates.forEach(function (el) {
      // Adiciona atributo data-calendar se não existir (auto-upgrade)
      if (!el.hasAttribute('data-calendar')) el.setAttribute('data-calendar', 'flatpickr');
      // Não converter para ISO aqui — manter padrão BR na UI para consistência
      // Evitar dupla inicialização: checar propriedade oficial do flatpickr
      if (el._flatpickr) return;
      try {
        flatpickr(el, {
          dateFormat: 'd/m/Y',
          locale: locale,
          allowInput: true,
          disableMobile: true,
          onReady: function(selectedDates, dateStr, instance){
            try {
              const cal = instance && instance.calendarContainer;
              if (!cal) return;
              const monthSel = cal.querySelector('.flatpickr-monthDropdown-months');
              if (monthSel && !monthSel.getAttribute('name')) monthSel.setAttribute('name','flatpickr-month');
              const yearInp = cal.querySelector('input.numInput.cur-year');
              if (yearInp && !yearInp.getAttribute('name')) yearInp.setAttribute('name','flatpickr-year');
            } catch(_){ }
          }
        });
      } catch (err) {
        console.error('[datepicker-init] falha ao inicializar flatpickr em', el.id || el.name, err);
      }
    });
  }
  function schedule(){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initFlatpickrs, { once:true });
    } else {
      setTimeout(initFlatpickrs, 0);
    }
  }
  schedule();
  // Re-inicializa quando loader disparar evento após fallback ou locale load
  document.addEventListener('flatpickrReady', () => {
    initFlatpickrs();
  });
  // Expor função para reexecução manual
  window.WDInitDatepickers = initFlatpickrs;
})();