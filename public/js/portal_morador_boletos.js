(function(){
  const basePath = document.body?.dataset?.basePath || '/portal-morador';
  const habSelect = document.getElementById('pmHabSelect');
  const listAvencer = document.getElementById('pmListAvencer');
  const listPagos = document.getElementById('pmListPagos');
  const emptyAvencer = document.getElementById('pmEmptyAvencer');
  const emptyPagos = document.getElementById('pmEmptyPagos');
  const countAvencer = document.getElementById('pmCountAvencer');
  const countPagos = document.getElementById('pmCountPagos');
  const startInput = document.getElementById('pmStartMonth');
  const endInput = document.getElementById('pmEndMonth');
  const btnApply = document.getElementById('pmBtnApply');
  const periodoError = document.getElementById('pmPeriodoError');
  const habLabelEl = document.getElementById('pmHabLabel');
  const habIdFromBody = document.body?.dataset?.habId || '';
  const habLabelFromBody = document.body?.dataset?.habLabel || '';
  const errPlaceholder = 'Falha ao carregar. Tente novamente.';

  // Modal elements
  const modal = document.getElementById('pmModal');
  const modalTitle = document.getElementById('pmModalTitle');
  const modalBadge = document.getElementById('pmModalBadge');
  const modalDesc = document.getElementById('pmModalDesc');
  const modalText = document.getElementById('pmModalText');
  const modalQrWrap = document.getElementById('pmModalQrWrap');
  const modalQr = document.getElementById('pmModalQr');
  const modalQrHint = document.getElementById('pmModalQrHint');
  const modalClose = document.getElementById('pmModalClose');
  const modalBtnCopy = document.getElementById('pmBtnCopy');
  const modalBtnPdf = document.getElementById('pmBtnPdf');
  const modalHint = document.getElementById('pmModalHint');
  let modalPdfUrl = '';

  function fmtMoney(v){
    try { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); } catch { return 'R$ 0,00'; }
  }
  function fmtDate(iso){
    try { const d=new Date(iso); if(Number.isNaN(d.getTime())) return ''; return d.toLocaleDateString('pt-BR'); } catch { return ''; }
  }
  function esc(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

  function monthStr(date){
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }

  function defaultPeriod(){
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth()-5);
    return { start: monthStr(start), end: monthStr(end) };
  }

  function monthsDiff(start, end){
    if(!start || !end) return 0;
    const [ys, ms] = start.split('-').map(Number);
    const [ye, me] = end.split('-').map(Number);
    return (ye-ys)*12 + (me-ms);
  }

  function validatePeriod(){
    if(periodoError){ periodoError.hidden = true; periodoError.textContent = ''; }
    const startVal = startInput?.value || '';
    const endVal = endInput?.value || '';
    if(!startVal || !endVal) return { ok: false, start: startVal, end: endVal, message: 'Selecione o período inicial e final.' };
    const diff = monthsDiff(startVal, endVal);
    if(diff < 0) return { ok: false, start: startVal, end: endVal, message: 'Período final não pode ser menor que o inicial.' };
    if(diff > 5) return { ok: false, start: startVal, end: endVal, message: 'Selecione no máximo 6 meses.' };
    return { ok: true, start: startVal, end: endVal };
  }

  function showEmpty(el, msg){
    if(!el) return;
    el.textContent = msg || el.textContent || '';
    el.hidden = false;
  }

  function openModal({ badge, title, desc, text, qrData, qrHint, pdfUrl }){
    if(modalBadge) modalBadge.textContent = badge || '';
    if(modalTitle) modalTitle.textContent = title || '';
    if(modalDesc) modalDesc.textContent = desc || '';
    if(modalText) modalText.textContent = text || '';
    const isPix = String(badge||'').toLowerCase().includes('pix');
    // reset modal visuals
    modalQrWrap.hidden = true;
    modalQr.src = '';
    if(modalBtnPdf){ modalBtnPdf.hidden = true; }
    modalPdfUrl = '';

    // QR
    if(qrData){
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrData)}`;
      modalQr.src = qrUrl;
      modalQrWrap.hidden = false;
      modalQrHint.textContent = qrHint || 'Escaneie para pagar via Pix';
    }

    // PDF button
    if(!isPix && pdfUrl){
      modalPdfUrl = pdfUrl;
      if(modalBtnPdf){
        modalBtnPdf.hidden = false;
        modalBtnPdf.style.display = 'inline-flex';
        modalBtnPdf.removeAttribute('aria-hidden');
      }
    } else {
      modalPdfUrl = '';
      if(modalBtnPdf){
        modalBtnPdf.hidden = true;
        modalBtnPdf.style.display = 'none';
        modalBtnPdf.setAttribute('aria-hidden','true');
      }
    }

    if(modalHint) modalHint.textContent = text ? 'Toque em copiar para levar o código.' : '';
    modal.hidden = false;
  }

  function closeModal(){ modal.hidden = true; }

  async function copyText(){
    const txt = modalText?.textContent || '';
    if(!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      if(modalHint) modalHint.textContent = 'Copiado!';
    } catch {
      if(modalHint) modalHint.textContent = 'Não foi possível copiar.';
    }
  }

  function openPdf(){
    if(!modalPdfUrl) return;
    window.open(modalPdfUrl,'_blank');
  }

  async function api(url){
    const r = await fetch(url,{headers:{'Accept':'application/json','X-Requested-With':'fetch'}, credentials:'same-origin'});
    const j = await r.json().catch(()=>null);
    if(!r.ok) throw new Error(j?.error||'Falha ao carregar');
    return j;
  }

  function renderBoletos(targetList, emptyEl, countEl, boletos){
    const arr = Array.isArray(boletos)? boletos : [];
    if(countEl) countEl.textContent = `${arr.length} item${arr.length===1?'':'s'}`;
    if(!arr.length){
      targetList.innerHTML='';
      showEmpty(emptyEl);
      return;
    }
    emptyEl.hidden=true;
    targetList.innerHTML = arr.map(b=>{
      const id = esc(b.id || b._id || '');
      const venc = fmtDate(b.vencimento);
      const pago = fmtDate(b.data_pagamento || b.dataPagamento);
      const val = fmtMoney(b.valor);
      const status = String(b.status||'avencer').toLowerCase();
      const statusLabel = status==='pago'?'Pago':'À vencer';
      return `
        <article class="pm-boleto-card" data-id="${id}">
          <div class="pm-boleto-left">
            <div class="pm-boleto-title">${esc(b.descricao || 'Boleto')}</div>
            <div class="pm-boleto-meta">
              <span><i class="bi bi-calendar-event"></i> Vencimento: ${venc||'-'}</span>
              ${status==='pago' && pago ? `<span><i class="bi bi-check-circle"></i> Pago: ${pago}</span>` : ''}
              <span><i class="bi bi-cash-coin"></i> ${val}</span>
              <span class="pm-chip-status" data-status="${esc(status)}">${statusLabel}</span>
            </div>
          </div>
          <div class="pm-boleto-actions">
            <button class="pm-boleto-btn" data-action="linha" data-id="${id}"><i class="bi bi-upc-scan"></i>Cód. barras</button>
            <button class="pm-boleto-btn" data-action="pdf" data-id="${id}"><i class="bi bi-file-earmark-pdf"></i>PDF</button>
            <button class="pm-boleto-btn" data-action="pix" data-id="${id}"><i class="bi bi-qr-code"></i>Pix</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function wireActions(container){
    container.addEventListener('click', async (ev)=>{
      const btn = ev.target.closest('[data-action]');
      if(!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if(!id) return;
      try {
        if(action==='linha'){
          const j = await api(`${basePath}/api/boletos/${id}/codigo`);
          const codigo = j?.codigo || 'Código indisponível.';
          openModal({
            badge: 'Código de barras',
            title: 'Linha digitável',
            desc: 'Copie e cole no seu banco para pagar.',
            text: codigo,
            qrData: '',
            pdfUrl: `${basePath}/api/boletos/${id}/pdf`
          });
        }
        if(action==='pdf'){
          const url = `${basePath}/api/boletos/${id}/pdf`;
          window.open(url,'_blank');
        }
        if(action==='pix'){
          const j = await api(`${basePath}/api/boletos/${id}/pix`);
          const payload = j?.payload || 'Pix indisponível.';
          openModal({
            badge: 'Pix',
            title: 'QR Code e copia e cola',
            desc: 'Escaneie o QR ou copie o código Pix.',
            text: payload,
            qrData: payload,
            qrHint: 'Escaneie para pagar pelo app do banco'
          });
        }
      } catch(e){
        openModal({
          badge: 'Erro',
          title: 'Não foi possível carregar',
          desc: e?.message || 'Falha ao processar.',
          text: ''
        });
      }
    });
  }

  async function loadBoletos(habId){
    try {
      const resolvedHabId = habId || habIdFromBody || habSelect?.value || '';
      if(!resolvedHabId){
        showEmpty(emptyAvencer, 'Nenhum boleto disponível.');
        showEmpty(emptyPagos, 'Nenhum boleto disponível.');
        return;
      }
      const startVal = startInput?.value;
      const endVal = endInput?.value;
      const params = new URLSearchParams();
      params.set('hab', resolvedHabId);
      if(startVal) params.set('start', startVal);
      if(endVal) params.set('end', endVal);
      const j = await api(`${basePath}/api/boletos?${params.toString()}`);
      const avencer = Array.isArray(j?.avencer)? j.avencer : [];
      const pagos = Array.isArray(j?.pagos)? j.pagos : [];
      renderBoletos(listAvencer, emptyAvencer, countAvencer, avencer);
      renderBoletos(listPagos, emptyPagos, countPagos, pagos);
    } catch(e){
      renderBoletos(listAvencer, emptyAvencer, countAvencer, []);
      renderBoletos(listPagos, emptyPagos, countPagos, []);
      showEmpty(emptyAvencer, errPlaceholder);
      showEmpty(emptyPagos, errPlaceholder);
      console.error(e);
    }
  }
  wireActions(document.body);
  modalClose?.addEventListener('click', closeModal);
  modal.addEventListener('click', (ev)=>{ if(ev.target === modal) closeModal(); });
  modalBtnCopy?.addEventListener('click', copyText);
  modalBtnPdf?.addEventListener('click', openPdf);
  if(habLabelEl){
    habLabelEl.textContent = habLabelFromBody || 'Habitação selecionada';
  }
  if(habSelect && habIdFromBody){
    habSelect.value = habIdFromBody;
  }
  const def = defaultPeriod();
  if(startInput) startInput.value = def.start;
  if(endInput) endInput.value = def.end;
  if(btnApply){
    btnApply.addEventListener('click', ()=>{
      const val = validatePeriod();
      if(!val.ok){
        if(periodoError){ periodoError.hidden = false; periodoError.textContent = val.message; }
        return;
      }
      if(periodoError){ periodoError.hidden = true; periodoError.textContent = ''; }
      loadBoletos(habIdFromBody || habSelect?.value || '');
    });
  }
  loadBoletos(habIdFromBody || habSelect?.value || '');
})();
