/* Feedback Widget (Drawer toggle)
   - Não é modal (não cria overlay)
   - Alterna abrir/fechar ao clicar no launcher
   - Animação via CSS (transform + opacity)
*/

(function () {
  function safeJson(resp) {
    return resp.json().catch(function () { return {}; });
  }

  function initChat(root) {
    var drawer = root.querySelector('.wdg-feedback-drawer');
    var chat = root.querySelector('[data-chat="1"]');
    if (!drawer || !chat) return null;

    var headerAvatar = drawer.querySelector('.wdg-feedback-avatar');

    var log = chat.querySelector('[data-chat-log]');
    var quick = chat.querySelector('[data-chat-quick]');
    var form = chat.querySelector('[data-chat-compose]');
    var input = chat.querySelector('[data-chat-input]');
    var fileInput = chat.querySelector('[data-chat-file]');
    if (!log || !quick || !form || !input || !fileInput) return null;

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }

    function autoResizeInput() {
      // funciona para textarea; se não for, não faz nada
      if (!input || String(input.tagName || '').toLowerCase() !== 'textarea') return;
      try {
        var cs = window.getComputedStyle(input);
        var lineH = parseFloat(cs.lineHeight) || 18;
        var padTop = parseFloat(cs.paddingTop) || 0;
        var padBottom = parseFloat(cs.paddingBottom) || 0;
        var borderTop = parseFloat(cs.borderTopWidth) || 0;
        var borderBottom = parseFloat(cs.borderBottomWidth) || 0;

        var maxLines = 5;
        var minH = 36;
        var maxH = Math.round((lineH * maxLines) + padTop + padBottom + borderTop + borderBottom);

        input.style.height = 'auto';
        var next = clamp(input.scrollHeight, minH, maxH);
        input.style.height = next + 'px';
        input.style.overflowY = (input.scrollHeight > maxH) ? 'auto' : 'hidden';
      } catch (_e) {
        /* noop */
      }
    }

    var basePath = String(root.getAttribute('data-module-base') || '/gestor');
    var assetVer = String(root.getAttribute('data-asset-ver') || '');

    var endpointCreate = String(root.getAttribute('data-endpoint-create') || '/api/feedback');
    var endpointUploadTpl = String(root.getAttribute('data-endpoint-upload') || '/api/feedback/:feedback_id/anexo');
    var endpointMyList = String(root.getAttribute('data-endpoint-my-list') || '/api/feedback/meus');
    var endpointMyDetailTpl = String(root.getAttribute('data-endpoint-my-detail') || '/api/feedback/meus/:feedback_id');

    var state = {
      booted: false,
      flow: 'home',
      tipo: null,
      bug: { modulo: '', tentativa: '', ocorreu: '' },
      pendingAttachment: null,
      lastCreatedId: null
    };

    function iconUrl(name) {
      var q = assetVer ? ('?v=' + encodeURIComponent(assetVer)) : '';
      return basePath + '/images/' + name + q;
    }

    function avatarUrl(fileName) {
      return iconUrl(fileName);
    }

    function avatarFileForTipo(tipo) {
      var t = String(tipo || '').toLowerCase();
      if (t === 'duvida' || t === 'critica') return 'avatarposicao2.png';
      if (t === 'bug' || t === 'sugestao') return 'avatarposicao3.png';
      if (t === 'elogio') return 'avatarposicao4.png';
      return 'avatarposicao1.png';
    }

    function setHeaderAvatarByFile(fileName) {
      if (!headerAvatar) return;
      try {
        headerAvatar.src = avatarUrl(fileName);
      } catch (_e) { /* noop */ }
    }

    function setHeaderAvatarIntro() {
      setHeaderAvatarByFile('avatarposicao1.png');
    }

    function setHeaderAvatarForTipo(tipo) {
      setHeaderAvatarByFile(avatarFileForTipo(tipo));
    }

    function setHeaderAvatarConfirm() {
      setHeaderAvatarByFile('avatarposicao4.png');
    }

    function scrollToBottom() {
      try { log.scrollTop = log.scrollHeight; } catch (_e) { /* noop */ }
    }

    function addMessage(direction, text) {
      var row = document.createElement('div');
      row.className = 'wdg-feedback-msg ' + (direction === 'out' ? 'wdg-feedback-msg--out' : 'wdg-feedback-msg--in');
      var bubble = document.createElement('div');
      bubble.className = 'wdg-feedback-bubble';
      bubble.textContent = String(text || '');
      row.appendChild(bubble);
      log.appendChild(row);
      scrollToBottom();
    }

    function setQuickButtons(items) {
      quick.innerHTML = '';
      if (!items || !items.length) return;
      for (var i = 0; i < items.length; i++) {
        (function (item) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'wdg-feedback-quick-btn';
          btn.setAttribute('data-quick', item.id || '');
          if (item.icon) {
            var img = document.createElement('img');
            img.className = 'wdg-feedback-quick-icon';
            img.src = item.icon;
            img.alt = '';
            img.width = 18;
            img.height = 18;
            btn.appendChild(img);
          }
          btn.appendChild(document.createTextNode(item.label));
          btn.addEventListener('click', function () {
            if (typeof item.onClick === 'function') item.onClick();
          });
          quick.appendChild(btn);
        })(items[i]);
      }
    }

    function setComposer(opts) {
      opts = opts || {};
      input.placeholder = opts.placeholder || 'Mensagem';
      input.disabled = !!opts.disabled;
      form.querySelector('[data-chat-send]').disabled = !!opts.disabled;
      autoResizeInput();
    }

    function resetToHome() {
      state.flow = 'home';
      state.tipo = null;
      state.bug = { modulo: '', tentativa: '', ocorreu: '' };
      state.pendingAttachment = null;
      state.lastCreatedId = null;

      setHeaderAvatarIntro();

      addMessage('in', 'Escolha uma opção para começar:');
      setQuickButtons([
        { id: 'bug', label: 'Bug', icon: iconUrl('bug.png'), onClick: function () { startFlow('bug'); } },
        { id: 'sugestao', label: 'Sugestão', icon: iconUrl('sugestao.png'), onClick: function () { startFlow('sugestao'); } },
        { id: 'duvida', label: 'Dúvida', icon: iconUrl('duvida.png'), onClick: function () { startFlow('duvida'); } },
        { id: 'critica', label: 'Crítica', icon: iconUrl('critica.png'), onClick: function () { startFlow('critica'); } },
        { id: 'elogio', label: 'Elogio', icon: iconUrl('elogio.png'), onClick: function () { startFlow('elogio'); } },
        { id: 'track', label: 'Acompanhar meus feedbacks', icon: iconUrl('acompfeedback.png'), onClick: function () { startTrack(); } }
      ]);
      setComposer({ placeholder: 'Mensagem', disabled: true });
    }

    function startFlow(tipo) {
      state.tipo = tipo;

      // Avatar do assistente no topo muda conforme o tipo escolhido
      setHeaderAvatarForTipo(tipo);

      if (tipo === 'bug') {
        state.flow = 'bug.modulo';
        addMessage('out', 'Bug');
        addMessage('in', 'Em qual módulo ou página ocorreu?');
        setQuickButtons([
          {
            id: 'page',
            label: 'Página atual',
            onClick: function () {
              var url = (window && window.location && window.location.href) ? window.location.href : '';
              if (url) {
                input.value = url;
                input.focus();
              }
            }
          }
        ]);
        setComposer({ placeholder: 'Ex.: Escalas / Ausências (ou cole a URL)', disabled: false });
        input.focus();
        return;
      }

      state.flow = 'generic.msg';
      addMessage('out', labelForTipo(tipo));
      addMessage('in', promptForTipo(tipo));
      setQuickButtons([]);
      setComposer({ placeholder: 'Escreva aqui...', disabled: false });
      input.focus();
    }

    function openFilePicker() {
      try { fileInput && fileInput.click(); } catch (_e) { /* noop */ }
    }

    function labelForTipo(tipo) {
      if (tipo === 'sugestao') return 'Sugestão';
      if (tipo === 'duvida') return 'Dúvida';
      if (tipo === 'critica') return 'Crítica';
      if (tipo === 'elogio') return 'Elogio';
      return 'Bug';
    }

    function promptForTipo(tipo) {
      if (tipo === 'sugestao') return 'Manda sua sugestão. O que você gostaria de ver melhorado?';
      if (tipo === 'duvida') return 'Qual é a sua dúvida? Me descreva o contexto.';
      if (tipo === 'critica') return 'Pode mandar sua crítica (com detalhes do que aconteceu e onde).';
      if (tipo === 'elogio') return 'Que bom! Conta pra mim o que você gostou.';
      return 'Me conta o que aconteceu.';
    }

    function buildMessagePayload() {
      var url = (window && window.location && window.location.href) ? window.location.href : '';
      return {
        tipo: state.tipo,
        mensagem: '',
        contexto: {
          url: url,
          timezone: (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
        }
      };
    }

    function normalizeApiEnvelope(obj) {
      if (!obj || typeof obj !== 'object') return { ok: false, data: null, id: null, message: '' };
      var ok = !!(obj.success || obj.ok || obj.created);
      var data = obj.data || obj.result || obj.item || null;
      var id = obj.id || (data && (data._id || data.id)) || null;
      var message = obj.message || obj.error || obj.msg || '';
      return { ok: ok, data: data, id: id, message: message };
    }

    function createFeedback(mensagem) {
      var payload = buildMessagePayload();
      payload.mensagem = mensagem;

      setComposer({ disabled: true });

      return fetch(endpointCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (resp) { return safeJson(resp).then(function (j) { return { resp: resp, json: j }; }); })
        .then(function (pack) {
          var env = normalizeApiEnvelope(pack.json);
          if (!pack.resp.ok || !env.ok) {
            throw new Error(env.message || 'Não foi possível enviar agora.');
          }
          state.lastCreatedId = env.id;
          return env;
        });
    }

    function uploadAttachment(feedbackId, file) {
      if (!feedbackId || !file) return Promise.resolve(true);
      var url = endpointUploadTpl.replace(':feedback_id', encodeURIComponent(String(feedbackId)));
      var fd = new FormData();
      // tenta nomes comuns para aumentar compatibilidade
      fd.append('anexo', file);
      fd.append('file', file);
      fd.append('attachment', file);
      return fetch(url, { method: 'POST', body: fd })
        .then(function (resp) { return resp.ok; })
        .catch(function () { return false; });
    }

    function finishAfterCreate(env, didUpload) {
      var id = env && env.id ? String(env.id) : '';
      // Confirmação: usa avatar de confirmação/elogio
      setHeaderAvatarConfirm();
      if (id) {
        addMessage('in', 'Pronto! Recebi seu feedback. Protocolo: ' + id + (didUpload === false ? '\n(Obs.: não consegui anexar a imagem, mas o texto foi enviado.)' : ''));
      } else {
        addMessage('in', 'Pronto! Recebi seu feedback.');
      }

      setQuickButtons([
        { id: 'track', label: 'Acompanhar meus feedbacks', icon: iconUrl('acompfeedback.png'), onClick: function () { startTrack(); } },
        { id: 'new', label: 'Novo feedback', onClick: function () { resetToHome(); } }
      ]);
      setComposer({ placeholder: 'Mensagem', disabled: true });
    }

    function startTrack() {
      // Fluxo de acompanhamento: avatar padrão (apresentação)
      setHeaderAvatarIntro();
      addMessage('out', 'Acompanhar meus feedbacks');
      addMessage('in', 'Carregando seus feedbacks...');
      setQuickButtons([]);
      setComposer({ disabled: true });

      fetch(endpointMyList, { headers: { 'Accept': 'application/json' } })
        .then(function (resp) { return safeJson(resp).then(function (j) { return { resp: resp, json: j }; }); })
        .then(function (pack) {
          var env = normalizeApiEnvelope(pack.json);
          var items = env.data;
          if (!pack.resp.ok) throw new Error(env.message || 'Não consegui carregar a lista.');
          if (!Array.isArray(items)) {
            // alguns endpoints retornam { data: { items: [...] } }
            if (items && Array.isArray(items.items)) items = items.items;
            else if (items && Array.isArray(items.rows)) items = items.rows;
            else items = [];
          }

          addMessage('in', items.length ? 'Aqui estão seus feedbacks:' : 'Você ainda não tem feedbacks enviados.');
          if (!items.length) {
            setQuickButtons([{ id: 'new', label: 'Novo feedback', onClick: function () { resetToHome(); } }]);
            return;
          }

          setQuickButtons(items.slice(0, 8).map(function (it, idx) {
            var fid = String(it._id || it.id || it.feedback_id || idx);
            var tipo = String(it.tipo || it.type || '').toLowerCase();
            var status = String(it.status || it.situacao || '').toLowerCase();
            var label = '#' + fid + (tipo ? ' · ' + tipo : '') + (status ? ' · ' + status : '');
            return {
              id: fid,
              label: label,
              onClick: function () { openMyDetail(fid); }
            };
          }).concat([{ id: 'back', label: 'Voltar', onClick: function () { resetToHome(); } }]));
        })
        .catch(function (e) {
          addMessage('in', (e && e.message) ? e.message : 'Falha ao carregar.');
          setQuickButtons([
            { id: 'retry', label: 'Tentar de novo', onClick: function () { startTrack(); } },
            { id: 'back', label: 'Voltar', onClick: function () { resetToHome(); } }
          ]);
        });
    }

    function openMyDetail(feedbackId) {
      var url = endpointMyDetailTpl.replace(':feedback_id', encodeURIComponent(String(feedbackId)));
      addMessage('out', 'Detalhar #' + feedbackId);
      addMessage('in', 'Carregando detalhes...');
      setQuickButtons([]);
      setComposer({ disabled: true });
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function (resp) { return safeJson(resp).then(function (j) { return { resp: resp, json: j }; }); })
        .then(function (pack) {
          var env = normalizeApiEnvelope(pack.json);
          if (!pack.resp.ok) throw new Error(env.message || 'Não consegui abrir.');
          var d = env.data || {};
          var tipo = d.tipo || d.type || '';
          setHeaderAvatarForTipo(tipo);
          var status = d.status || d.situacao || '';
          var msg = d.mensagem || d.texto || d.descricao || '';
          var resumo = '';
          if (tipo) resumo += 'Tipo: ' + tipo + '\n';
          if (status) resumo += 'Status: ' + status + '\n';
          if (msg) resumo += '\n' + msg;
          addMessage('in', resumo || 'Sem detalhes adicionais.');
          setQuickButtons([
            { id: 'back', label: 'Voltar', onClick: function () { startTrack(); } },
            { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
          ]);
        })
        .catch(function (e) {
          addMessage('in', (e && e.message) ? e.message : 'Falha ao abrir.');
          setQuickButtons([
            { id: 'back', label: 'Voltar', onClick: function () { startTrack(); } },
            { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
          ]);
        });
    }

    function onUserSend(text) {
      var t = String(text || '').trim();
      // Só permite enviar vazio na etapa final do bug (para enviar com/sem print)
      if (!t && state.flow !== 'bug.anexo') return;

      if (t) addMessage('out', t);
      input.value = '';
      autoResizeInput();

      // BUG flow
      if (state.flow === 'bug.modulo') {
        state.bug.modulo = t;
        state.flow = 'bug.tentativa';
        addMessage('in', 'O que você estava tentando fazer?');
        setQuickButtons([]);
        setComposer({ placeholder: 'Descreva o objetivo...', disabled: false });
        return;
      }
      if (state.flow === 'bug.tentativa') {
        state.bug.tentativa = t;
        state.flow = 'bug.ocorreu';
        addMessage('in', 'O que aconteceu?');
        setComposer({ placeholder: 'Descreva o problema...', disabled: false });
        return;
      }
      if (state.flow === 'bug.ocorreu') {
        state.bug.ocorreu = t;
        state.flow = 'bug.anexo';
        addMessage('in', 'Quer anexar um print? (opcional)');
        setQuickButtons([
          { id: 'attach', label: 'Anexar print', onClick: function () { openFilePicker(); } },
          { id: 'skip', label: 'Pular', onClick: function () { finalizeBug(null); } }
        ]);
        // Evita confusão: envio é pelos botões rápidos
        setComposer({ placeholder: 'Mensagem', disabled: true });
        return;
      }
      if (state.flow === 'bug.anexo') {
        // enviar agora (com ou sem anexo)
        finalizeBug(state.pendingAttachment);
        return;
      }

      // Generic
      if (state.flow === 'generic.msg') {
        var msg = t;
        createFeedback(msg)
          .then(function (env) { finishAfterCreate(env, true); })
          .catch(function (e) {
            addMessage('in', (e && e.message) ? e.message : 'Falha ao enviar.');
            setQuickButtons([
              { id: 'retry', label: 'Tentar de novo', onClick: function () { state.flow = 'generic.msg'; setComposer({ disabled: false }); } },
              { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
            ]);
            setComposer({ disabled: false });
          });
        return;
      }
    }

    function finalizeBug(file) {
      var message =
        'BUG\n' +
        'Módulo/Página: ' + (state.bug.modulo || '-') + '\n' +
        'Tentativa: ' + (state.bug.tentativa || '-') + '\n' +
        'Ocorreu: ' + (state.bug.ocorreu || '-');

      createFeedback(message)
        .then(function (env) {
          if (!file) return finishAfterCreate(env, true);
          return uploadAttachment(env.id, file).then(function (ok) {
            finishAfterCreate(env, ok);
          });
        })
        .catch(function (e) {
          addMessage('in', (e && e.message) ? e.message : 'Falha ao enviar.');
          setQuickButtons([
            { id: 'retry', label: 'Tentar de novo', onClick: function () { state.flow = 'bug.anexo'; setComposer({ disabled: true }); } },
            { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
          ]);
          setComposer({ disabled: true });
        })
        .finally(function () {
          state.pendingAttachment = null;
          try { fileInput.value = ''; } catch (_e) { /* noop */ }
        });
    }

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      // limpa para permitir re-selecionar o mesmo arquivo
      try { fileInput.value = ''; } catch (_e0) { /* noop */ }

      // Anexo só é aceito na etapa final do bug
      if (state.flow !== 'bug.anexo') return;
      if (!f) return;

      state.pendingAttachment = f;
      addMessage('in', 'Imagem anexada: ' + f.name + '.');
      setQuickButtons([
        { id: 'replace', label: 'Trocar print', onClick: function () { openFilePicker(); } },
        { id: 'remove', label: 'Remover print', onClick: function () { state.pendingAttachment = null; addMessage('in', 'Ok, sem print.'); setQuickButtons([{ id: 'attach', label: 'Anexar print', onClick: function () { openFilePicker(); } }, { id: 'skip', label: 'Pular', onClick: function () { finalizeBug(null); } }]); } },
        { id: 'send', label: 'Enviar agora', onClick: function () { onUserSend(''); } }
      ]);
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      onUserSend(input.value);
    });

    // WhatsApp-like: Enter envia, Shift+Enter quebra linha
    input.addEventListener('keydown', function (ev) {
      if (!ev) return;
      var key = ev.key || ev.code;
      if (key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        onUserSend(input.value);
      }
    });

    input.addEventListener('input', function () {
      autoResizeInput();
    });

    function boot() {
      if (state.booted) return;
      state.booted = true;
      root.setAttribute('data-chat-ui', '1');
      chat.hidden = false;
      // inicia com a saudação do header (se existir)
      var greet = root.querySelector('[data-feedback-greeting]');
      addMessage('in', greet ? greet.textContent.trim() : 'Olá! Como posso ajudar?');
      resetToHome();
      autoResizeInput();
    }

    return { boot: boot, resetToHome: resetToHome };
  }

  function initWidget(root) {
    if (!root) return;

    var button = root.querySelector('.wdg-feedback-fab');
    var drawer = root.querySelector('.wdg-feedback-drawer');
    if (!button || !drawer) return;

    var closeTimeoutId = null;
    var chatApi = initChat(root);

    var rafId = 0;

    function isDrawerOpen() {
      return button.getAttribute('aria-expanded') === 'true';
    }

    function getSafeTopPx() {
      // Portal do Morador: barra com habitação + pesquisa
      var portalTopbar = document.querySelector('.pm-topbar');
      if (portalTopbar && portalTopbar.getClientRects && portalTopbar.getClientRects().length) {
        var pr = portalTopbar.getBoundingClientRect();
        if (pr.height > 0) return Math.max(0, Math.round(pr.bottom));
      }

      // Módulos (Gestor/Escalas/etc.): navbar bootstrap
      var nav = document.querySelector('nav.navbar.navbar-wd') || document.querySelector('nav.navbar');
      if (nav && nav.getClientRects && nav.getClientRects().length) {
        var nr = nav.getBoundingClientRect();
        if (nr.height > 0) return Math.max(0, Math.round(nr.bottom));
      }

      return 0;
    }

    function updateSafeTop() {
      var px = getSafeTopPx();
      root.style.setProperty('--wdg-fb-safe-top', px + 'px');
    }

    function scheduleSafeTopUpdate() {
      if (!isDrawerOpen()) return;
      if (rafId) return;
      rafId = window.requestAnimationFrame(function () {
        rafId = 0;
        updateSafeTop();
      });
    }

    function setExpanded(expanded) {
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function isExpanded() {
      return button.getAttribute('aria-expanded') === 'true';
    }

    function openDrawer() {
      if (closeTimeoutId) {
        clearTimeout(closeTimeoutId);
        closeTimeoutId = null;
      }

      // Torna o elemento renderizável antes de aplicar o estado aberto
      drawer.hidden = false;

      root.setAttribute('data-open', '1');
      setExpanded(true);

      if (chatApi) chatApi.boot();

      // Ajusta altura do drawer para começar abaixo da barra do módulo
      updateSafeTop();
    }

    function closeDrawer() {
      root.removeAttribute('data-open');
      setExpanded(false);

      // Reseta para default (evita ficar travado em páginas sem barra)
      root.style.removeProperty('--wdg-fb-safe-top');

      // Aguarda a transição do CSS para esconder (mantém sensação de "subir/descer")
      var finished = false;

      function finalize() {
        if (finished) return;
        finished = true;
        drawer.removeEventListener('transitionend', onTransitionEnd);
        if (!isExpanded()) drawer.hidden = true;
      }

      function onTransitionEnd(ev) {
        if (ev && ev.target !== drawer) return;
        finalize();
      }

      drawer.addEventListener('transitionend', onTransitionEnd);
      closeTimeoutId = setTimeout(finalize, 320);
    }

    function toggleDrawer() {
      if (isExpanded()) closeDrawer();
      else openDrawer();
    }

    button.addEventListener('click', function (ev) {
      ev.preventDefault();
      toggleDrawer();
    });

    // Enquanto aberto, acompanha mudanças de layout (sticky headers, toolbar do portal, etc.)
    window.addEventListener('resize', scheduleSafeTopUpdate);
    window.addEventListener('scroll', scheduleSafeTopUpdate, { passive: true });

    root.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      var closeBtn = target.closest('[data-feedback-close]');
      if (closeBtn) {
        ev.preventDefault();
        closeDrawer();
      }
    });
  }

  function initAll() {
    var roots = document.querySelectorAll('.wdg-feedback-widget[data-feedback-widget="1"]');
    for (var i = 0; i < roots.length; i++) {
      initWidget(roots[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
