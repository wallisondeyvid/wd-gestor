// public/js/utils/datepicker-init.js
(function () {
  function ensureISOFromBR(str) {
    if (!window.Dates) return '';
    return Dates.toISODateString(str || '');
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.flatpickr) return;

    // Usa o locale pt carregado pelo arquivo flatpickr.pt.js
    const locale = (flatpickr.l10ns && flatpickr.l10ns.pt) ? flatpickr.l10ns.pt : {
      firstDayOfWeek: 1,
      weekdays: { shorthand: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], longhand: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'] },
      months: {
        shorthand: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
        longhand: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
      }
    };

    // Todos os inputs de data que terão calendário
    document.querySelectorAll('.date-br[data-calendar="flatpickr"]').forEach(function (el) {
      // Se o valor inicial estiver em dd/mm/aaaa, normaliza para ISO antes
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(el.value)) {
        const iso = ensureISOFromBR(el.value);
        if (iso) el.value = iso;
      }

    // ...Flatpickr removido: inicialização global via dates-global.js
    });
  });
})();
