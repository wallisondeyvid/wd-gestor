// Migrated from public/js/masks.js (original full content)
// Implementações de máscaras e validações para o sistema
(function() {
  'use strict';
  // Importante: reutiliza o objeto já existente em window.WDMasks (definido antes em utils-masks.js)
  // para não apagar funções como formatCPF/formatCNPJ usadas por outras páginas.
  const WDMasks = (window.WDMasks = window.WDMasks || {});
  function onlyDigits(value) { return String(value || '').replace(/\D/g, ''); }
  function formatCurrency(value) { const num = parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0; return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function parseCurrency(value) { return String(value).replace(/[^\d.,]/g, '').replace(',', '.'); }
  function formatTituloEleitor(value) {
    const digits = onlyDigits(value).slice(0, 12);
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  }
  function isValidTituloEleitor(value) { const digits = onlyDigits(value); return digits.length === 12; }
  // ====== TÍTULO DE ELEITOR (implementação cursor-safe) ======
  // Problema original: estratégia anterior reposicionava o cursor apenas pelo delta de tamanho
  // entre valor antigo e novo após inserir espaços, ocasionando perda/apagamento aparente de dígitos
  // quando o usuário digitava no meio (efeito de "sobrepor números").
  // Nova abordagem: contar a quantidade de dígitos (excluindo separadores) à esquerda do cursor
  // (digitsBefore). Após reformatar, percorremos o novo valor até reencontrar a mesma contagem de
  // dígitos e posicionamos o cursor ali. Isso preserva a intenção de edição sem sobrescrever.
  WDMasks.bindTituloEleitorMask = function(element) {
    if (!element) return;
    if (element.__tituloEleitorMaskApplied) return; // evita múltiplos binds
    function applyMask() {
      const oldRaw = element.value;
      const cursorPos = element.selectionStart || oldRaw.length;
      const digitsBefore = oldRaw.slice(0, cursorPos).replace(/\D/g, '').length;
      const newValue = formatTituloEleitor(oldRaw);
      if (oldRaw !== newValue) {
        element.value = newValue;
        let newPos = 0, count = 0;
        while (newPos < newValue.length && count < digitsBefore) {
          if (/\d/.test(newValue[newPos])) count++;
          newPos++;
        }
        try { element.setSelectionRange(newPos, newPos); } catch(_){ }
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
    element.__tituloEleitorMaskApplied = true;
  };
  function formatZonaEleitoral(value) { return onlyDigits(value).slice(0, 4); }
  WDMasks.bindZonaEleitoralMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatZonaEleitoral(oldValue); if (oldValue !== newValue) { element.value = newValue; } } element.addEventListener('input', applyMask); if (element.value) applyMask(); };
  function formatSecaoEleitoral(value) { return onlyDigits(value).slice(0, 4); }
  WDMasks.bindSecaoEleitoralMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatSecaoEleitoral(oldValue); if (oldValue !== newValue) { element.value = newValue; } } element.addEventListener('input', applyMask); if (element.value) applyMask(); };
  function formatCNH(value) { const digits = onlyDigits(value).slice(0, 11); return digits; }
  function isValidCNH(value) { const cnh = onlyDigits(value); if (cnh.length !== 11) return false; if (/^(\d)\1{10}$/.test(cnh)) return false; const d = cnh.split('').map(Number); let s1 = 0; for (let i = 0, p = 9; i < 9; i++, p--) { s1 += d[i] * p; } let r1 = s1 % 11; const dv10 = r1 >= 10 ? 0 : r1; const dsc = r1 >= 10 ? 2 : 0; let s2 = 0; for (let i = 0, p = 1; i < 9; i++, p++) { s2 += d[i] * p; } let x = (s2 % 11) - dsc; if (x < 0) x += 11; const dv11 = x >= 10 ? 0 : x; return d[9] === dv10 && d[10] === dv11; }
  WDMasks.bindCnhMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatCNH(oldValue); if (oldValue !== newValue) { element.value = newValue; } } function validate() { const isValid = !element.value || isValidCNH(element.value); element.classList.toggle('is-valid', isValid && element.value.trim() !== ''); element.classList.toggle('is-invalid', !isValid && element.value.trim() !== ''); } element.addEventListener('input', applyMask); element.addEventListener('blur', validate); if (element.value) applyMask(); };
  function formatCPF(value) { const digits = onlyDigits(value).slice(0, 11); if (digits.length <= 3) return digits; if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`; if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`; return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`; }
  function isValidCPF(value) { const cpf = onlyDigits(value); if (cpf.length !== 11) return false; if (/^(\d)\1{10}$/.test(cpf)) return false; const calc = (base, f) => { let sum = 0; for (let i = 0; i < base.length; i++) sum += parseInt(base[i]) * (f - i); const mod = sum % 11; return mod < 2 ? 0 : 11 - mod; }; const d1 = calc(cpf.slice(0, 9), 10); if (d1 !== parseInt(cpf[9])) return false; const d2 = calc(cpf.slice(0, 10), 11); return d2 === parseInt(cpf[10]); }
  WDMasks.bindCPFMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatCPF(oldValue); if (oldValue !== newValue) { const cursorPos = element.selectionStart || oldValue.length; element.value = newValue; const diff = newValue.length - oldValue.length; const newCursorPos = Math.max(0, cursorPos + diff); setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0); } } function validate() { const isValid = !element.value || isValidCPF(element.value); element.classList.toggle('is-valid', isValid && element.value.trim() !== ''); element.classList.toggle('is-invalid', !isValid && element.value.trim() !== ''); } element.addEventListener('input', applyMask); element.addEventListener('blur', validate); if (element.value) applyMask(); };
  function formatCNPJ(value) { const digits = onlyDigits(value).slice(0, 14); if (digits.length <= 2) return digits; if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`; if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`; if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`; return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`; }
  WDMasks.bindCNPJMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatCNPJ(oldValue); if (oldValue !== newValue) { const cursorPos = element.selectionStart || oldValue.length; element.value = newValue; const diff = newValue.length - oldValue.length; const newCursorPos = Math.max(0, cursorPos + diff); setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0); } } element.addEventListener('input', applyMask); if (element.value) applyMask(); };
  function formatPIS(value) { const digits = onlyDigits(value).slice(0, 11); if (digits.length <= 3) return digits; if (digits.length <= 8) return `${digits.slice(0, 3)}.${digits.slice(3)}`; return `${digits.slice(0, 3)}.${digits.slice(3, 8)}.${digits.slice(8)}`; }
  function isValidPIS(value) { const pis = onlyDigits(value); if (pis.length !== 11) return false; let sum = 0; const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; for (let i = 0; i < 10; i++) { sum += parseInt(pis[i]) * weights[i]; } const remainder = sum % 11; const digit = remainder < 2 ? 0 : 11 - remainder; return parseInt(pis[10]) === digit; }
  WDMasks.bindPisMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatPIS(oldValue); if (oldValue !== newValue) { const cursorPos = element.selectionStart || oldValue.length; element.value = newValue; const diff = newValue.length - oldValue.length; const newCursorPos = Math.max(0, cursorPos + diff); setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0); } } function validate() { const isValid = !element.value || isValidPIS(element.value); element.classList.toggle('is-valid', isValid && element.value.trim() !== ''); element.classList.toggle('is-invalid', !isValid && element.value.trim() !== ''); } element.addEventListener('input', applyMask); element.addEventListener('blur', validate); if (element.value) applyMask(); };
  function formatCTPS(value) { const digits = onlyDigits(value); if (digits.length <= 7) return digits; return `${digits.slice(0, 7)}-${digits.slice(7, 10)}`; }
  WDMasks.bindCtpsMask = function(element) { if (!element) return; function applyMask() { const oldValue = element.value; const newValue = formatCTPS(oldValue); if (oldValue !== newValue) { const cursorPos = element.selectionStart || oldValue.length; element.value = newValue; const diff = newValue.length - oldValue.length; const newCursorPos = Math.max(0, cursorPos + diff); setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0); } } element.addEventListener('input', applyMask); if (element.value) applyMask(); };
  WDMasks.formatMoeda = function(value) { const num = parseFloat(parseCurrency(value)) || 0; return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  // ================= MOEDA (digit a digit - interpreta sempre como centavos) =================
  // Ex.: usuário digita 1 2 2 2 => R$ 12,22
  // Só define se ainda não existir (evita sobrescrever caso já tenha sido injetado por outra versão)
  if (!WDMasks.bindMoedaMask) {
    WDMasks.bindMoedaMask = function(element){
      if(!element || element.__moedaMaskApplied) return;
      function onlyDigitsLocal(v){ return String(v||'').replace(/\D/g,''); }
      function formatFromDigits(digits){
        digits = String(digits||'').replace(/\D/g,'');
        if(!digits) return '';
        while(digits.length < 3) digits = '0' + digits; // garante pelo menos 0,00
        const cents = digits.slice(-2);
        let intPart = digits.slice(0,-2).replace(/^0+/,'') || '0';
        intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
        return 'R$ ' + intPart + ',' + cents;
      }
      function applyMask(){
        const rawDigits = onlyDigitsLocal(element.value);
        const formatted = formatFromDigits(rawDigits);
        if(element.value !== formatted){
          element.value = formatted;
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
      element.dataset.maskSource = 'digit-cent';
      // Expor helpers para debug rápido
      if(!WDMasks.__debugMoeda){
        WDMasks.__debugMoeda = { formatFromDigits };
      }
      console.debug('[MOEDA] digit-cent mask aplicada no elemento id=', element.id);
    };
    console.log('[MASKS][MOEDA] bindMoedaMask (digit-cent) registrado em gestor/core/masks.js');
  } else {
    console.log('[MASKS][MOEDA] bindMoedaMask já existente – não sobrescrito');
  }
  // Reatribui (por clareza) e loga merge
  // Garante que funções críticas existam mesmo se utils-masks.js ainda não tiver sido carregado
  WDMasks.onlyDigits = WDMasks.onlyDigits || onlyDigits;
  WDMasks.formatCPF = WDMasks.formatCPF || formatCPF;
  WDMasks.formatCNPJ = WDMasks.formatCNPJ || formatCNPJ;
  WDMasks.formatPIS = WDMasks.formatPIS || formatPIS;
  WDMasks.isValidCPF = WDMasks.isValidCPF || isValidCPF;
  WDMasks.isValidCNPJ = WDMasks.isValidCNPJ || function(v){ const d = onlyDigits(v); if (d.length!==14||/(^\d)\1{13}$/.test(d)) return false; let t=0,p=5; for(let i=0;i<12;i++){t+=parseInt(d[i])*p; p=p===2?9:p-1;} let r=t%11; const d1=r<2?0:11-r; t=0; p=6; for(let i=0;i<13;i++){t+=parseInt(d[i])*p; p=p===2?9:p-1;} r=t%11; const d2=r<2?0:11-r; return parseInt(d[12])===d1 && parseInt(d[13])===d2; };
  WDMasks.isValidPIS = WDMasks.isValidPIS || isValidPIS;
  WDMasks.isValidCNH = WDMasks.isValidCNH || isValidCNH;
  WDMasks.setValidity = WDMasks.setValidity || function(el, valid){
    if(!el) return;
    const val = String(el.value || '').trim();
    if (!val) {
      // Campo vazio: não marca como inválido automaticamente; limpa feedback visual
      el.classList.remove('is-valid','is-invalid');
      return;
    }
    el.classList.toggle('is-valid', !!valid);
    el.classList.toggle('is-invalid', !valid);
  };
  WDMasks.applyPhoneMask = WDMasks.applyPhoneMask || function(el){
    if(!el) return;
    if (el.__wd_phoneMaskBound) return; // evitar múltiplos binds
    const onInput = () => {
      const old = el.value;
      const start = el.selectionStart || 0;
      const digitsBefore = old.substring(0,start).replace(/\D/g,'');
      const raw = onlyDigits(old).slice(0,12);
      let out = raw;
      if (raw.startsWith('0800')) {
        if (raw.length <= 4) out = raw;
        else if (raw.length <= 7) out = `${raw.slice(0,4)}-${raw.slice(4)}`;
        else out = `${raw.slice(0,4)}-${raw.slice(4,7)}-${raw.slice(7,11)}`;
      } else {
        if (raw.length>2){
          out = `(${raw.slice(0,2)}) ${raw.slice(2)}`;
          if (raw.length>6) out = `(${raw.slice(0,2)}) ${raw.length===11?raw.slice(2,7):raw.slice(2,6)}-${raw.length===11?raw.slice(7):raw.slice(6)}`;
        }
      }
      if (old !== out) {
        el.value = out;
        // recalcular posição do cursor de acordo com quantidade de dígitos antes
        let newPos = 0, count=0;
        for (let i=0;i<out.length && count<digitsBefore.length;i++) {
          if (/\d/.test(out[i])) count++;
          newPos = i+1;
        }
        try { el.setSelectionRange(newPos,newPos); } catch(_){}
      }
    };
    el.addEventListener('input', onInput);
    if (el.value) onInput();
    el.__wd_phoneMaskBound = true;
  };
  WDMasks.isValidEmail = WDMasks.isValidEmail || function(email){
    if(!email) return true;
    const t=String(email).trim();
    if(!t) return true;
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i.test(t);
  };
  // Fornece validateEmail se ainda não existir (usado pelas páginas)
  WDMasks.validateEmail = WDMasks.validateEmail || function(el, { onBlur = false } = {}){
    if (!el) return true;
    const t = String(el.value || '').trim();
    if (!t) { el.classList.remove('is-valid','is-invalid'); return true; }
    const ok = WDMasks.isValidEmail(t);
    if (onBlur) {
      // No blur: aplicar feedback completo
      WDMasks.setValidity(el, ok);
    } else {
      // Enquanto digita: só marcar inválido; não marcar verde ainda
      if (!ok) { el.classList.add('is-invalid'); el.classList.remove('is-valid'); }
      else { el.classList.remove('is-invalid'); el.classList.remove('is-valid'); }
    }
    return ok;
  };

  // ---------- URL (Site) fallback ----------
  WDMasks.formatURL = WDMasks.formatURL || function(v){
    if (!v) return '';
    let url = String(v).trim().replace(/^\s+/, '');
    if (!/^https?:\/\//i.test(url)) url = (url.startsWith('www.') ? 'https://' : 'https://') + url;
    return url;
  };
  WDMasks.isValidURL = WDMasks.isValidURL || function(u){
    if (!u) return true;
    try {
      const o = new URL(u);
      const protoOk = (o.protocol === 'http:' || o.protocol === 'https:');
      const host = o.hostname || '';
      const hasDot = host.includes('.');
      const tld = host.split('.').pop() || '';
      const tldOk = tld.length >= 2; // evita validar 'https://h' ou 'https://localhost'
      return protoOk && hasDot && tldOk;
    } catch { return false; }
  };
  WDMasks.applyURLMask = WDMasks.applyURLMask || function(inputEl){
    if (!inputEl) return;
    if (inputEl.__wd_urlMaskBound) return;
    const apply = () => {
      const old = inputEl.value;
      const neo = WDMasks.formatURL(old);
      if (old !== neo) {
        const pos = inputEl.selectionStart || 0;
        inputEl.value = neo;
        const diff = neo.length - old.length;
        try { inputEl.setSelectionRange(Math.max(0,pos+diff), Math.max(0,pos+diff)); } catch(_){}
      }
        // Durante a digitação: só marcar inválido quando realmente inválido; não marcar verde ainda
        const trimmed = String(neo).trim();
        if (!trimmed) {
          inputEl.classList.remove('is-valid','is-invalid');
        } else {
          const ok = WDMasks.isValidURL(trimmed);
          if (!ok) {
            inputEl.classList.add('is-invalid');
            inputEl.classList.remove('is-valid');
          } else {
            // válido enquanto digita: manter neutro (sem verde) até o blur
            inputEl.classList.remove('is-invalid');
            inputEl.classList.remove('is-valid');
          }
        }
    };
      inputEl.addEventListener('input', apply);
      inputEl.addEventListener('blur', () => {
        const v = String(inputEl.value||'').trim();
        WDMasks.setValidity(inputEl, WDMasks.isValidURL(v));
      });
    if (inputEl.value) apply();
    inputEl.__wd_urlMaskBound = true;
  };
  window.WDMasks = WDMasks; console.log('[MASKS] WDMasks (merge) carregado com sucesso (funções críticas asseguradas)');
})();
