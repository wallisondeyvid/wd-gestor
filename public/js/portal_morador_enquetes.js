(function(){
  var basePath = (document.body && document.body.dataset && document.body.dataset.basePath) ? document.body.dataset.basePath : '/portal-morador';
  var habId = (document.body && document.body.dataset && document.body.dataset.habId) ? String(document.body.dataset.habId || '').trim() : '';

  var qs = (window && window.location && window.location.search) ? String(window.location.search) : '';
  var wantDebug = /(?:\?|&)(debug|__debug|__debugEnquetes)=1(?:&|$)/.test(qs);

  var listEl = document.querySelector('[data-enq-list]');
  var emptyEl = document.querySelector('[data-enq-empty]');
  var chipsWrap = document.querySelector('[data-enq-chips]');

  var modalPortal = document.getElementById('pmEnqModalPortal');
  var modal = document.getElementById('pmEnqModal');
  var modalTitle = document.querySelector('[data-enq-modal-title]');
  var modalBody = document.querySelector('[data-enq-modal-body]');
  var modalClose = document.querySelector('[data-enq-modal-close]');

  var imgViewer = null;
  var imgViewerImg = null;
  var imgViewerClose = null;
  var imgViewerOpen = false;

  if(!listEl) return;

  function esc(str){
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeImgSrc(url){
    var s = String(url || '').trim();
    if(!s) return '';
    // Evita data URLs no portal por segurança e peso.
    if(/^data:/i.test(s)) return '';
    if(s.charAt(0) === '/') return s;
    if(/^https?:\/\//i.test(s)) return s;
    return '';
  }

  function ensureImgViewer(){
    if(imgViewer) return;
    try{
      var wrap = document.createElement('div');
      wrap.className = 'pm-enq-imgviewer';
      wrap.hidden = true;
      wrap.setAttribute('aria-hidden','true');
      wrap.innerHTML = ''
        + '<div class="pm-enq-imgviewer-card" role="dialog" aria-modal="true" aria-label="Imagem ampliada">'
        + '  <button type="button" class="pm-enq-imgviewer-close" aria-label="Fechar">×</button>'
        + '  <img alt="">'
        + '</div>';
      document.body.appendChild(wrap);
      imgViewer = wrap;
      imgViewerClose = wrap.querySelector('.pm-enq-imgviewer-close');
      imgViewerImg = wrap.querySelector('img');

      wrap.addEventListener('click', function(ev){
        var card = ev.target && ev.target.closest ? ev.target.closest('.pm-enq-imgviewer-card') : null;
        if(card) return;
        closeImgViewer();
      });
      if(imgViewerClose){
        imgViewerClose.addEventListener('click', function(){ closeImgViewer(); });
      }
    }catch(_e){
      imgViewer = null;
      imgViewerImg = null;
      imgViewerClose = null;
    }
  }

  function openImgViewer(url){
    ensureImgViewer();
    if(!imgViewer || !imgViewerImg) return;
    var s = safeImgSrc(url);
    if(!s) return;
    imgViewerImg.src = s;
    imgViewer.hidden = false;
    imgViewerOpen = true;
    try{ imgViewer.setAttribute('aria-hidden','false'); }catch(_e){}
  }

  function closeImgViewer(){
    if(!imgViewer || !imgViewerImg) return;
    imgViewer.hidden = true;
    imgViewerOpen = false;
    try{ imgViewer.setAttribute('aria-hidden','true'); }catch(_e){}
    try{ imgViewerImg.removeAttribute('src'); }catch(_e){}
  }

  function safeDate(v){
    if(!v) return null;
    var d = new Date(v);
    if(!isFinite(d.getTime())) return null;
    return d;
  }

  function fmtDt(v){
    var d = safeDate(v);
    if(!d) return '—';
    return d.toLocaleString('pt-BR');
  }

  function statusLabel(st){
    return st === 'ativo' ? 'Ativa' : 'Inativa';
  }

  var ICON_PLAY = '/images/play.png';
  var ICON_PAUSE = '/images/pause.png';
  var ICON_CHECK = '/images/verifica.png';
  var ICON_RESULT = '/images/resultado.png';
  var ICON_VOTO = '/images/voto.png';

  function truncateText(s, max){
    var text = String(s || '');
    var limit = Number(max || 0);
    if(!isFinite(limit) || limit <= 0) return text;
    if(text.length <= limit) return text;
    var cut = text.slice(0, Math.max(0, limit - 3));
    var idx = cut.lastIndexOf(' ');
    if(idx > Math.max(12, cut.length - 40)) cut = cut.slice(0, idx);
    return cut.replace(/[\s\u00A0]+$/g, '') + '...';
  }

  function renderChips(items){
    if(!chipsWrap) return;
    var arr = Array.isArray(items) ? items : [];
    var total = arr.length;
    var ativas = arr.filter(function(i){ return i && i.status === 'ativo'; }).length;
    var votadas = arr.filter(function(i){ return !!(i && i.jaVotou); }).length;
    chipsWrap.innerHTML = [
      '<span class="pm-enq-chip"><i class="bi bi-list-check" aria-hidden="true"></i><b>' + total + '</b> enquetes</span>',
      '<span class="pm-enq-chip"><i class="bi bi-lightning-charge" aria-hidden="true"></i><b>' + ativas + '</b> ativas</span>',
      '<span class="pm-enq-chip"><i class="bi bi-check2-circle" aria-hidden="true"></i><b>' + votadas + '</b> votadas</span>'
    ].join('');
  }

  function renderList(items){
    var arr = Array.isArray(items) ? items : [];
    renderChips(arr);

    if(!arr.length){
      if(emptyEl) emptyEl.hidden = false;
      listEl.innerHTML = '';
      return;
    }
    if(emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = arr.map(function(it){
      var pergunta = String(it && it.pergunta ? it.pergunta : '').trim() || 'Enquete';
      var perguntaShort = truncateText(pergunta, 200);
      var st = String(it && it.status ? it.status : 'inativo');
      var badgeClass = st === 'ativo' ? 'is-ativo' : 'is-inativo';
      var badgeIcon = st === 'ativo' ? ICON_PLAY : ICON_PAUSE;
      var subLeft = it && it.vigencia_fim ? ('Até ' + fmtDt(it.vigencia_fim)) : '';
      var ctaText = it && it.jaVotou ? 'Ver resumo' : (st === 'ativo' ? 'Votar agora' : 'Ver resumo');
      var ctaClass = (st === 'ativo' && !it.jaVotou) ? '' : ' pm-enq-cta--ghost';
      var votedChip = it && it.jaVotou
        ? '<span class="pm-enq-chip pm-enq-chip--voted"><img class="pm-enq-ico" src="' + esc(ICON_CHECK) + '" alt="" aria-hidden="true">Voto registrado</span>'
        : '';
      var cardCls = 'pm-enq-card ' + (st === 'ativo' ? 'is-ativo' : 'is-inativo') + (it && it.jaVotou ? ' is-votada' : '');
      var ctaIcon = (ctaText === 'Ver resumo') ? ICON_RESULT : ICON_VOTO;

      return (
        '<div class="' + cardCls + '" role="button" tabindex="0" title="Clique para abrir" aria-label="Clique para abrir" data-enq-card data-enq-id="' + esc(it._id) + '">' 
          + '<div class="pm-enq-card-head">'
            + '<h3 class="pm-enq-card-title">' + esc(perguntaShort) + '</h3>'
            + '<span class="pm-enq-badge ' + badgeClass + '"><img class="pm-enq-ico" src="' + esc(badgeIcon) + '" alt="" aria-hidden="true">' + esc(statusLabel(st)) + '</span>'
          + '</div>'
          + '<div class="pm-enq-bottom">'
            + '<span class="pm-enq-bottom-left">' + esc(subLeft) + '</span>'
            + '<span class="pm-enq-bottom-center">' + (votedChip || '') + '</span>'
            + '<span class="pm-enq-bottom-right">'
              + '<button class="pm-enq-cta' + ctaClass + '" type="button" tabindex="-1"><img class="pm-enq-ico pm-enq-ico--cta" src="' + esc(ctaIcon) + '" alt="" aria-hidden="true">' + esc(ctaText) + '</button>'
            + '</span>'
          + '</div>'
        + '</div>'
      );
    }).join('');
  }

  function openModal(){
    if(!modalPortal) return;
    modalPortal.hidden = false;
    document.addEventListener('keydown', onKeyDown);
  }

  function closeModal(){
    if(!modalPortal) return;
    modalPortal.hidden = true;
    if(modalBody) modalBody.innerHTML = '';
    closeImgViewer();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(ev){
    if(ev.key === 'Escape'){
      if(imgViewerOpen){
        closeImgViewer();
        return;
      }
      closeModal();
    }
  }

  // Garantia: a página sempre inicia com o modal fechado.
  // Também ajuda em cenários de cache/restore de navegação.
  closeModal();

  window.addEventListener('pageshow', function(){
    closeModal();
  });

  // Fechamento robusto (mesmo se algum listener específico falhar)
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if(!t) return;
    var closeHit = t.closest ? t.closest('[data-enq-modal-close],[data-enq-cancel]') : null;
    if(closeHit){
      ev.preventDefault();
      closeModal();
    }
  });

  // Zoom no modal (pergunta + alternativas)
  if(modalPortal){
    modalPortal.addEventListener('click', function(ev){
      var t = ev.target;
      if(!t) return;
      var img = t.closest ? t.closest('.pm-enq-photo-img, .pm-enq-opt-thumb') : null;
      if(!img) return;
      var src = img.getAttribute ? String(img.getAttribute('src') || '').trim() : '';
      if(!src) return;
      openImgViewer(src);
    });
  }

  function renderSummary(details){
    var total = Number(details && details.totalVotos) || 0;
    var opcoes = Array.isArray(details && details.opcoes) ? details.opcoes : [];
    var picked = details && details.userOpcaoId ? String(details.userOpcaoId) : '';
    var status = details && details.status ? String(details.status) : (details && details.enquete && details.enquete.status ? String(details.enquete.status) : '');
    var fotoPergunta = details && details.enquete ? safeImgSrc(details.enquete.foto_pergunta) : '';

    var pickedLabel = '';
    if(picked){
      for(var i=0;i<opcoes.length;i++){
        var o2 = opcoes[i];
        if(o2 && String(o2.opcaoId) === picked){
          pickedLabel = String(o2.texto || '').trim();
          break;
        }
      }
    }

    var html = '';

    if(fotoPergunta){
      html += '<div class="pm-enq-photo"><img class="pm-enq-photo-img" src="' + esc(fotoPergunta) + '" alt="Imagem da enquete" loading="lazy"></div>';
    }

    html += '<div class="pm-enq-summary">';
    html += '<div class="pm-enq-kpis" aria-label="Resumo">';
    html += '  <div class="pm-enq-kpi-card"><small>Votantes</small><strong>' + esc(total) + '</strong></div>';
    html += '  <div class="pm-enq-kpi-card"><small>Seu voto</small><strong>' + esc(pickedLabel || '—') + '</strong></div>';
    html += '  <div class="pm-enq-kpi-card"><small>Status</small><strong>' + esc(status ? statusLabel(status) : '—') + '</strong></div>';
    html += '</div>';
    html += '</div>';

    html += opcoes.map(function(o){
      var pct = Number(o && o.percent) || 0;
      if(pct < 0) pct = 0;
      if(pct > 100) pct = 100;
      var votes = Number(o && o.votos) || 0;
      var isPicked = picked && String(o.opcaoId) === picked;
      var pctLabel = pct.toFixed(1).replace('.', ',');
      var optFoto = safeImgSrc(o && o.foto);
      return (
        '<div class="pm-enq-bar' + (isPicked ? ' pm-enq-picked' : '') + '">'
          + '<div class="pm-enq-bar-top">'
          +   '<div class="pm-enq-bar-left">'
          +     (optFoto ? '<img class="pm-enq-opt-thumb" src="' + esc(optFoto) + '" alt="" loading="lazy">' : '')
          +     '<b>' + esc(o.texto) + (isPicked ? ' <span style="font-weight:900;color:var(--pm-blue-700)">· seu voto</span>' : '') + '</b>'
          +   '</div>'
          +   '<span>' + esc(votes) + ' voto(s) · ' + esc(pctLabel) + '%</span>'
          + '</div>'
          + '<div class="pm-enq-bar-track"><div class="pm-enq-bar-fill" style="width:' + esc(pct.toFixed(2)) + '%"></div></div>'
        + '</div>'
      );
    }).join('');

    if(total === 0){
      html += '<div class="pm-enq-alert" style="margin-top:10px">Nenhum voto registrado até agora.</div>';
    }

    html += '<div class="pm-enq-footer">'
      + '<button class="pm-enq-cta pm-enq-cta--ghost" type="button" data-enq-cancel><i class="bi bi-x-lg" aria-hidden="true"></i>Fechar</button>'
      + '</div>';

    return html;
  }

  function renderVoteForm(details){
    var opcoes = Array.isArray(details && details.opcoes) ? details.opcoes : [];
    var id = details && details.enquete ? String(details.enquete._id || '') : '';

    var fotoPergunta = details && details.enquete ? safeImgSrc(details.enquete.foto_pergunta) : '';

    var status = details && details.status ? String(details.status) : (details && details.enquete && details.enquete.status ? String(details.enquete.status) : '');
    var vigIni = details && details.enquete && details.enquete.vigencia_inicio ? fmtDt(details.enquete.vigencia_inicio) : '—';
    var vigFim = details && details.enquete && details.enquete.vigencia_fim ? fmtDt(details.enquete.vigencia_fim) : '—';

    var html = '';

    if(fotoPergunta){
      html += '<div class="pm-enq-photo"><img class="pm-enq-photo-img" src="' + esc(fotoPergunta) + '" alt="Imagem da enquete" loading="lazy"></div>';
    }

    html += '<div class="pm-enq-kpis" aria-label="Informações">'
      + '  <div class="pm-enq-kpi-card"><small>Status</small><strong>' + esc(status ? statusLabel(status) : '—') + '</strong></div>'
      + '  <div class="pm-enq-kpi-card"><small>Início</small><strong>' + esc(vigIni) + '</strong></div>'
      + '  <div class="pm-enq-kpi-card"><small>Fim</small><strong>' + esc(vigFim) + '</strong></div>'
      + '</div>';

    html += '<form data-enq-vote-form>';
    html += '<div class="pm-enq-section-title">Alternativas</div>';
    html += opcoes.map(function(o){
      var optFoto = safeImgSrc(o && o.foto);
      return (
        '<label class="pm-enq-opt" data-opt-label>'
          + '<input type="radio" name="opcao" value="' + esc(o.opcaoId) + '">'
          + (optFoto ? '<img class="pm-enq-opt-thumb" src="' + esc(optFoto) + '" alt="" loading="lazy">' : '')
          + '<strong>' + esc(o.texto) + '</strong>'
        + '</label>'
      );
    }).join('');

    html += '<div class="pm-enq-actions">'
      + '<button class="pm-enq-cta pm-enq-cta--ghost" type="button" data-enq-cancel><i class="bi bi-x-lg" aria-hidden="true"></i>Cancelar</button>'
      + '<button class="pm-enq-cta" type="submit" disabled data-enq-confirm><i class="bi bi-check2" aria-hidden="true"></i>Confirmar voto</button>'
      + '</div>';

    html += '</form>';

    return { html: html, enqueteId: id };
  }

  async function loadList(){
    if(!habId){
      if(emptyEl){
        emptyEl.hidden = false;
        emptyEl.innerHTML = '<strong>Selecione uma habitação.</strong><div style="margin-top:6px">Use o seletor de habitação no topo para carregar suas enquetes.</div>';
      }
      listEl.innerHTML = '';
      return;
    }

    try {
      var url = basePath + '/api/enquetes?hab=' + encodeURIComponent(habId || '') + (wantDebug ? '&debug=1' : '');
      var resp = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, cache: 'no-store' });
      var j = await resp.json().catch(function(){ return null; });
      if(!resp.ok || !j || !j.ok) throw new Error((j && j.error) || 'Falha ao carregar');
      if(wantDebug && j && j.debug){
        try {
          console.warn('[portal-morador][enquetes] debug', j.debug);
        } catch {}
      }
      renderList(j.data || []);
    } catch (e) {
      renderList([]);
      if(emptyEl){
        emptyEl.hidden = false;
        emptyEl.innerHTML = '<strong>Não foi possível carregar as enquetes.</strong>'
          + '<div style="margin-top:6px">Tente atualizar a página. Se persistir, pode ser instabilidade de conexão com o servidor.</div>';
      }
    }
  }

  async function loadDetails(enqueteId){
    var url = basePath + '/api/enquetes/' + encodeURIComponent(enqueteId) + '/detalhes?hab=' + encodeURIComponent(habId || '');
    var resp = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, cache: 'no-store' });
    var j = await resp.json().catch(function(){ return null; });
    if(!resp.ok || !j || !j.ok) throw new Error((j && j.error) || 'Falha ao carregar detalhes');
    return j;
  }

  async function vote(enqueteId, opcaoId){
    var url = basePath + '/api/enquetes/' + encodeURIComponent(enqueteId) + '/votar';
    var resp = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ opcao_id: opcaoId, hab: habId || '' })
    });
    var j = await resp.json().catch(function(){ return null; });
    if(!resp.ok || !j || !j.ok) throw new Error((j && j.error) || 'Falha ao votar');
    return j;
  }

  async function openEnquete(enqueteId){
    if(!modalBody) return;
    openModal();
    if(modalTitle) modalTitle.textContent = 'Carregando...';
    modalBody.innerHTML = '<div class="pm-enq-alert">Carregando detalhes...</div>';

    if(!habId){
      if(modalTitle) modalTitle.textContent = 'Enquetes';
      modalBody.innerHTML = '<p style="margin:0;color:#b91c1c;font-weight:700">Selecione uma habitação para continuar.</p>'
        + '<div class="pm-enq-actions"><button class="pm-enq-cta pm-enq-cta--ghost" type="button" data-enq-cancel><i class="bi bi-x-lg" aria-hidden="true"></i>Fechar</button></div>';
      modalBody.querySelector('[data-enq-cancel]')?.addEventListener('click', closeModal);
      return;
    }

    try {
      var details = await loadDetails(enqueteId);
      var pergunta = (details && details.enquete && details.enquete.pergunta) ? String(details.enquete.pergunta) : 'Enquete';
      if(modalTitle) modalTitle.textContent = pergunta;

      if(details && details.podeVotar){
        var formInfo = renderVoteForm(details);
        modalBody.innerHTML = formInfo.html;

        var form = modalBody.querySelector('[data-enq-vote-form]');
        var btnConfirm = modalBody.querySelector('[data-enq-confirm]');
        var btnCancel = modalBody.querySelector('[data-enq-cancel]');

        if(btnCancel) btnCancel.addEventListener('click', closeModal);

        if(form){
          form.addEventListener('change', function(){
            var checked = form.querySelector('input[name="opcao"]:checked');
            if(btnConfirm) btnConfirm.disabled = !checked;

            try {
              var labels = form.querySelectorAll('[data-opt-label]');
              labels.forEach(function(lb){ lb.classList.remove('is-selected'); });
              if(checked && checked.closest){
                var hit = checked.closest('[data-opt-label]');
                if(hit) hit.classList.add('is-selected');
              }
            } catch {}
          });

          form.addEventListener('submit', async function(ev){
            ev.preventDefault();
            var checked = form.querySelector('input[name="opcao"]:checked');
            if(!checked) return;
            if(btnConfirm){
              btnConfirm.disabled = true;
              btnConfirm.innerHTML = '<i class="bi bi-hourglass-split" aria-hidden="true"></i>Registrando...';
            }
            try {
              var voted = await vote(formInfo.enqueteId, String(checked.value || ''));
              modalBody.innerHTML = '<div class="pm-enq-alert pm-enq-alert--ok">'
                + '<div style="display:flex;gap:10px;align-items:flex-start">'
                + '  <i class="bi bi-check2-circle" aria-hidden="true" style="font-size:16px;line-height:1.2;margin-top:1px"></i>'
                + '  <div><div style="font-weight:900;margin-bottom:3px">Voto confirmado</div><div>Confira o resumo da enquete abaixo.</div></div>'
                + '</div>'
                + '</div>'
                + renderSummary(voted);
              await loadList();
            } catch (err) {
              var msg = (err && err.message) ? err.message : 'Falha ao votar';
              modalBody.innerHTML = '<p style="margin:0;color:#b91c1c;font-weight:700">' + esc(msg) + '</p>'
                + '<div class="pm-enq-actions"><button class="pm-enq-cta pm-enq-cta--ghost" type="button" data-enq-cancel><i class="bi bi-x-lg" aria-hidden="true"></i>Fechar</button></div>';
              modalBody.querySelector('[data-enq-cancel]')?.addEventListener('click', closeModal);
            }
          });
        }
      } else {
        modalBody.innerHTML = '<div class="pm-enq-section-title">Resumo</div>' + renderSummary(details);
        modalBody.querySelector('[data-enq-cancel]')?.addEventListener('click', closeModal);
      }
    } catch (err) {
      var msg2 = (err && err.message) ? err.message : 'Falha ao abrir enquete';
      if(modalTitle) modalTitle.textContent = 'Enquetes';
      modalBody.innerHTML = '<p style="margin:0;color:#b91c1c;font-weight:700">' + esc(msg2) + '</p>'
        + '<div class="pm-enq-actions"><button class="pm-enq-cta pm-enq-cta--ghost" type="button" data-enq-cancel><i class="bi bi-x-lg" aria-hidden="true"></i>Fechar</button></div>';
      modalBody.querySelector('[data-enq-cancel]')?.addEventListener('click', closeModal);
    }
  }

  listEl.addEventListener('click', function(ev){
    var card = ev.target.closest('[data-enq-card]');
    if(!card) return;
    var id = String(card.getAttribute('data-enq-id') || '').trim();
    if(!id) return;
    openEnquete(id);
  });

  listEl.addEventListener('keydown', function(ev){
    if(ev.key !== 'Enter' && ev.key !== ' ') return;
    var card = ev.target.closest('[data-enq-card]');
    if(!card) return;
    ev.preventDefault();
    var id = String(card.getAttribute('data-enq-id') || '').trim();
    if(!id) return;
    openEnquete(id);
  });

  modalClose && modalClose.addEventListener('click', closeModal);
  modalPortal && modalPortal.addEventListener('click', function(ev){
    if(ev.target === modalPortal) closeModal();
  });

  loadList();
})();
