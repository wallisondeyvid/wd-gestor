// Loader com fallback para flatpickr
// Inclua este script ANTES de datepicker-init.js e dates-global.js
(function(){
	const DEBUG_FLAGS = ['WDG_DEBUG_UNIDADES', 'WDG_DEBUG_GESTOR_ASSETS'];
  // Inverte a prioridade: CDN primeiro (evita erro sintaxe se bundle local estiver corrompido em cache)
  const CDN_SRC   = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js';
  const LOCAL_SRC = '/gestor/js/vendor/flatpickr.min.js';
  const LOCAL_LOCALE = '/gestor/js/vendor/flatpickr.pt.js';
  const CDN_LOCALE   = 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/l10n/pt.js';
  const STATE = { triedLocal:false, injected:false };

  function log(msg, level='log'){
    const tag = '[flatpickr-loader]';
    if (level==='error') return console.error(tag, msg);
    if (level==='warn') return console.warn(tag, msg);
    return window.WDGDebug?.log?.(DEBUG_FLAGS, level === 'debug' ? 'debug' : 'info', tag, msg);
  }

  function alreadyPresent(){
    return typeof window.flatpickr === 'function';
  }

  function inject(src, origin){
    if (STATE.injected) return;
    STATE.injected = true;
    const s = document.createElement('script');
    s.src = src + '?v=' + Date.now(); // cache-bust leve
    s.async = false;
    s.onload = function(){
      if (typeof window.flatpickr === 'function') {
        log('Carregado com sucesso de: ' + origin);
        // Agora garantir locale pt
        ensureLocale(function(){
          document.dispatchEvent(new Event('flatpickrReady'));
        });
      } else {
        log('Script carregado mas flatpickr não disponível após load ('+origin+').', 'warn');
        if (origin === 'local') {
          STATE.injected = false; // libera nova injeção
          inject(CDN_SRC, 'cdn');
        }
      }
    };
    s.onerror = function(){
      log('Falha ao carregar: ' + origin, 'error');
      if (origin==='local'){ // tenta CDN
        STATE.injected = false; // permite nova injeção
        inject(CDN_SRC, 'cdn');
      }
    };
    document.head.appendChild(s);
  }

  function ensureLocale(done){
    try {
      if (window.flatpickr?.l10ns?.pt) { done && done(); return; }
      const tag = document.createElement('script');
      tag.src = (STATE.triedLocal ? CDN_LOCALE : LOCAL_LOCALE) + '?v=' + Date.now();
      tag.async = false;
      tag.onload = function(){
        if (!window.flatpickr?.l10ns?.pt && !STATE.triedLocal) {
          // fallback para CDN se local não registrou
          STATE.triedLocal = true;
          const cdnTag = document.createElement('script');
          cdnTag.src = CDN_LOCALE + '?v=' + Date.now();
          cdnTag.onload = () => done && done();
          cdnTag.onerror = () => done && done();
          document.head.appendChild(cdnTag);
          return;
        }
        done && done();
      };
      tag.onerror = function(){
        if (!STATE.triedLocal) {
          STATE.triedLocal = true; // tenta CDN
          const cdnTag = document.createElement('script');
            cdnTag.src = CDN_LOCALE + '?v=' + Date.now();
            cdnTag.onload = () => done && done();
            cdnTag.onerror = () => done && done();
            document.head.appendChild(cdnTag);
            return;
        }
        done && done();
      };
      document.head.appendChild(tag);
    } catch(e){ done && done(); }
  }

  function start(){
    if (alreadyPresent()){
      log('flatpickr já presente (não reinjetado)');
      return;
    }
  inject(CDN_SRC, 'cdn-first');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
