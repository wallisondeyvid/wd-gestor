// public/js/utils/dates.js
(function () {
  function onlyDigits(s) { return (s || '').replace(/\D/g, ''); }

  // Aceita "dd/mm/aaaa" ou "yyyy-mm-dd" -> Date (UTC meia-noite)
  function parse(input) {
    if (!input) return null;
    if (input instanceof Date) return input;
    const s = String(input).trim();
    let d, m, y;

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) [d, m, y] = s.split('/').map(n => parseInt(n, 10));
    else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) [y, m, d] = s.split('-').map(n => parseInt(n, 10));
    else return null;

    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
    return date;
  }

  function toISODateString(input) {
    const d = (input instanceof Date) ? input : parse(input);
    if (!d) return '';
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatToBR(input) {
    const d = (input instanceof Date) ? input : parse(input);
    if (!d) return '';
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function wireBRInput(el) {
    el.addEventListener('input', () => {
      let v = onlyDigits(el.value).slice(0, 8);
      if (v.length >= 5) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
      else if (v.length >= 3) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
      el.value = v;
    });

    el.addEventListener('blur', () => {
      const name = el.dataset.dateName || el.name;
      // helper para achar o hidden correspondente
      const findHidden = () => (name && el.form)
        ? el.form.querySelector(`input[type="hidden"][name="${name}"]`)
        : null;

      const iso = toISODateString(el.value);

      if (!iso) {
        el.classList.add('is-invalid');
        // evita enviar ISO antigo:
        const hidden = findHidden();
        if (hidden) hidden.disabled = true; // (ou hidden.remove())
        return;
      }

      el.classList.remove('is-invalid');
      el.value = formatToBR(iso);

      let hidden = findHidden();
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = name;
        el.form.appendChild(hidden);
      }
      hidden.disabled = false; // garante participação no submit
      hidden.value = iso;
    });
  }

  // selector por padrão pega .date-br, mas também dá suporte a padrões antigos
  function init(selector = '.date-br, .mask-date, [data-mask="date"]') {
    document.querySelectorAll(selector).forEach(wireBRInput);

    document.querySelectorAll('form').forEach(form => {
      if (form.dataset.datesWired === '1') return; // já configurado
      form.dataset.datesWired = '1';

      form.addEventListener('submit', () => {
        form.querySelectorAll(selector).forEach(el => {
          const iso = toISODateString(el.value);
          if (!iso) return; // não mexe em nada se inválido

          const name = el.dataset.dateName || el.name;
          if (!name) return;

          let hidden = form.querySelector(`input[type="hidden"][name="${name}"]`);
          if (!hidden) {
            hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = name;
            form.appendChild(hidden);
          }
          hidden.disabled = false;
          hidden.value = iso;

          // evita enviar duplicado
          if (el.name === name) el.removeAttribute('name');
        });
      });
    });
  }

  window.Dates = { parse, toISODateString, formatToBR, init };
})();
