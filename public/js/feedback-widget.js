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
    var headerHomeBtn = drawer.querySelector('[data-feedback-home]');

    var log = chat.querySelector('[data-chat-log]');
    var quick = chat.querySelector('[data-chat-quick]');
    var form = chat.querySelector('[data-chat-compose]');
    var input = chat.querySelector('[data-chat-input]');
    var fileInput = chat.querySelector('[data-chat-file]');
    if (!log || !quick || !form || !input || !fileInput) return null;

    // Fila simples para manter a conversa em ordem
    var uiQueue = Promise.resolve();
    var uiVersion = 0;
    function enqueueUi(fn) {
      var v = uiVersion;
      uiQueue = uiQueue
        .then(function () {
          if (v !== uiVersion) return;
          return fn();
        })
        .catch(function () { /* noop */ });
      return uiQueue;
    }

    // Indicador "digitando..." (3 pontinhos)
    var typingRow = null;
    var typingTimer = null;

    function insertBeforeQuick(el) {
      if (!el) return;
      try {
        if (quick && quick.parentNode === log) log.insertBefore(el, quick);
        else log.appendChild(el);
      } catch (_e) {
        try { log.appendChild(el); } catch (_e2) { /* noop */ }
      }
    }

    function setTypingVisible(visible) {
      try {
        if (!visible) {
          if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
          if (typingRow && typingRow.parentNode) typingRow.parentNode.removeChild(typingRow);
          typingRow = null;
          return;
        }
        if (typingRow) return;
        typingRow = document.createElement('div');
        typingRow.className = 'wdg-feedback-msg wdg-feedback-msg--in wdg-feedback-typing-row';
        var bubble = document.createElement('div');
        bubble.className = 'wdg-feedback-bubble wdg-feedback-typing-bubble';
        var dots = document.createElement('div');
        dots.className = 'wdg-feedback-typing-dots';
        for (var i = 0; i < 3; i++) {
          var s = document.createElement('span');
          s.className = 'wdg-feedback-typing-dot';
          dots.appendChild(s);
        }
        bubble.appendChild(dots);
        typingRow.appendChild(bubble);
        insertBeforeQuick(typingRow);
      } catch (_e3) {
        typingRow = null;
      }

      scrollToBottom();
    }

    function showTyping(ms) {
      var dur = (typeof ms === 'number' && ms >= 0) ? ms : 650;
      return new Promise(function (resolve) {
        setTypingVisible(true);
        scrollToBottom();
        if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
        typingTimer = setTimeout(function () {
          typingTimer = null;
          setTypingVisible(false);
          resolve();
        }, dur);
      });
    }

    function clampMs(n, min, max) {
      var v = (typeof n === 'number' && isFinite(n)) ? n : min;
      return Math.max(min, Math.min(max, v));
    }

    function randInt(min, max) {
      var a = Math.floor(min || 0);
      var b = Math.floor(max || 0);
      if (b < a) { var t = a; a = b; b = t; }
      // inclusive
      return a + Math.floor(Math.random() * (b - a + 1));
    }

    // Simula "tempo humano" de digitação: um pouco de base + proporcional ao texto + jitter.
    function humanTypingMs(text, opts) {
      opts = opts || {};
      var s = String(text || '');
      var base = (typeof opts.base === 'number') ? opts.base : 900;
      var perChar = (typeof opts.perChar === 'number') ? opts.perChar : 18;
      var jitter = (typeof opts.jitter === 'number') ? opts.jitter : 420;
      var min = (typeof opts.min === 'number') ? opts.min : 950;
      var max = (typeof opts.max === 'number') ? opts.max : 2200;
      var calc = base + (s.length * perChar) + randInt(-jitter, jitter);
      return clampMs(calc, min, max);
    }

    function showTypingHuman(text, opts) {
      return showTyping(humanTypingMs(text, opts));
    }

    function botSay(text, opts) {
      var msg = String(text || '');
      return enqueueUi(function () {
        // garante que o "digitando..." sempre apareça antes do texto
        return showTypingHuman(msg, opts).then(function () {
          addMessage('in', msg);
        });
      });
    }

    function clearChatLog() {
      try {
        setTypingVisible(false);
        log.innerHTML = '';
        // garante que o container de quick replies volte para o log
        if (quick && log) log.appendChild(quick);
      } catch (_e) { /* noop */ }
    }

    function goHome() {
      // Volta ao menu inicial (home), limpando a conversa.
      uiVersion++;
      // zera fila para novas ações
      uiQueue = Promise.resolve();
      clearChatLog();
      resetToHome();
    }

    if (headerHomeBtn) {
      headerHomeBtn.addEventListener('click', function () {
        goHome();
      });
    }

    function parseChoice12(text) {
      var s = String(text || '').trim();
      if (s === '1' || s === '2') return s;
      // tolera "1." / "2-" etc, mas não qualquer coisa
      if (s && (s[0] === '1' || s[0] === '2')) {
        var rest = s.slice(1).trim();
        if (!rest) return s[0];
        if (/^[\-\.|]+$/.test(rest)) return s[0];
      }
      return null;
    }

    function parseChoice(text, allowed) {
      var s = String(text || '').trim();
      if (!s) return null;
      var first = s[0];
      if (!first) return null;
      if (allowed && Array.isArray(allowed) && allowed.indexOf(first) >= 0) return first;
      return null;
    }

    function addImageThumb(direction, dataUrl, fileName) {
      try {
        var row = document.createElement('div');
        row.className = 'wdg-feedback-msg ' + (direction === 'out' ? 'wdg-feedback-msg--out' : 'wdg-feedback-msg--in');
        var bubble = document.createElement('div');
        bubble.className = 'wdg-feedback-bubble';
        var img = document.createElement('img');
        img.className = 'wdg-feedback-img-thumb';
        img.src = dataUrl;
        img.alt = fileName ? ('Imagem anexada: ' + fileName) : 'Imagem anexada';
        img.loading = 'lazy';
        img.decoding = 'async';
        bubble.appendChild(img);
        row.appendChild(bubble);

        // remove typing antes de inserir
        setTypingVisible(false);
        if (quick && quick.parentNode === log) log.insertBefore(row, quick);
        else log.appendChild(row);
        scrollToBottom();

        // Se a imagem ajustar altura depois, reancora no fim
        try { img.addEventListener('load', function () { scrollToBottom(); }); } catch (_eL) { /* noop */ }

        // modal simples (sem depender de bootstrap)
        var modal = root.querySelector('.wdg-feedback-img-modal');
        if (!modal) {
          modal = document.createElement('div');
          modal.className = 'wdg-feedback-img-modal';
          modal.setAttribute('aria-hidden', 'true');
          var content = document.createElement('div');
          content.className = 'wdg-feedback-img-modal-content';
          var closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'wdg-feedback-img-modal-close';
          closeBtn.setAttribute('aria-label', 'Fechar');
          closeBtn.textContent = '×';
          var modalImg = document.createElement('img');
          modalImg.alt = '';
          content.appendChild(closeBtn);
          content.appendChild(modalImg);
          modal.appendChild(content);
          // fecha ao clicar fora
          modal.addEventListener('click', function (ev) {
            if (ev && ev.target === modal) {
              modal.setAttribute('aria-hidden', 'true');
            }
          });
          closeBtn.addEventListener('click', function () {
            modal.setAttribute('aria-hidden', 'true');
          });
          root.appendChild(modal);
        }

        img.addEventListener('click', function () {
          try {
            var modalImg = modal.querySelector('img');
            modalImg.src = dataUrl;
            modal.setAttribute('aria-hidden', 'false');
          } catch (_e2) { /* noop */ }
        });
      } catch (_e3) {
        addMessage(direction, fileName ? ('Imagem anexada: ' + fileName + '.') : 'Imagem anexada.');
      }
    }

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
      bug: {
        pageChoice: '',
        pageUrl: '',
        currentUrl: '',
        tentativa: '',
        ocorreu: ''
      },
      generic: {
        page: '',
        text: '',
        impact: '',
        createdId: ''
      },
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
      var t = String(tipo || '').toLowerCase().trim();
      try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_eNorm) { /* noop */ }
      // Regras de avatar por tipo (posições)
      // - Bug: posicao3
      // - Sugestão: posicao3
      // - Dúvida: posicao2
      // - Crítica: posicao3
      // - Elogio: posicao4
      if (t === 'duvida') return 'avatarposicao2.png';
      if (t === 'bug' || t === 'sugestao' || t === 'critica') return 'avatarposicao3.png';
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
      setHeaderAvatarByFile('avatarposicao2.png');
    }

    function setHeaderAvatarTrack() {
      // "Acompanhar meus feedbacks"
      setHeaderAvatarByFile('avatarposicao2.png');
    }

    function scrollToBottom() {
      // 1) scrollTop direto
      try { log.scrollTop = log.scrollHeight; } catch (_e) { /* noop */ }

      // 2) após layout (mensagens grandes, quick replies, etc.)
      try {
        window.requestAnimationFrame(function () {
          try { log.scrollTop = log.scrollHeight; } catch (_e2) { /* noop */ }
          try {
            var last = log.lastElementChild;
            if (last && last.scrollIntoView) last.scrollIntoView({ block: 'end' });
          } catch (_e3) { /* noop */ }
        });
      } catch (_e4) { /* noop */ }

      // 3) fallback tardio (imagem/altura mudando depois)
      try {
        setTimeout(function () {
          try { log.scrollTop = log.scrollHeight; } catch (_e5) { /* noop */ }
          try {
            var last2 = log.lastElementChild;
            if (last2 && last2.scrollIntoView) last2.scrollIntoView({ block: 'end' });
          } catch (_e6) { /* noop */ }
        }, 60);
      } catch (_e7) { /* noop */ }
    }

    function addMessage(direction, text) {
      var row = document.createElement('div');
      row.className = 'wdg-feedback-msg ' + (direction === 'out' ? 'wdg-feedback-msg--out' : 'wdg-feedback-msg--in');
      var bubble = document.createElement('div');
      bubble.className = 'wdg-feedback-bubble';
      bubble.textContent = String(text || '');
      row.appendChild(bubble);
      // Se o bloco de botões rápidos estiver dentro do log,
      // mantenha as mensagens sempre acima dele.
      if (quick && quick.parentNode === log) {
        // remove typing antes de inserir uma nova mensagem
        setTypingVisible(false);
        log.insertBefore(row, quick);
      } else {
        log.appendChild(row);
      }
      scrollToBottom();
    }

    function setQuickButtons(items) {
      // Move os botões rápidos para dentro do log, para ficarem logo após as mensagens
      // (evita um “vazio” grande quando o log cresce por flex).
      try {
        if (quick && log && quick.parentNode !== log) {
          log.appendChild(quick);
        } else if (quick && log) {
          // garante que fique por último
          log.appendChild(quick);
        }
      } catch (_e) { /* noop */ }

      quick.innerHTML = '';
      if (!items || !items.length) {
        try { quick.style.display = 'none'; } catch (_e2) { /* noop */ }
        try { quick.removeAttribute('data-quick-mode'); } catch (_e2m) { /* noop */ }
        scrollToBottom();
        return;
      }

      try { quick.style.display = 'flex'; } catch (_e3) { /* noop */ }
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

      scrollToBottom();
    }

    function setQuickMode(mode) {
      try {
        if (!quick) return;
        if (!mode) quick.removeAttribute('data-quick-mode');
        else quick.setAttribute('data-quick-mode', String(mode));
      } catch (_e) { /* noop */ }
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
      state.bug = {
        pageChoice: '',
        pageUrl: '',
        currentUrl: '',
        tentativa: '',
        ocorreu: ''
      };
      state.pendingAttachment = null;
      state.lastCreatedId = null;

      genReset();

      setHeaderAvatarIntro();

      // Esconde opções enquanto roda a sequência
      setQuickButtons([]);
      setComposer({ placeholder: 'Mensagem', disabled: true });

      enqueueUi(function () {
        var msg1 = 'Para iniciarmos, escolha uma das opções a seguir:';
        return showTypingHuman('...', { base: 1100, perChar: 0, jitter: 600, min: 1100, max: 2400 })
          .then(function () {
            addMessage('in', msg1);
            return showTypingHuman(msg1, { base: 950, perChar: 14, jitter: 520, min: 1000, max: 2600 });
          })
          .then(function () {
            setQuickButtons([
              { id: 'bug', label: 'Bug', icon: iconUrl('bug.png'), onClick: function () { startFlow('bug'); } },
              { id: 'sugestao', label: 'Sugestão', icon: iconUrl('sugestao.png'), onClick: function () { startFlow('sugestao'); } },
              { id: 'duvida', label: 'Dúvida', icon: iconUrl('duvida.png'), onClick: function () { startFlow('duvida'); } },
              { id: 'critica', label: 'Crítica', icon: iconUrl('critica.png'), onClick: function () { startFlow('critica'); } },
              { id: 'elogio', label: 'Elogio', icon: iconUrl('elogio.png'), onClick: function () { startFlow('elogio'); } },
              { id: 'track', label: 'Acompanhar meus feedbacks', icon: iconUrl('acompfeedback.png'), onClick: function () { startTrack(); } }
            ]);
          });
      });
    }

    function bugShowWhereOptions() {
      // Evita duplicar: as opções ficam nos botões. Aqui só orienta.
      var msg3 = 'Escolha uma opção (1 ou 2):';
      return botSay(msg3, { base: 850, perChar: 10, jitter: 520, min: 1000, max: 2400 }).then(function () {
        state.flow = 'bug.where';
        setQuickMode('choices');
        setQuickButtons([
          { id: 'b1', label: '1 - Nesta página', onClick: function () { bugHandleChoice('1'); } },
          { id: 'b2', label: '2 - Em outra', onClick: function () { bugHandleChoice('2'); } }
        ]);
        setComposer({ placeholder: 'Digite 1 ou 2', disabled: false });
        try { input.focus(); } catch (_e) { /* noop */ }
      });
    }

    function bugShowConfirmCurrentOptions() {
      var msg5 = 'Responda com 1 ou 2:';
      return botSay(msg5, { base: 800, perChar: 10, jitter: 520, min: 950, max: 2200 }).then(function () {
        state.flow = 'bug.confirmCurrent';
        setQuickMode('choices');
        setQuickButtons([
          { id: 'c1', label: '1 - Sim', onClick: function () { bugHandleChoice('1'); } },
          { id: 'c2', label: '2 - Não', onClick: function () { bugHandleChoice('2'); } }
        ]);
        setComposer({ placeholder: 'Digite 1 ou 2', disabled: false });
        try { input.focus(); } catch (_e2) { /* noop */ }
      });
    }

    function bugShowAttachOptions() {
      var msg10 = 'Para finalizar o atendimento, você gostaria de anexar alguma imagem (printscreen do erro)? Responda com 1 ou 2:';
      return botSay(msg10, { base: 950, perChar: 9, jitter: 620, min: 1200, max: 3200 }).then(function () {
        state.flow = 'bug.attachChoice';
        setQuickMode('choices');
        setQuickButtons([
          { id: 'a1', label: '1 - Sim', onClick: function () { bugHandleChoice('1'); } },
          { id: 'a2', label: '2 - Não', onClick: function () { bugHandleChoice('2'); } }
        ]);
        setComposer({ placeholder: 'Digite 1 ou 2', disabled: false });
        try { input.focus(); } catch (_e) { /* noop */ }
      });
    }

    function bugAskPageUrl() {
      var msg = 'Escreva a URL da página onde o erro ocorreu ou o nome dela.';
      return botSay(msg, { base: 900, perChar: 12, jitter: 620, min: 1100, max: 3000 }).then(function () {
        state.flow = 'bug.pageUrl';
        setQuickMode(null);
        setQuickButtons([]);
        setComposer({ placeholder: 'Cole a URL ou escreva o nome...', disabled: false });
        try { input.focus(); } catch (_e) { /* noop */ }
      });
    }

    function bugAskTentativa() {
      var msg6 = 'Diga-me o que estava tentando fazer quando ocorreu o erro?';
      return botSay(msg6, { base: 950, perChar: 11, jitter: 650, min: 1200, max: 3200 }).then(function () {
        state.flow = 'bug.tentativa';
        setQuickMode(null);
        setQuickButtons([]);
        setComposer({ placeholder: 'Descreva o que você queria fazer...', disabled: false });
        try { input.focus(); } catch (_e) { /* noop */ }
      });
    }

    function bugAskOcorreu() {
      var msg8 = 'Por fim, o que aconteceu quando tentou executar sua ação?';
      return botSay(msg8, { base: 950, perChar: 11, jitter: 650, min: 1200, max: 3300 }).then(function () {
        state.flow = 'bug.ocorreu';
        setQuickMode(null);
        setQuickButtons([]);
        setComposer({ placeholder: 'Descreva o que aconteceu...', disabled: false });
        try { input.focus(); } catch (_e) { /* noop */ }
      });
    }

    function bugInvalidAndRepeat(repeatFn) {
      setQuickButtons([]);
      setComposer({ disabled: true });
      return botSay('Desculpe, não entendi a sua opção.', { base: 820, perChar: 9, jitter: 500, min: 950, max: 2200 })
        .then(function () {
          return repeatFn();
        });
    }

    function bugHandleChoice(choiceRaw) {
      // Simula escolha via botão: mostra a seleção como mensagem do usuário
      var choice = String(choiceRaw || '').trim();
      // Esconde as opções imediatamente para não parecer duplicado
      setQuickMode(null);
      setQuickButtons([]);
      if (choice) addMessage('out', choice);
      input.value = '';
      autoResizeInput();
      bugHandleUserText(choice);
    }

    function bugHandleUserText(text) {
      var choice = parseChoice12(text);
      // Desabilita enquanto o bot responde
      setComposer({ disabled: true });

      // Sempre some com as opções assim que o usuário respondeu
      setQuickMode(null);
      setQuickButtons([]);

      if (state.flow === 'bug.where') {
        if (!choice) return bugInvalidAndRepeat(bugShowWhereOptions);
        state.bug.pageChoice = choice;

        if (choice === '2') {
          return bugAskPageUrl();
        }

        state.bug.currentUrl = (window && window.location && window.location.href) ? String(window.location.href) : '';
        state.bug.pageUrl = state.bug.currentUrl;
        var msg4 = 'Entendi, a página em que ocorreu o erro foi ' + (state.bug.currentUrl || '(não consegui identificar a URL)') + '.';
        return botSay(msg4, { base: 900, perChar: 10, jitter: 620, min: 1100, max: 3200 })
          .then(function () {
            return bugShowConfirmCurrentOptions();
          });
      }

      if (state.flow === 'bug.confirmCurrent') {
        if (!choice) return bugInvalidAndRepeat(bugShowConfirmCurrentOptions);
        if (choice === '2') {
          return bugAskPageUrl();
        }
        // choice 1
        return bugAskTentativa();
      }

      if (state.flow === 'bug.attachChoice') {
        if (!choice) return bugInvalidAndRepeat(bugShowAttachOptions);
        if (choice === '2') {
          return bugFinalizeAndClose(null);
        }
        // choice 1
        return botSay('Certo, clique no botão abaixo para anexar a imagem.', { base: 900, perChar: 10, jitter: 620, min: 1100, max: 3000 })
          .then(function () {
            state.flow = 'bug.waitFile';
            setQuickButtons([
              { id: 'attach', label: 'Anexar imagem', onClick: function () { openFilePicker(); } }
            ]);
            setComposer({ placeholder: 'Mensagem', disabled: true });
          });
      }

      // fallback (não deveria ocorrer)
      setComposer({ disabled: false });
      return Promise.resolve();
    }

    // =============== Fluxos premium (Sugestão / Dúvida / Crítica / Elogio) ===============

    function genReset() {
      state.generic = { page: '', text: '', impact: '', createdId: '' };
    }

    function genBuildPayloadText() {
      var typeLabel = labelForTipo(state.tipo);
      var page = state.generic.page || '';
      var impact = state.generic.impact || '';
      var body = state.generic.text || '';
      var head = 'TIPO: ' + typeLabel + '\n';
      if (page) head += 'PÁGINA: ' + page + '\n';
      if (impact) head += 'IMPACTO: ' + impact + '\n';
      return head + '\n' + body;
    }

    function genIntroText(tipo) {
      if (tipo === 'sugestao') {
        return 'Perfeito! Obrigado por ajudar a melhorar o WD Gestor. Vou registrar sua sugestão com o máximo de clareza.';
      }
      if (tipo === 'duvida') {
        return 'Claro! Vou te ajudar. Vou registrar sua dúvida com contexto para o time te responder direitinho.';
      }
      if (tipo === 'critica') {
        return 'Entendi. Antes de mais nada, desculpe-nos pelo transtorno. Sua crítica é muito importante para melhorarmos o software.';
      }
      if (tipo === 'elogio') {
        return 'Que ótimo ler isso! Obrigado pelo elogio — esse retorno fortalece muito o time.';
      }
      return 'Perfeito! Vamos lá.';
    }

    function genAskPage() {
      state.flow = 'gen.pageChoice';
      setQuickMode('choices');
      setQuickButtons([
        {
          id: 'p1',
          label: '1 - Usar página atual',
          onClick: function () { genHandleChoice('1', 'Usar página atual'); }
        },
        {
          id: 'p2',
          label: '2 - Informar outra página/URL',
          onClick: function () { genHandleChoice('2', 'Informar outra página/URL'); }
        }
      ]);
      setComposer({ placeholder: 'Digite 1 ou 2 (ou cole a URL aqui)', disabled: false });
      try { input.focus(); } catch (_e2) { /* noop */ }
    }

    function genAskPageText() {
      state.flow = 'gen.pageText';
      setQuickMode(null);
      setQuickButtons([]);
      setComposer({ placeholder: 'Ex.: /gestor/usuarios (ou cole a URL completa)', disabled: false });
      try { input.focus(); } catch (_e) { /* noop */ }
      return Promise.resolve();
    }

    function genAskText() {
      var q = '';
      if (state.tipo === 'sugestao') q = 'Show. Agora me descreva sua sugestão: como seria o ideal pra você?';
      else if (state.tipo === 'duvida') q = 'Perfeito. Qual é a sua dúvida? Se puder, descreva o contexto e o que você já tentou.';
      else if (state.tipo === 'critica') q = 'Entendi. O que exatamente te incomodou? Se puder, descreva a situação e o impacto.';
      else if (state.tipo === 'elogio') q = 'Que bom! Conta pra mim o que você gostou e por quê.';
      else q = 'Pode me explicar melhor?';

      return botSay(q, { base: 980, perChar: 11, jitter: 720, min: 1400, max: 4200 }).then(function () {
        state.flow = 'gen.text';
        setQuickMode(null);
        setQuickButtons([]);
        setComposer({ placeholder: 'Escreva aqui...', disabled: false });
        try { input.focus(); } catch (_e) { /* noop */ }
      });
    }

    function genAskImpactChoice() {
      var q2 = 'Isso está bloqueando você agora? Responda com 1 ou 2:';
      return botSay(q2, { base: 820, perChar: 10, jitter: 620, min: 1200, max: 3200 }).then(function () {
        state.flow = 'gen.impact';
        setQuickMode('choices');
        setQuickButtons([
          { id: 'i1', label: '1 - Sim, está bloqueando', onClick: function () { genHandleChoice('1'); } },
          { id: 'i2', label: '2 - Não, é só um ponto de melhoria', onClick: function () { genHandleChoice('2'); } }
        ]);
        setComposer({ placeholder: 'Digite 1 ou 2', disabled: false });
        try { input.focus(); } catch (_e2) { /* noop */ }
      });
    }

    function genAskAttachChoice() {
      var q3 = 'Você quer anexar uma imagem (print) para ajudar o time? Responda com 1 ou 2:';
      return botSay(q3, { base: 860, perChar: 10, jitter: 650, min: 1200, max: 3400 }).then(function () {
        state.flow = 'gen.attachChoice';
        setQuickMode('choices');
        setQuickButtons([
          { id: 'a1', label: '1 - Sim, anexar imagem', onClick: function () { genHandleChoice('1'); } },
          { id: 'a2', label: '2 - Não, pode enviar assim', onClick: function () { genHandleChoice('2'); } }
        ]);
        setComposer({ placeholder: 'Digite 1 ou 2', disabled: false });
        try { input.focus(); } catch (_e3) { /* noop */ }
      });
    }

    function genInvalidAndRepeat(repeatFn) {
      setComposer({ disabled: true });
      setQuickMode(null);
      setQuickButtons([]);
      return botSay('Desculpe, não entendi a sua opção.', { base: 780, perChar: 9, jitter: 520, min: 1000, max: 2400 })
        .then(function () { return repeatFn(); });
    }

    function genThanksText() {
      if (state.tipo === 'critica') {
        return 'Mais uma vez, desculpe pelo transtorno — e obrigado por nos ajudar a melhorar o software. Seu feedback vai direto para o time.';
      }
      return 'Obrigado pela sua participação na melhoria do software. Seu feedback ajuda diretamente a evoluirmos o WD Gestor.';
    }

    function genFinalize(file) {
      var message = genBuildPayloadText();
      state.flow = 'gen.sending';
      setQuickMode(null);
      setQuickButtons([]);
      setComposer({ placeholder: 'Mensagem', disabled: true });

      return createFeedback(message)
        .then(function (env) {
          state.generic.createdId = env && env.id ? String(env.id) : '';
          state.lastCreatedId = state.generic.createdId || state.lastCreatedId;
          if (!file) return { id: state.generic.createdId, upload: { ok: true, message: '' } };
          return uploadAttachment(state.generic.createdId, file).then(function (up) {
            return { id: state.generic.createdId, upload: up };
          });
        })
        .then(function (pack) {
          var id = (pack && pack.id) ? String(pack.id) : '';
          if (pack && pack.upload && pack.upload.ok === false) {
            state.flow = 'gen.retryUpload';
            var why = pack.upload.message || 'Não consegui anexar a imagem.';
            return botSay('Eu registrei sua mensagem com sucesso, mas não consegui anexar a imagem agora. Motivo: ' + why, { base: 900, perChar: 9, jitter: 650, min: 1400, max: 4200 })
              .then(function () {
                setQuickMode('choices');
                setQuickButtons([
                  { id: 'retry', label: 'Tentar anexar novamente', onClick: function () { state.flow = 'gen.retryUpload'; openFilePicker(); } },
                  { id: 'skip', label: 'Finalizar sem anexo', onClick: function () { state.flow = 'gen.sending'; setQuickMode(null); setQuickButtons([]); } }
                ]);
                setComposer({ placeholder: 'Mensagem', disabled: true });
              })
              .then(function () {
                return botSay('Protocolo: ' + (id || 'XXXXXXXXXXX') + '.', { base: 820, perChar: 8, jitter: 520, min: 1100, max: 2600 })
                  .then(function () { return botSay(genThanksText(), { base: 980, perChar: 9, jitter: 720, min: 1400, max: 4200 }); })
                  .then(function () {
                    setQuickMode(null);
                    setQuickButtons([
                      { id: 'track', label: 'Acompanhar meus feedbacks', icon: iconUrl('acompfeedback.png'), onClick: function () { startTrack(); } },
                      { id: 'new', label: 'Novo feedback', onClick: function () { resetToHome(); } }
                    ]);
                    setComposer({ placeholder: 'Mensagem', disabled: true });
                  });
              });
          }

          return botSay('Perfeito! Registrei aqui com sucesso. Protocolo: ' + (id || 'XXXXXXXXXXX') + '.', { base: 980, perChar: 9, jitter: 720, min: 1400, max: 4200 })
            .then(function () { return botSay(genThanksText(), { base: 980, perChar: 9, jitter: 720, min: 1400, max: 4200 }); })
            .then(function () {
              setQuickMode(null);
              setQuickButtons([
                { id: 'track', label: 'Acompanhar meus feedbacks', icon: iconUrl('acompfeedback.png'), onClick: function () { startTrack(); } },
                { id: 'new', label: 'Novo feedback', onClick: function () { resetToHome(); } }
              ]);
              setComposer({ placeholder: 'Mensagem', disabled: true });
            });
        })
        .catch(function (e) {
          return botSay((e && e.message) ? e.message : 'Não consegui enviar agora. Tente novamente em instantes.', { base: 900, perChar: 10, jitter: 650, min: 1400, max: 4200 })
            .then(function () {
              setQuickButtons([
                { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
              ]);
              setComposer({ placeholder: 'Mensagem', disabled: true });
            });
        });
    }

    function genHandleChoice(choiceRaw, displayText) {
      var choice = String(choiceRaw || '').trim();
      setQuickMode(null);
      setQuickButtons([]);
      if (choice) addMessage('out', displayText ? String(displayText) : choice);
      input.value = '';
      autoResizeInput();
      genHandleUserText(choice);
    }

    function genHandleUserText(text) {
      var t = String(text || '').trim();
      if (!t) return;

      // desabilita enquanto o bot responde
      setComposer({ disabled: true });
      setQuickMode(null);
      setQuickButtons([]);

      if (state.flow === 'gen.pageChoice') {
        // aceita 1/2, mas também permite colar a URL diretamente
        var c0 = parseChoice(t, ['1', '2']);
        if (c0 === '1') {
          state.generic.page = (window && window.location && window.location.href) ? String(window.location.href) : '';
          var pageMsg = state.generic.page ? ('Perfeito. Vou considerar a página: ' + state.generic.page + '.') : 'Perfeito. Vou considerar a página atual.';
          return botSay(pageMsg, { base: 780, perChar: 8, jitter: 560, min: 1100, max: 2800 })
            .then(function () { return genAskText(); });
        }
        if (c0 === '2') {
          return botSay('Beleza. Me diga qual módulo/página (pode colar a URL).', { base: 820, perChar: 9, jitter: 620, min: 1200, max: 3200 })
            .then(function () { return genAskPageText(); });
        }

        // Sem escolha numérica: trata como página/URL direto
        state.generic.page = t;
        return botSay('Perfeito. Obrigado!', { base: 720, perChar: 8, jitter: 520, min: 900, max: 2200 })
          .then(function () { return genAskText(); });
      }

      if (state.flow === 'gen.pageText') {
        state.generic.page = t;
        return botSay('Perfeito. Obrigado!', { base: 720, perChar: 8, jitter: 520, min: 900, max: 2200 })
          .then(function () { return genAskText(); });
      }

      if (state.flow === 'gen.text') {
        state.generic.text = t;
        return botSay('Entendi. Obrigado por detalhar.', { base: 820, perChar: 8, jitter: 620, min: 1100, max: 2600 })
          .then(function () {
            // Para elogio, não faz sentido perguntar se "está bloqueando".
            if (state.tipo === 'elogio') {
              state.generic.impact = '';
              return botSay('Perfeito. Vou registrar esse elogio para o time.', { base: 820, perChar: 9, jitter: 620, min: 1200, max: 3200 })
                .then(function () { return genFinalize(null); });
            }
            return genAskImpactChoice();
          });
      }

      if (state.flow === 'gen.impact') {
        var c = parseChoice(t, ['1', '2']);
        if (!c) return genInvalidAndRepeat(genAskImpactChoice);
        state.generic.impact = (c === '1') ? 'Bloqueando agora' : 'Ponto de melhoria/retorno';

        var summary = 'Resumo rápido:\n' +
          '• Tipo: ' + labelForTipo(state.tipo) + '\n' +
          '• Página: ' + (state.generic.page || '-') + '\n' +
          (state.generic.impact ? ('• Impacto: ' + state.generic.impact + '\n') : '') +
          '• Mensagem: ' + (state.generic.text ? (state.generic.text.slice(0, 140) + (state.generic.text.length > 140 ? '…' : '')) : '-');

        return botSay(summary, { base: 1050, perChar: 8, jitter: 720, min: 1600, max: 4600 })
          .then(function () { return genAskAttachChoice(); });
      }

      if (state.flow === 'gen.attachChoice') {
        var c2 = parseChoice(t, ['1', '2']);
        if (!c2) return genInvalidAndRepeat(genAskAttachChoice);
        if (c2 === '2') {
          return genFinalize(null);
        }

        return botSay('Certo. Clique no botão abaixo para anexar a imagem.', { base: 880, perChar: 10, jitter: 650, min: 1200, max: 3400 })
          .then(function () {
            state.flow = 'gen.waitFile';
            setQuickButtons([
              { id: 'attach', label: 'Anexar imagem', onClick: function () { openFilePicker(); } }
            ]);
            setComposer({ placeholder: 'Mensagem', disabled: true });
          });
      }

      // gen.waitFile / gen.retryUpload: input livre é ignorado
      return;
    }

    function startFlow(tipo) {
      state.tipo = tipo;

      // Avatar do assistente no topo muda conforme o tipo escolhido
      setHeaderAvatarForTipo(tipo);

      if (tipo === 'bug') {
        // Fluxo Bug (roteiro detalhado)
        state.bug = {
          pageChoice: '',
          pageUrl: '',
          currentUrl: '',
          tentativa: '',
          ocorreu: ''
        };

        addMessage('out', 'Bug');
        setQuickMode(null);
        setQuickButtons([]);
        setComposer({ placeholder: 'Mensagem', disabled: true });

        var m1 = 'Certo, você escolheu a opção reportar um Bug. Antes de mais nada, desculpe-nos pelo transtorno. A qualquer momento neste atendimento, se desejar retornar ao menu inicial, clique no botão home na parte superior desse drawer.';
        var m2 = 'Para nos situarmos no problema, responda-me, o erro ocorreu nesta página em que está logado ou em outra?';

        // sequência inicial
        state.flow = 'bug.init';
        botSay(m1, { base: 1100, perChar: 9, jitter: 720, min: 1600, max: 4200 })
          .then(function () { return botSay(m2, { base: 980, perChar: 10, jitter: 680, min: 1400, max: 3600 }); })
          .then(function () { return bugShowWhereOptions(); });
        return;
      }

      // Fluxo premium (Sugestão / Dúvida / Crítica / Elogio)
      genReset();
      addMessage('out', labelForTipo(tipo));
      setQuickMode(null);
      setQuickButtons([]);
      setComposer({ placeholder: 'Mensagem', disabled: true });

      var intro = genIntroText(tipo);
      var homeHint = 'A qualquer momento, se quiser voltar ao menu inicial, clique no botão home na parte superior desse drawer.';
      var askPage = 'Pra eu te entender melhor: isso aconteceu/vale para qual módulo ou página?';

      state.flow = 'gen.intro';
      botSay(intro, { base: 950, perChar: 10, jitter: 720, min: 1400, max: 4200 })
        .then(function () { return botSay(homeHint, { base: 820, perChar: 9, jitter: 620, min: 1200, max: 3200 }); })
        .then(function () { return botSay(askPage, { base: 880, perChar: 11, jitter: 680, min: 1200, max: 3600 }); })
        .then(function () { genAskPage(); });
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
        credentials: 'same-origin',
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
      if (!feedbackId || !file) return Promise.resolve({ ok: true, message: '' });
      var url = endpointUploadTpl.replace(':feedback_id', encodeURIComponent(String(feedbackId)));
      var fd = new FormData();
      // IMPORTANTE: o backend limita files=1 (multer). Envie somente 1 campo.
      try { fd.append('anexo', file, file && file.name ? file.name : 'anexo'); }
      catch (_e0) { fd.append('anexo', file); }

      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
        body: fd
      })
        .then(function (resp) {
          return safeJson(resp).then(function (j) {
            var msg = (j && (j.message || j.error)) ? String(j.message || j.error) : '';
            if (resp.ok) return { ok: true, message: '' };
            return { ok: false, message: msg || 'Não foi possível anexar a imagem.' };
          });
        })
        .catch(function (e) {
          return { ok: false, message: (e && e.message) ? e.message : 'Falha ao anexar a imagem.' };
        });
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

    function trackGetItemsFromEnvelope(env) {
      var items = env && env.data;
      if (Array.isArray(items)) return items;
      if (items && Array.isArray(items.items)) return items.items;
      if (items && Array.isArray(items.rows)) return items.rows;
      return [];
    }

    function trackShortId(id) {
      var s = String(id || '');
      if (s.length <= 10) return s;
      return s.slice(0, 6) + '…' + s.slice(-4);
    }

    function trackFormatItemLabel(it, fallbackId) {
      var fid = String((it && (it._id || it.id || it.feedback_id)) || fallbackId || '');
      var tipo = String((it && (it.tipo || it.type)) || '').toLowerCase();
      var status = String((it && (it.status || it.situacao)) || '').toLowerCase();
      var createdAt = (it && (it.createdAt || it.criadoEm || it.data || it.created_at)) ? String(it.createdAt || it.criadoEm || it.data || it.created_at) : '';

      function titleize(s) {
        var v = String(s || '').trim();
        if (!v) return '';
        return v.charAt(0).toUpperCase() + v.slice(1);
      }

      function formatDateTime(s) {
        var raw = String(s || '').trim();
        if (!raw) return '';
        try {
          var d = new Date(raw);
          if (isNaN(d.getTime())) return raw;
          return d.toLocaleString('pt-BR');
        } catch (_e) {
          return raw;
        }
      }

      function pickMessageSnippet() {
        var msg = (it && (it.mensagem || it.texto || it.descricao || it.message || it.text)) ? String(it.mensagem || it.texto || it.descricao || it.message || it.text) : '';
        msg = String(msg || '').replace(/\r/g, '').trim();
        if (!msg) return '';

        // tenta extrair a parte humana (remove cabeçalhos do payload)
        var lines = msg.split('\n').map(function (l) { return String(l || '').trim(); });
        var cleaned = [];
        for (var i = 0; i < lines.length; i++) {
          var l = lines[i];
          if (!l) continue;
          // remove linhas técnicas
          if (/^(TIPO:|PÁGINA:|PAGINA:|IMPACTO:|BUG\b|Página:|Tentativa:|Ocorreu:)/i.test(l)) continue;
          // remove bullets
          l = l.replace(/^•\s*/g, '');
          cleaned.push(l);
        }

        var pick = cleaned.length ? cleaned[0] : (lines.find(function (x) { return !!x; }) || '');
        pick = String(pick || '').trim();
        if (pick.length > 84) pick = pick.slice(0, 84) + '…';
        return pick;
      }

      var anexos = it && (it.anexos || it.attachments || it.files);
      var anexosCount = Array.isArray(anexos) ? anexos.length : 0;
      var dt = formatDateTime(createdAt);
      var snippet = pickMessageSnippet();

      var label = '';
      label += 'Protocolo: ' + trackShortId(fid) + '\n';
      if (dt) label += 'Data/Hora: ' + dt + '\n';
      if (tipo) label += 'Tipo: ' + titleize(tipo) + (status ? (' (' + titleize(status) + ')') : '') + '\n';
      else if (status) label += 'Status: ' + titleize(status) + '\n';
      if (anexosCount) label += 'Imagens: ' + anexosCount + '\n';
      if (snippet) label += 'Mensagem: ' + snippet;
      return label.trim();
    }

    function trackShowList(items) {
      setHeaderAvatarTrack();
      state.track = state.track || {};
      state.track.items = Array.isArray(items) ? items : [];
      state.flow = 'track.list';

      setQuickMode('choices');
      var buttons = (state.track.items || []).slice(0, 8).map(function (it, idx) {
        var fid = String((it && (it._id || it.id || it.feedback_id)) || idx);
        return {
          id: fid,
          label: trackFormatItemLabel(it, fid),
          onClick: function () { openMyDetail(fid); }
        };
      });

      buttons = buttons.concat([
        { id: 'search', label: 'Buscar por protocolo', onClick: function () { trackAskProtocol(); } },
        { id: 'refresh', label: 'Atualizar lista', onClick: function () { trackLoadList(); } },
        { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
      ]);

      setQuickButtons(buttons);
      setComposer({ placeholder: 'Mensagem', disabled: true });
    }

    function trackAskProtocol() {
      setHeaderAvatarTrack();
      state.flow = 'track.search';
      setQuickMode('choices');
      setQuickButtons([
        { id: 'back', label: 'Voltar à lista', onClick: function () { trackShowList(state.track && state.track.items ? state.track.items : []); } },
        { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
      ]);
      setComposer({ placeholder: 'Cole o protocolo (ex.: 65f0... )', disabled: false });
      try { input.focus(); } catch (_e) { /* noop */ }
      return botSay('Me diga o número do protocolo (pode colar aqui).', { base: 900, perChar: 9, jitter: 680, min: 1200, max: 3600 });
    }

    function trackLoadList() {
      setHeaderAvatarTrack();
      state.flow = 'track.loading';
      setQuickMode(null);
      setQuickButtons([]);
      setComposer({ disabled: true });

      return botSay('Beleza — só um instante que vou buscar seus feedbacks.', { base: 900, perChar: 9, jitter: 720, min: 1300, max: 3800 })
        .then(function () {
          return fetch(endpointMyList, { headers: { 'Accept': 'application/json' } })
            .then(function (resp) { return safeJson(resp).then(function (j) { return { resp: resp, json: j }; }); });
        })
        .then(function (pack) {
          var env = normalizeApiEnvelope(pack.json);
          if (!pack.resp.ok) throw new Error(env.message || 'Não consegui carregar a lista.');
          var items = trackGetItemsFromEnvelope(env);

          if (!items.length) {
            state.track = state.track || {};
            state.track.items = [];
            state.flow = 'track.empty';
            return botSay('Ainda não encontrei feedbacks enviados por você neste acesso.', { base: 980, perChar: 9, jitter: 720, min: 1400, max: 4200 })
              .then(function () {
                setQuickMode('choices');
                setQuickButtons([
                  { id: 'new', label: 'Novo feedback', onClick: function () { resetToHome(); } },
                  { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
                ]);
                setComposer({ placeholder: 'Mensagem', disabled: true });
              });
          }

          return botSay('Encontrei ' + items.length + ' feedback(s). Toque em um deles para ver detalhes.', { base: 980, perChar: 9, jitter: 720, min: 1400, max: 4200 })
            .then(function () { trackShowList(items); });
        })
        .catch(function (e) {
          state.flow = 'track.error';
          return botSay((e && e.message) ? e.message : 'Falha ao carregar.', { base: 900, perChar: 9, jitter: 650, min: 1200, max: 3200 })
            .then(function () {
              setQuickMode('choices');
              setQuickButtons([
                { id: 'retry', label: 'Tentar de novo', onClick: function () { trackLoadList(); } },
                { id: 'search', label: 'Buscar por protocolo', onClick: function () { trackAskProtocol(); } },
                { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
              ]);
              setComposer({ placeholder: 'Mensagem', disabled: true });
            });
        });
    }

    function startTrack() {
      // Fluxo de acompanhamento (premium)
      setHeaderAvatarTrack();
      addMessage('out', 'Acompanhar meus feedbacks');
      state.flow = 'track.init';
      // começa carregando direto (menos fricção)
      trackLoadList();
    }

    function openMyDetail(feedbackId) {
      var url = endpointMyDetailTpl.replace(':feedback_id', encodeURIComponent(String(feedbackId)));
      state.flow = 'track.detailLoading';
      addMessage('out', 'Detalhar protocolo ' + String(feedbackId || ''));
      setQuickMode(null);
      setQuickButtons([]);
      setComposer({ disabled: true });

      botSay('Certo. Vou abrir os detalhes do protocolo ' + String(feedbackId || '') + '.', { base: 900, perChar: 9, jitter: 680, min: 1200, max: 3600 })
        .then(function () {
          return fetch(url, { headers: { 'Accept': 'application/json' } })
            .then(function (resp) { return safeJson(resp).then(function (j) { return { resp: resp, json: j }; }); });
        })
        .then(function (pack) {
          var env = normalizeApiEnvelope(pack.json);
          if (!pack.resp.ok) throw new Error(env.message || 'Não consegui abrir.');
          var d = env.data || {};
          var tipo = String(d.tipo || d.type || '').toLowerCase();
          setHeaderAvatarForTipo(tipo);

          var status = d.status || d.situacao || '';
          var createdAt = d.createdAt || d.criadoEm || d.data || d.created_at || '';
          var msg = d.mensagem || d.texto || d.descricao || '';
          var reply = d.resposta || d.reply || d.resposta_admin || d.adminReply || '';
          var anexos = d.anexos || d.attachments || d.files || [];
          var anexosCount = Array.isArray(anexos) ? anexos.length : 0;

          var resumo = '';
          resumo += 'Protocolo: ' + String(feedbackId || '') + '\n';
          if (tipo) resumo += 'Tipo: ' + tipo + '\n';
          if (status) resumo += 'Status: ' + status + '\n';
          if (createdAt) resumo += 'Data: ' + createdAt + '\n';
          if (anexosCount) resumo += 'Imagens: ' + anexosCount + '\n';
          if (msg) resumo += '\nMensagem:\n' + msg;
          if (reply) resumo += '\n\nResposta do time:\n' + reply;

          return botSay(resumo || 'Sem detalhes adicionais.', { base: 1050, perChar: 7, jitter: 720, min: 1600, max: 5200 })
            .then(function () {
              state.flow = 'track.detail';
              setQuickMode('choices');
              setQuickButtons([
                { id: 'back', label: 'Voltar à lista', onClick: function () { if (state.track && Array.isArray(state.track.items) && state.track.items.length) trackShowList(state.track.items); else startTrack(); } },
                { id: 'search', label: 'Buscar por protocolo', onClick: function () { trackAskProtocol(); } },
                { id: 'refresh', label: 'Atualizar lista', onClick: function () { trackLoadList(); } },
                { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
              ]);
              setComposer({ placeholder: 'Mensagem', disabled: true });
            });
        })
        .catch(function (e) {
          state.flow = 'track.detailError';
          return botSay((e && e.message) ? e.message : 'Falha ao abrir.', { base: 900, perChar: 9, jitter: 650, min: 1200, max: 3200 })
            .then(function () {
              setQuickMode('choices');
              setQuickButtons([
                { id: 'back', label: 'Voltar à lista', onClick: function () { if (state.track && Array.isArray(state.track.items) && state.track.items.length) trackShowList(state.track.items); else startTrack(); } },
                { id: 'search', label: 'Buscar por protocolo', onClick: function () { trackAskProtocol(); } },
                { id: 'refresh', label: 'Atualizar lista', onClick: function () { trackLoadList(); } },
                { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
              ]);
              setComposer({ placeholder: 'Mensagem', disabled: true });
            });
        });
    }

    function onUserSend(text) {
      var t = String(text || '').trim();
      if (!t) return;

      if (t) addMessage('out', t);
      input.value = '';
      autoResizeInput();

      // BUG flow (roteiro)
      if (String(state.flow || '').indexOf('bug.') === 0) {
        if (state.flow === 'bug.where' || state.flow === 'bug.confirmCurrent' || state.flow === 'bug.attachChoice') {
          bugHandleUserText(t);
          return;
        }

        if (state.flow === 'bug.pageUrl') {
          state.bug.pageUrl = t;
          setComposer({ disabled: true });
          bugAskTentativa();
          return;
        }

        if (state.flow === 'bug.tentativa') {
          state.bug.tentativa = t;
          setComposer({ disabled: true });
          botSay('Certo. Agora sei o que queria fazer.', { base: 820, perChar: 10, jitter: 520, min: 950, max: 2400 })
            .then(function () {
              return bugAskOcorreu();
            });
          return;
        }

        if (state.flow === 'bug.ocorreu') {
          state.bug.ocorreu = t;
          setComposer({ disabled: true });
          botSay('Certo, entendi o que aconteceu quando tentou executar a sua ação.', { base: 900, perChar: 10, jitter: 620, min: 1200, max: 3200 })
            .then(function () {
              return bugShowAttachOptions();
            });
          return;
        }

        // Em outros estados, ignore entradas
        return;
      }

      // Generic premium flow (gen.*)
      if (String(state.flow || '').indexOf('gen.') === 0) {
        genHandleUserText(t);
        return;
      }

      // Track flow (track.*): hoje só aceita busca por protocolo quando solicitado
      if (String(state.flow || '').indexOf('track.') === 0) {
        var low = String(t || '').trim().toLowerCase();
        if (low === 'menu' || low === 'home') {
          resetToHome();
          return;
        }
        if (state.flow === 'track.search') {
          // valida minimamente pra evitar "oi"
          if (String(t).length < 4) {
            botSay('Esse protocolo parece curto demais. Você pode colar o número completo?', { base: 900, perChar: 9, jitter: 650, min: 1200, max: 3200 });
            return;
          }
          openMyDetail(t);
          return;
        }
        // fora do modo busca, ignore entradas
        return;
      }
    }

    function bugBuildPayloadText() {
      var page = state.bug.pageUrl || state.bug.currentUrl || '';
      return (
        'BUG\n' +
        'Página: ' + (page || '-') + '\n' +
        'Tentativa: ' + (state.bug.tentativa || '-') + '\n' +
        'Ocorreu: ' + (state.bug.ocorreu || '-')
      );
    }

    function bugFinalizeAndClose(file) {
      var message = bugBuildPayloadText();
      state.flow = 'bug.sending';
      setQuickButtons([]);
      setComposer({ placeholder: 'Mensagem', disabled: true });

      function finishWithProtocol(id) {
        setHeaderAvatarConfirm();
        var pid = id ? String(id) : '';
        var msg13 = 'Certo, seu feedback foi registrado em nosso banco de dados e logo será solucionado por um de nossos técnicos. Foi gerado o número de protocolo ' + (pid || 'XXXXXXXXXXX') + ', com o qual você poderá acompanhar a solução desse problema, neste canal.';
        var msg14 = 'A WD Gestor agradece a sua participação na construção de uma ferramenta de software que se desenvolve e se torna cada dia melhor, tenha um ótimo dia! Obrigado :-)';
        return botSay(msg13, { base: 1200, perChar: 9, jitter: 720, min: 1800, max: 5200 })
          .then(function () { return botSay(msg14, { base: 1100, perChar: 9, jitter: 720, min: 1600, max: 4800 }); })
          .then(function () {
            setQuickButtons([
              { id: 'track', label: 'Acompanhar meus feedbacks', icon: iconUrl('acompfeedback.png'), onClick: function () { startTrack(); } },
              { id: 'new', label: 'Novo feedback', onClick: function () { resetToHome(); } }
            ]);
            setComposer({ placeholder: 'Mensagem', disabled: true });
            state.pendingAttachment = null;
          });
      }

      return createFeedback(message)
        .then(function (env) {
          // guarda id para permitir retry de upload sem recriar feedback
          state.lastCreatedId = env && env.id ? env.id : state.lastCreatedId;
          var fid = env && env.id ? String(env.id) : '';
          if (!file) return finishWithProtocol(fid);

          return uploadAttachment(fid, file)
            .then(function (up) {
              if (up && up.ok) return finishWithProtocol(fid);

              // Falhou anexar: oferece retry premium
              state.flow = 'bug.retryUpload';
              var why = (up && up.message) ? String(up.message) : 'Não consegui anexar a imagem.';
              return botSay('Não consegui anexar a imagem agora. Motivo: ' + why + '\nVocê pode tentar novamente ou continuar sem anexo.', { base: 950, perChar: 9, jitter: 650, min: 1400, max: 4200 })
                .then(function () {
                  setQuickMode('choices');
                  setQuickButtons([
                    { id: 'retryUpload', label: 'Tentar anexar novamente', onClick: function () { state.flow = 'bug.retryUpload'; openFilePicker(); } },
                    { id: 'skipUpload', label: 'Continuar sem anexo', onClick: function () { state.flow = 'bug.sending'; setQuickMode(null); setQuickButtons([]); finishWithProtocol(fid); } }
                  ]);
                  setComposer({ placeholder: 'Mensagem', disabled: true });
                });
            });
        })
        .catch(function (e) {
          return botSay((e && e.message) ? e.message : 'Falha ao enviar.', { base: 900, perChar: 10, jitter: 650, min: 1200, max: 3200 })
            .then(function () {
              setQuickButtons([
                { id: 'home', label: 'Menu', onClick: function () { resetToHome(); } }
              ]);
              setComposer({ placeholder: 'Mensagem', disabled: true });
            });
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

      // Anexo só é aceito quando o usuário escolheu anexar no fluxo Bug ou Genérico
      if (
        state.flow !== 'bug.waitFile' &&
        state.flow !== 'bug.retryUpload' &&
        state.flow !== 'gen.waitFile' &&
        state.flow !== 'gen.retryUpload'
      ) return;
      if (!f) return;

      state.pendingAttachment = f;

      // Mensagem 12: miniatura (WhatsApp-like)
      try {
        var reader = new FileReader();
        reader.onload = function () {
          var url = String(reader.result || '');
          if (url) addImageThumb('out', url, f.name);
          // após anexar, envia
          if (String(state.flow || '').indexOf('bug.') === 0) bugFinalizeAndClose(f);
          else genFinalize(f);
        };
        reader.onerror = function () {
          addMessage('in', 'Imagem anexada: ' + f.name + '.');
          if (String(state.flow || '').indexOf('bug.') === 0) bugFinalizeAndClose(f);
          else genFinalize(f);
        };
        reader.readAsDataURL(f);
      } catch (_e1) {
        addMessage('in', 'Imagem anexada: ' + f.name + '.');
        if (String(state.flow || '').indexOf('bug.') === 0) bugFinalizeAndClose(f);
        else genFinalize(f);
      }
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
      // inicia com a saudação do header (se existir), com "digitando..." antes
      var greet = root.querySelector('[data-feedback-greeting]');
      var greetText = greet ? greet.textContent.trim() : 'Olá! Sou o assistente do WD Gestor. Como posso ajudar?';

      // Enquanto carrega a conversa inicial, não deixe o usuário digitar.
      setQuickButtons([]);
      setComposer({ placeholder: 'Mensagem', disabled: true });
      setHeaderAvatarIntro();

      enqueueUi(function () {
        return showTypingHuman(greetText, { base: 900, perChar: 12, jitter: 650, min: 1000, max: 2600 })
          .then(function () {
            addMessage('in', greetText);
          });
      }).then(function () {
        // sequência de conversa
        resetToHome();
        autoResizeInput();
      });
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
