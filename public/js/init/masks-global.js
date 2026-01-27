// public/js/init/masks-global.js
// Inicialização automática de máscaras baseada em classes CSS

(function() {
  // Legacy stub: se a versão canonical (gestor/core/masks-global.js) já inicializou, aborta.
  if (window.__WDMasksCanonicalLoaded) {
    console.info('[MASKS-GLOBAL][legacy] Cancelado: versão canonical já carregada.');
    return;
  }
  'use strict';

  // Aguardar o carregamento do masks.js
  function initMasks() {
    if (!window.WDMasks) {
      // Se WDMasks ainda não carregou, tenta novamente em 100ms
      setTimeout(initMasks, 100);
      return;
    }

    const WDMasks = window.WDMasks;
    console.log('[MASKS-GLOBAL] WDMasks disponível:', !!WDMasks);
    console.log('[MASKS-GLOBAL] Funções disponíveis:', {
      bindTituloEleitorMask: !!WDMasks?.bindTituloEleitorMask,
      bindZonaEleitoralMask: !!WDMasks?.bindZonaEleitoralMask,
      bindSecaoEleitoralMask: !!WDMasks?.bindSecaoEleitoralMask,
      bindCnhMask: !!WDMasks?.bindCnhMask
    });

    // Inicializar máscaras baseado em classes CSS
    function applyMasks() {
      console.log('[MASKS-GLOBAL] Aplicando máscaras...');

      // Título de Eleitor
      const tituloEleitorElements = document.querySelectorAll('.titulo-eleitor-mask');
      console.log('[MASKS-GLOBAL] Elementos título eleitor encontrados:', tituloEleitorElements.length);
      tituloEleitorElements.forEach((el, index) => {
        if (!el.__maskApplied) {
          console.log(`[MASKS-GLOBAL] Aplicando máscara título eleitor no elemento ${index} (id: ${el.id}):`, el);
          WDMasks.bindTituloEleitorMask(el);
          el.__maskApplied = true;
        }
      });

      // Zona Eleitoral
      const zonaEleitoralElements = document.querySelectorAll('.zona-eleitoral-mask');
      console.log('[MASKS-GLOBAL] Elementos zona eleitoral encontrados:', zonaEleitoralElements.length);
      zonaEleitoralElements.forEach((el, index) => {
        if (!el.__maskApplied) {
          console.log(`[MASKS-GLOBAL] Aplicando máscara zona eleitoral no elemento ${index} (id: ${el.id}):`, el);
          WDMasks.bindZonaEleitoralMask(el);
          el.__maskApplied = true;
        }
      });

      // Seção Eleitoral
      const secaoEleitoralElements = document.querySelectorAll('.secao-eleitoral-mask');
      console.log('[MASKS-GLOBAL] Elementos seção eleitoral encontrados:', secaoEleitoralElements.length);
      secaoEleitoralElements.forEach((el, index) => {
        if (!el.__maskApplied) {
          console.log(`[MASKS-GLOBAL] Aplicando máscara seção eleitoral no elemento ${index} (id: ${el.id}):`, el);
          WDMasks.bindSecaoEleitoralMask(el);
          el.__maskApplied = true;
        }
      });

      // CNH
      const cnhElements = document.querySelectorAll('.cnh-mask');
      console.log('[MASKS-GLOBAL] Elementos CNH encontrados:', cnhElements.length);
      cnhElements.forEach((el, index) => {
        if (!el.__maskApplied) {
          console.log(`[MASKS-GLOBAL] Aplicando máscara CNH no elemento ${index} (id: ${el.id}):`, el);
          WDMasks.bindCnhMask(el);
          el.__maskApplied = true;
        }
      });

      // CPF
      document.querySelectorAll('.cpf-mask').forEach(el => {
        console.log('[MASKS-GLOBAL] Elemento CPF encontrado:', el?.id);
        if (!el.__maskApplied) {
          console.log('[MASKS-GLOBAL] Aplicando máscara CPF em:', el?.id);
          WDMasks.bindCPFMask(el);
          el.__maskApplied = true;
        }
      });

      // CNPJ
      document.querySelectorAll('.cnpj-mask').forEach(el => {
        console.log('[MASKS-GLOBAL] Elemento CNPJ encontrado:', el?.id);
        if (!el.__maskApplied) {
          WDMasks.bindCNPJMask(el);
          el.__maskApplied = true;
        }
      });

      // PIS
      document.querySelectorAll('.pis-mask').forEach(el => {
        console.log('[MASKS-GLOBAL] Elemento PIS encontrado:', el?.id);
        if (!el.__maskApplied) {
          WDMasks.bindPisMask(el);
          el.__maskApplied = true;
        }
      });

      // Telefone
      document.querySelectorAll('.telefone-mask').forEach(el => {
        console.log('[MASKS-GLOBAL] Elemento telefone encontrado:', el?.id);
        if(!el.__maskApplied){
          if(window.Validators?.aplicarMascaraTelefone){
            const handler = ()=> window.Validators.aplicarMascaraTelefone(el);
            el.addEventListener('input', handler);
            // Aplicar imediatamente se já tem valor
            handler();
            el.__maskApplied = true;
          }
          // Validação em blur
          el.addEventListener('blur', ()=>{
            try {
              const ok = window.Validators?.validarTelefoneValor ? window.Validators.validarTelefoneValor(el.value) : true;
              el.classList.toggle('is-valid', ok && el.value.trim()!== '');
              el.classList.toggle('is-invalid', !ok && el.value.trim()!== '');
            } catch(err){ console.warn('[MASKS-GLOBAL][Telefone] erro validar', err); }
          });
        }
      });

      // Email
      document.querySelectorAll('.email-mask').forEach(el => {
        console.log('[MASKS-GLOBAL] Elemento email encontrado:', el?.id);
        if(!el.__emailApplied){
          el.addEventListener('blur', ()=>{
            try {
              const ok = window.Validators?.validarEmailValor ? window.Validators.validarEmailValor(el.value) : true;
              el.classList.toggle('is-valid', ok && el.value.trim()!== '');
              el.classList.toggle('is-invalid', !ok && el.value.trim()!== '');
            } catch(err){ console.warn('[MASKS-GLOBAL][Email] erro validar', err); }
          });
          if(el.value){
            const ok = window.Validators?.validarEmailValor ? window.Validators.validarEmailValor(el.value) : true;
            el.classList.toggle('is-valid', ok && el.value.trim()!== '');
            el.classList.toggle('is-invalid', !ok && el.value.trim()!== '');
          }
          el.__emailApplied = true;
        }
      });

      // Moeda (salvaguarda: função pode não existir ainda)
      document.querySelectorAll('.moeda-mask').forEach(el => {
        if (!el.__maskApplied) {
          if (typeof WDMasks.bindMoedaMask === 'function') {
            try { WDMasks.bindMoedaMask(el); } catch(err){ console.warn('[MASKS-GLOBAL][Moeda] erro ao aplicar', err); }
          } else if (typeof WDMasks.formatMoeda === 'function') {
            // fallback simples: formatar on blur
            el.addEventListener('blur', ()=>{ try { el.value = WDMasks.formatMoeda(el.value); } catch(_){} });
          } else {
            console.debug('[MASKS-GLOBAL] bindMoedaMask não disponível');
          }
          el.__maskApplied = true;
        }
      });

      // Porcentagem
      document.querySelectorAll('.porcentagem-mask').forEach(el => {
        if (!el.__maskApplied) {
          WDMasks.bindPorcentagemMask(el);
          el.__maskApplied = true;
        }
      });

      // Agência
      document.querySelectorAll('.agencia-mask').forEach(el => {
        if (!el.__maskApplied) {
          WDMasks.bindAgenciaMask(el);
          el.__maskApplied = true;
        }
      });

      // Conta
      document.querySelectorAll('.conta-mask').forEach(el => {
        if (!el.__maskApplied) {
          WDMasks.bindContaMask(el);
          el.__maskApplied = true;
        }
      });
    }

    // Aplicar máscaras na carga inicial
  applyMasks();
  // Expor reapply para debug manual
  window.__reapplyMasks = applyMasks;

    // Aplicar máscaras em elementos dinâmicos (usando MutationObserver)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Verificar se o nó adicionado ou seus descendentes têm classes de máscara
              const elementsWithMasks = node.querySelectorAll ?
                node.querySelectorAll('[class*="mask"]') : [];

              // Se o próprio nó tem classe de máscara, incluí-lo
              if (node.classList && Array.from(node.classList).some(cls => cls.includes('mask'))) {
                elementsWithMasks.push(node);
              }

              if (elementsWithMasks.length > 0) {
                applyMasks();
              }
            }
          });
        }
      });
    });

    // Observar mudanças no DOM
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[MASKS-GLOBAL] Inicialização automática de máscaras ativada (legacy)');
    window.__WDMasksLegacyLoaded = true;
  }

  // Iniciar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMasks);
  } else {
    initMasks();
  }

})();
