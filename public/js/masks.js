// public/js/masks.js
// Implementações de máscaras e validações para o sistema

(function() {
  'use strict';

  const WDMasks = {};

  // === UTILITÁRIOS ===
  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatCurrency(value) {
    const num = parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function parseCurrency(value) {
    return String(value).replace(/[^\d.,]/g, '').replace(',', '.');
  }

  // === TÍTULO DE ELEITOR ===
  function formatTituloEleitor(value) {
    const digits = onlyDigits(value).slice(0, 12);
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }

  function isValidTituloEleitor(value) {
    const digits = onlyDigits(value);
    return digits.length === 12;
  }

  WDMasks.bindTituloEleitorMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatTituloEleitor(oldValue);
      if (oldValue !== newValue) {
        const cursorPos = element.selectionStart || oldValue.length;
        element.value = newValue;
        const diff = newValue.length - oldValue.length;
        const newCursorPos = Math.max(0, cursorPos + diff);
        setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
      }
    }

    function validate() {
      const isValid = !element.value || isValidTituloEleitor(element.value);
      element.classList.toggle('is-valid', isValid && element.value.trim() !== '');
      element.classList.toggle('is-invalid', !isValid && element.value.trim() !== '');
    }

    element.addEventListener('input', applyMask);
    element.addEventListener('blur', validate);
    if (element.value) applyMask();
  };

  // === ZONA ELEITORAL ===
  function formatZonaEleitoral(value) {
    return onlyDigits(value).slice(0, 4);
  }

  WDMasks.bindZonaEleitoralMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatZonaEleitoral(oldValue);
      if (oldValue !== newValue) {
        element.value = newValue;
      }
    }

    element.addEventListener('input', applyMask);
    if (element.value) applyMask();
  };

  // === SEÇÃO ELEITORAL ===
  function formatSecaoEleitoral(value) {
    return onlyDigits(value).slice(0, 4);
  }

  WDMasks.bindSecaoEleitoralMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatSecaoEleitoral(oldValue);
      if (oldValue !== newValue) {
        element.value = newValue;
      }
    }

    element.addEventListener('input', applyMask);
    if (element.value) applyMask();
  };

  // === CNH ===
  function formatCNH(value) {
    const digits = onlyDigits(value).slice(0, 11);
    return digits;
  }

  function isValidCNH(value) {
    const cnh = onlyDigits(value);
    if (cnh.length !== 11) return false;

    // Verificar se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cnh)) return false;

    const d = cnh.split('').map(Number);

    // Primeiro dígito verificador (DV10)
    let s1 = 0;
    for (let i = 0, p = 9; i < 9; i++, p--) {
      s1 += d[i] * p;
    }
    let r1 = s1 % 11;
    const dv10 = r1 >= 10 ? 0 : r1;
    const dsc = r1 >= 10 ? 2 : 0;

    // Segundo dígito verificador (DV11)
    let s2 = 0;
    for (let i = 0, p = 1; i < 9; i++, p++) {
      s2 += d[i] * p;
    }
    let x = (s2 % 11) - dsc;
    if (x < 0) x += 11;
    const dv11 = x >= 10 ? 0 : x;

    return d[9] === dv10 && d[10] === dv11;
  }

  WDMasks.bindCnhMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatCNH(oldValue);
      if (oldValue !== newValue) {
        element.value = newValue;
      }
    }

    function validate() {
      const isValid = !element.value || isValidCNH(element.value);
      element.classList.toggle('is-valid', isValid && element.value.trim() !== '');
      element.classList.toggle('is-invalid', !isValid && element.value.trim() !== '');
    }

    element.addEventListener('input', applyMask);
    element.addEventListener('blur', validate);
    if (element.value) applyMask();
  };

  // === CPF ===
  function formatCPF(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  function isValidCPF(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    const calc = (base, f) => {
      let sum = 0;
      for (let i = 0; i < base.length; i++) sum += parseInt(base[i]) * (f - i);
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };

    const d1 = calc(cpf.slice(0, 9), 10);
    if (d1 !== parseInt(cpf[9])) return false;
    const d2 = calc(cpf.slice(0, 10), 11);
    return d2 === parseInt(cpf[10]);
  }

  WDMasks.bindCPFMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatCPF(oldValue);
      if (oldValue !== newValue) {
        const cursorPos = element.selectionStart || oldValue.length;
        element.value = newValue;
        const diff = newValue.length - oldValue.length;
        const newCursorPos = Math.max(0, cursorPos + diff);
        setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
      }
    }

    function validate() {
      const isValid = !element.value || isValidCPF(element.value);
      element.classList.toggle('is-valid', isValid && element.value.trim() !== '');
      element.classList.toggle('is-invalid', !isValid && element.value.trim() !== '');
    }

    element.addEventListener('input', applyMask);
    element.addEventListener('blur', validate);
    if (element.value) applyMask();
  };

  // === CNPJ ===
  function formatCNPJ(value) {
    const digits = onlyDigits(value).slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }

  WDMasks.bindCNPJMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatCNPJ(oldValue);
      if (oldValue !== newValue) {
        const cursorPos = element.selectionStart || oldValue.length;
        element.value = newValue;
        const diff = newValue.length - oldValue.length;
        const newCursorPos = Math.max(0, cursorPos + diff);
        setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
      }
    }

    element.addEventListener('input', applyMask);
    if (element.value) applyMask();
  };

  // === PIS ===
  function formatPIS(value) {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 8)}.${digits.slice(8)}`;
  }

  function isValidPIS(value) {
    const pis = onlyDigits(value);
    if (pis.length !== 11) return false;

    let sum = 0;
    const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (let i = 0; i < 10; i++) {
      sum += parseInt(pis[i]) * weights[i];
    }

    const remainder = sum % 11;
    const digit = remainder < 2 ? 0 : 11 - remainder;

    return parseInt(pis[10]) === digit;
  }

  WDMasks.bindPisMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatPIS(oldValue);
      if (oldValue !== newValue) {
        const cursorPos = element.selectionStart || oldValue.length;
        element.value = newValue;
        const diff = newValue.length - oldValue.length;
        const newCursorPos = Math.max(0, cursorPos + diff);
        setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
      }
    }

    function validate() {
      const isValid = !element.value || isValidPIS(element.value);
      element.classList.toggle('is-valid', isValid && element.value.trim() !== '');
      element.classList.toggle('is-invalid', !isValid && element.value.trim() !== '');
    }

    element.addEventListener('input', applyMask);
    element.addEventListener('blur', validate);
    if (element.value) applyMask();
  };

  // === CTPS ===
  function formatCTPS(value) {
    const digits = onlyDigits(value);
    if (digits.length <= 7) return digits;
    return `${digits.slice(0, 7)}-${digits.slice(7, 10)}`;
  }

  WDMasks.bindCtpsMask = function(element) {
    if (!element) return;

    function applyMask() {
      const oldValue = element.value;
      const newValue = formatCTPS(oldValue);
      if (oldValue !== newValue) {
        const cursorPos = element.selectionStart || oldValue.length;
        element.value = newValue;
        const diff = newValue.length - oldValue.length;
        const newCursorPos = Math.max(0, cursorPos + diff);
        setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
      }
    }

    element.addEventListener('input', applyMask);
    if (element.value) applyMask();
  };

  // === MOEDA ===
  // formatMoeda: mantém compatibilidade (recebe número ou string já interpretável) -> usado em partes do sistema
  WDMasks.formatMoeda = function(value) {
    const num = parseFloat(parseCurrency(value)) || 0;
    return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Nova máscara digit a digit (interpreta sempre o valor como CENTAVOS)
  // Ex.: usuário digita 1 2 2 2 => R$ 12,22 (ao invés de R$ 1.222,00)
  WDMasks.bindMoedaMask = function(element){
    if(!element || element.__moedaMaskApplied) return;

    function onlyDigitsLocal(v){ return String(v||'').replace(/\D/g,''); }

    function formatFromDigits(digits){
      digits = String(digits||'').replace(/\D/g,'');
      if(!digits) return '';
      // Garante pelo menos 3 posições (0 + 2 centavos) para facilitar digitação inicial
      while(digits.length < 3) digits = '0' + digits; // Ex.: '5' -> '005'
      const cents = digits.slice(-2);
      let intPart = digits.slice(0,-2).replace(/^0+/,'') || '0';
      intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
      return 'R$ ' + intPart + ',' + cents;
    }

    function applyMask(){
      const rawDigits = onlyDigitsLocal(element.value);
      const formatted = formatFromDigits(rawDigits);
      if(element.value !== formatted){
        const posOld = element.selectionStart || formatted.length;
        element.value = formatted;
        // Cursor heurístico: coloca no fim (simplificação suficiente p/ campo monetário)
        try { element.setSelectionRange(element.value.length, element.value.length); } catch(_){ }
      }
    }

    function validate(){
      const rawDigits = onlyDigitsLocal(element.value);
      const valido = !rawDigits || parseInt(rawDigits,10) > 0; // > 0 centavos
      element.classList.toggle('is-valid', valido && rawDigits);
      element.classList.toggle('is-invalid', !valido && rawDigits);
    }

    element.addEventListener('input', applyMask);
    element.addEventListener('blur', validate);
    if(element.value) applyMask();
    element.__moedaMaskApplied = true;
  };

  // Expor globalmente
  window.WDMasks = WDMasks;
  console.log('[MASKS] WDMasks carregado com sucesso');

})();
