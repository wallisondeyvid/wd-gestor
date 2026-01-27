// Captura facial mínima: getUserMedia + canvas + hash; preenche campos ocultos
(function(){
  const TAG = '[cadastro_bio_facial]';
  /* ------------------------------------------------------------------
     CAPTURA FACIAL (3 ETAPAS) - DOCUMENTAÇÃO RÁPIDA
     Etapas: 0=Frente, 1=Direita, 2=Esquerda. Auto-captura quando:
       - Critério da etapa ok (centralizado ou deslocado) E estabilidade >= X frames.
     Ajustes principais (procure CFG abaixo):
       CFG.AREA_MIN_BASE     => Tamanho mínimo (fração da largura/altura normalizada 0..1) para aceitar rosto.
       CFG.CENTER_TOL_X/Y    => Tolerância de centralização etapa 0.
       CFG.TURN_THRESHOLD    => Deslocamento horizontal (dx) relativo baseline para considerar virada lateral.
       CFG.STEADY_FRAMES     => Frames consecutivos para auto-captura.
       CFG.AUTO_GAP_MS       => Intervalo mínimo entre auto-capturas.
     Diagnóstico: Pressione ALT+D para painel (fps, dx, box, etapa).
     Fallback manual: Botão Capturar fica habilitado quando lastOkThisStep=true.
     Se ambiente lento: diminuir STEADY_FRAMES ou ampliar tolerâncias CENTER/TURN.
     ------------------------------------------------------------------ */

  // Configurações remanescentes (auto-captura desativada; mantido apenas para possível uso futuro)
  const CFG = {
    AREA_MIN_BASE: 0.025,
    AREA_MIN_OK: 0.03,
    CENTER_TOL_X: 0.25,
    CENTER_TOL_Y: 0.35,
    TURN_THRESHOLD: 0.022,
    TURN_THRESHOLD_NORM: 0.12,
    TURN_ABS_CX_RIGHT: 0.52,
    TURN_ABS_CX_LEFT: 0.48
  };
  if (window.WDModalBioFacial) return; // já definido

  function ensureInBody(modal){
    if(!modal) return;
    if(modal.parentElement !== document.body){
      try { document.body.appendChild(modal); } catch(_){}
    }
  }
  function cleanStuckBackdrop(){
    try{
      const anyOpen = !!document.querySelector('.modal.show');
      if(!anyOpen){
        document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
      }
    }catch(_){ }
  }

  window.WDModalBioFacial = {
    _inited: false,
    _stream: null,
    _captured: null,
    _currentDeviceId: null,
    async initOnce(){
      if (this._inited) return; this._inited = true;
      console.log(TAG, 'inicializado');

      // Abrir modal programaticamente (fallback para evitar backdrop bug)
      document.addEventListener('click', (ev)=>{
        const btn = ev.target.closest('[data-bs-target="#modalBiometriaFacial"]');
        if(!btn) return;
        const modal = document.getElementById('modalBiometriaFacial'); if(!modal) return;
        if(!(window.bootstrap && window.bootstrap.Modal)) return; // deixa o data-api agir
        try{ ev.preventDefault(); }catch(_){ }
        cleanStuckBackdrop(); ensureInBody(modal);
        try { window.bootstrap.Modal.getOrCreateInstance(modal, { backdrop:true, keyboard:true, focus:true }).show(); }
        catch(e){ console.warn(TAG, 'Falha ao abrir modal programaticamente:', e); }
      });

      const modal = document.getElementById('modalBiometriaFacial');
      const video = document.getElementById('faceVideo');
      const canvas = document.getElementById('faceCanvas');
      const btnCapture = document.getElementById('btnFaceCapture');
      const btnRetake = document.getElementById('btnFaceRetake');
      const btnOk = document.getElementById('btnConfirmarFacial');
      const faceStatus = document.getElementById('faceStatus');
      const faceSha = document.getElementById('faceSha256');
      const faceImgSize = document.getElementById('faceImgSize');
  const hiddenTemplate = document.getElementById('face_template_b64');
  const hiddenSha = document.getElementById('face_template_sha256');
  const hiddenImg = document.getElementById('face_imagem');
  const hiddenFaceCapturasJson = document.getElementById('face_capturas_json');
  const fieldHashDisplay = document.getElementById('hash_biometria_facial');
  const hiddenLiveness = document.getElementById('face_liveness_ok'); // opcional
  const thumbsResumo = document.getElementById('faceThumbsResumo');
  const faceInstructionExternal = document.getElementById('faceInstructionExternal');
  const facialHashesList = document.getElementById('facialHashesList');

      const cameraSelect = document.getElementById('cameraSelect');
      const cameraRefresh = document.getElementById('cameraRefresh');
      const overlayCanvas = document.getElementById('faceOverlayCanvas');
      let overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
      const thumbs = document.getElementById('faceThumbs');
      const btnClear = document.getElementById('btnFaceClear');

  // Progresso/liveness controlado abaixo junto do loop de análise

      function renderProgressRing(){ /* removido (UI substituída por barra de etapas externa) */ }

      function drawInstruction(text){
        if (!overlayCtx || !overlayCanvas) return;
        overlayCtx.fillStyle = 'rgba(255,255,255,0.95)';
        overlayCtx.font = '600 15px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        overlayCtx.textAlign = 'center';
        // fundo de leitura
        const pad = 8; const x = overlayCanvas.width/2; const y = 28;
        const metrics = overlayCtx.measureText(text||'');
        const w = Math.min(overlayCanvas.width-20, metrics.width + 2*pad);
        overlayCtx.fillStyle = 'rgba(0,0,0,0.45)';
        overlayCtx.fillRect(x - w/2, y - 18, w, 26);
        overlayCtx.fillStyle = 'rgba(255,255,255,0.95)';
        overlayCtx.fillText(text, x, y);
      }

      function sizeOverlay(){
        if (!overlayCanvas || !video) return;
        const wrap = document.getElementById('faceVideoWrap');
        const rect = wrap.getBoundingClientRect();
        overlayCanvas.width = rect.width; overlayCanvas.height = rect.height;
        overlayCtx = overlayCanvas.getContext('2d');
        // desenha um overlay inicial
        try { drawOverlay(null, false, 'Centralize o rosto dentro do círculo'); } catch(e) {}
      }
      window.addEventListener('resize', sizeOverlay);

  // ===== FLUXO DE ETAPAS REESTRUTURADO =====
  const REQUIRED_CAPTURES = 3;
  const STEPS = [
    { key:'frontal',  short:'Frontal',  primary:'Etapa 1: Captura frontal',  secondary:'Olhe diretamente para a câmera com expressão neutra.' },
    { key:'direita',  short:'Direita',  primary:'Etapa 2: Vire o rosto para a direita', secondary:'Gire apenas a cabeça, mantendo distância e enquadramento.' },
    { key:'esquerda', short:'Esquerda', primary:'Etapa 3: Vire o rosto para a esquerda',  secondary:'Mantenha iluminação uniforme e rosto inteiro visível.' }
  ];
  let currentStep = 0; // índice ativo
  let captures = new Array(REQUIRED_CAPTURES).fill(null); // slots fixos
  let captureHashes = new Array(REQUIRED_CAPTURES).fill(null);
  let lastOkThisStep = true; // sempre permitir captura
  const flow = { baseline: null };

  // Expor um aplicador de hidratação que trabalha dentro do mesmo closure
  // para evitar ReferenceError e manter a UI consistente.
  // Recebe { captures: string[] (0..2), hashes: string[] (0..2) }
  if (typeof window.WDModalBioFacial.applyHydration !== 'function') {
    window.WDModalBioFacial.applyHydration = function(state){
      try {
        const imgs = Array.isArray(state?.captures) ? state.captures : [];
        const hashes = Array.isArray(state?.hashes) ? state.hashes : [];
        captures = new Array(REQUIRED_CAPTURES).fill(null);
        captureHashes = new Array(REQUIRED_CAPTURES).fill(null);
        for(let i=0;i<REQUIRED_CAPTURES;i++){
          if (imgs[i]) captures[i] = imgs[i];
          if (hashes[i]) captureHashes[i] = hashes[i];
        }
        rebuildThumbs(); updateStepsUI(); updateExternalBioUI();
      } catch(e){ console.warn(TAG, 'applyHydration falhou:', e); }
    };
  }

  function filledCount(){ return captures.filter(c=>!!c).length; }
  function firstEmptyIndex(){ return captures.findIndex(c=>!c); }
  function updateStepsUI(){
    const bar = document.getElementById('faceStepsBar'); if(!bar) return;
    bar.querySelectorAll('.face-step').forEach(el=>{
      const idx = parseInt(el.getAttribute('data-step'),10);
      el.classList.remove('active','done');
      if (captures[idx]) el.classList.add('done');
      else if (idx === currentStep) el.classList.add('active');
    });
    const prim = document.getElementById('faceInstructionPrimary');
    const sec  = document.getElementById('faceInstructionSecondary');
    if (filledCount() === REQUIRED_CAPTURES){
      prim && (prim.textContent = 'Capturas concluídas');
      sec && (sec.textContent = 'Revise ou clique em uma miniatura para refazer.');
    } else {
      const s = STEPS[currentStep];
      prim && (prim.textContent = s.primary);
      sec && (sec.textContent = s.secondary);
    }
  }

  function rebuildThumbs(){
    if (thumbs){
      thumbs.innerHTML='';
      captures.forEach((src,idx)=>{
        const wrap=document.createElement('div');
        wrap.style.position='relative'; wrap.style.width='68px'; wrap.style.height='68px';
        wrap.className='border rounded d-flex align-items-center justify-content-center bg-light';
        wrap.style.cursor='pointer';
        wrap.title = src ? `Etapa ${idx+1} - clicar para refazer` : `Etapa ${idx+1} - pendente`;
        if (src){ const img=new Image(); img.src=src; img.alt='c'; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover'; img.className='rounded'; wrap.appendChild(img); }
        else { const span=document.createElement('span'); span.className='text-muted small'; span.textContent=idx+1; wrap.appendChild(span); }
        wrap.addEventListener('click', ()=>{ captures[idx]=null; captureHashes[idx]=null; currentStep=idx; hiddenTemplate && (hiddenTemplate.value=JSON.stringify(captures)); hiddenSha && (hiddenSha.value=captureHashes.filter(Boolean).join('|')); rebuildThumbs(); updateStepsUI(); btnOk && (btnOk.disabled = filledCount() < REQUIRED_CAPTURES); faceStatus && (faceStatus.textContent = 'Etapa '+(idx+1)+' pronta para nova captura.'); });
        thumbs.appendChild(wrap);
      });
    }
    if (thumbsResumo){
      thumbsResumo.innerHTML='';
      captures.forEach((src,idx)=>{ if(!src) return; const i=new Image(); i.src=src; i.alt='t'; i.style.width='48px'; i.style.height='48px'; i.style.objectFit='cover'; i.className='rounded border'; i.title='Etapa '+(idx+1); thumbsResumo.appendChild(i); });
    }
    if (facialHashesList){
      facialHashesList.innerHTML='';
      captureHashes.forEach((h,idx)=>{ if(!h) return; const div=document.createElement('div'); div.innerHTML=`<code>${idx+1}: ${h}</code>`; facialHashesList.appendChild(div); });
    }
    // IMPORTANTE: não refletir no resumo externo enquanto o usuário não confirmar
  }

  function updateExternalBioUI(){
  const slotsWrap = document.getElementById('faceBioSlots');
    const statusEl  = document.getElementById('faceBioStatusResumo');
    const inputAgregado = fieldHashDisplay;
    if (!slotsWrap) return;
    slotsWrap.querySelectorAll('.face-bio-slot').forEach(slot=>{
      const idx = parseInt(slot.getAttribute('data-slot'),10);
      const thumb = slot.querySelector('.slot-thumb');
      const hashEl = slot.querySelector('.slot-hash');
      const img = thumb.querySelector('img');
      const src = captures[idx];
      if (src){
        slot.classList.add('filled');
        if (!img){
          const im = document.createElement('img'); im.src = src; thumb.innerHTML=''; thumb.appendChild(im);
        } else { img.src = src; }
        const h = captureHashes[idx];
        hashEl.textContent = h ? (h.slice(0,10)+'…'+h.slice(-6)) : '—';
        hashEl.title = h || '';
      } else {
        slot.classList.remove('filled');
        thumb.innerHTML = '<span>Vazio</span>';
        hashEl.textContent='—'; hashEl.removeAttribute('title');
      }
    });
    const filled = filledCount();
    if (statusEl){
      statusEl.textContent = filled === REQUIRED_CAPTURES ? 'Completo' : `Capturas: ${filled}/3`;
      statusEl.classList.toggle('done', filled===REQUIRED_CAPTURES);
    }
  // Não atualizar o campo agregado da página aqui; somente após confirmar
    const hashesResumo = document.getElementById('faceHashesResumo');
    if (hashesResumo){
      const list = captureHashes.map((h,i)=>{
        if(!h) return `<div class="hash-item text-muted">${i+1}. (vazio)</div>`;
        const short = h.slice(0,10)+'…'+h.slice(-6);
        return `<div class="hash-item" data-full="${h}" style="cursor:pointer" title="Clique para copiar">${i+1}. ${short}</div>`;
      }).join('');
      hashesResumo.innerHTML = `<div class="face-hashes-resumo flex-wrap">${list}</div>`;
      hashesResumo.querySelectorAll('.hash-item').forEach(el=>{
        el.addEventListener('click',()=>{
          const full=el.getAttribute('data-full'); if(full){ navigator.clipboard.writeText(full).then(()=>{ el.classList.add('text-success'); setTimeout(()=> el.classList.remove('text-success'),1200); }); }
        });
      });
    }
  }

  const resetLiveness = (preserveExternal=false) => {
    flow.baseline = null;
    currentStep = 0;
    captures = new Array(REQUIRED_CAPTURES).fill(null);
    captureHashes = new Array(REQUIRED_CAPTURES).fill(null);
    lastOkThisStep = true;
    hiddenLiveness && (hiddenLiveness.value = '0');
    updateStepsUI();
    rebuildThumbs();
    if(!preserveExternal){ updateExternalBioUI(); }
  };

  function drawOverlay(face, ok, instruction){
        if (!overlayCtx || !overlayCanvas) return;
        overlayCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
        // máscara circular (escurece fora do círculo)
        const W = overlayCanvas.width, H = overlayCanvas.height;
        const cx = W/2; const cy = H/2; const r = Math.min(cx, cy) * 0.72;
        overlayCtx.save();
        overlayCtx.fillStyle = 'rgba(0,0,0,0.35)';
        overlayCtx.fillRect(0,0,W,H);
        overlayCtx.globalCompositeOperation = 'destination-out';
        overlayCtx.beginPath(); overlayCtx.arc(cx, cy, r, 0, Math.PI*2); overlayCtx.fill();
        overlayCtx.restore();
        // círculo e progresso
        renderProgressRing(ok);
        overlayCtx.strokeStyle = ok ? 'rgba(40,167,69,0.85)' : 'rgba(0, 123, 255, 0.6)';
        overlayCtx.lineWidth = 3; overlayCtx.beginPath(); overlayCtx.arc(cx, cy, r, 0, Math.PI*2); overlayCtx.stroke();
        // landmarks (opcional)
        try {
          const landmarks = face?.faceLandmarks?.[0] || face?.landmarks?.[0] || [];
          overlayCtx.fillStyle = 'rgba(0,255,0,0.7)';
          const w = overlayCanvas.width; const h = overlayCanvas.height;
          landmarks.forEach(pt => { const x = pt.x * w; const y = pt.y * h; overlayCtx.fillRect(x-1, y-1, 2, 2); });
          // bounding box simples
          if (landmarks.length){
            let minX=1, minY=1, maxX=0, maxY=0;
            landmarks.forEach(pt=>{ if(pt.x<minX)minX=pt.x; if(pt.y<minY)minY=pt.y; if(pt.x>maxX)maxX=pt.x; if(pt.y>maxY)maxY=pt.y; });
            overlayCtx.strokeStyle = ok ? 'rgba(40,167,69,0.9)' : 'rgba(220,53,69,0.9)';
            overlayCtx.lineWidth = 2;
            overlayCtx.strokeRect(minX*w, minY*h, (maxX-minX)*w, (maxY-minY)*h);
          }
        } catch(_){ }
        // instrução
        drawInstruction(instruction || (ok ? 'Fique parado e clique em Capturar' : 'Centralize o rosto dentro do círculo'));
        // setas de orientação para passos
        const drawArrow = (angle, color)=>{
          const len = r * 0.25; const sx = cx + Math.cos(angle)* (r+8); const sy = cy + Math.sin(angle)* (r+8);
          const ex = cx + Math.cos(angle)* (r+8+len); const ey = cy + Math.sin(angle)* (r+8+len);
          overlayCtx.strokeStyle = color; overlayCtx.lineWidth = 3; overlayCtx.beginPath(); overlayCtx.moveTo(sx,sy); overlayCtx.lineTo(ex,ey); overlayCtx.stroke();
          // cabeça da seta
          const head = 7; const a1 = angle + Math.PI*0.8; const a2 = angle - Math.PI*0.8;
          overlayCtx.beginPath(); overlayCtx.moveTo(ex,ey); overlayCtx.lineTo(ex + Math.cos(a1)*head, ey + Math.sin(a1)*head); overlayCtx.lineTo(ex + Math.cos(a2)*head, ey + Math.sin(a2)*head); overlayCtx.closePath(); overlayCtx.fillStyle=color; overlayCtx.fill();
        };
  // setas por etapa
  if (filledCount() < REQUIRED_CAPTURES){
    if (currentStep === 1) drawArrow(0, 'rgba(13,110,253,0.85)'); // direita
    else if (currentStep === 2) drawArrow(Math.PI, 'rgba(13,110,253,0.85)'); // esquerda
  }
      }

      function faceIsCenteredAndLarge(face){
        try {
          const landmarks = face.faceLandmarks?.[0] || face.landmarks?.[0];
          if (!landmarks || landmarks.length < 10) return false;
          let minX=1, minY=1, maxX=0, maxY=0;
          landmarks.forEach(pt => { if (pt.x<minX) minX=pt.x; if (pt.y<minY) minY=pt.y; if (pt.x>maxX) maxX=pt.x; if (pt.y>maxY) maxY=pt.y; });
          const boxW = maxX - minX; const boxH = maxY - minY;
          const area = boxW * boxH;
          const cx = (minX + maxX)/2; const cy = (minY + maxY)/2;
          const nearCenter = Math.abs(cx - 0.5) < 0.25 && Math.abs(cy - 0.5) < 0.25; // mais permissivo
          const bigEnough = area > 0.04; // antes 0.06
          return nearCenter && bigEnough;
        } catch(e) { return false; }
      }

      // Critério mais frouxo apenas para fixar baseline e iniciar liveness
      function faceIsRoughlyCentered(face){
        try {
          const landmarks = face.faceLandmarks?.[0] || face.landmarks?.[0];
          if (!landmarks || landmarks.length < 10) return false;
          let minX=1, minY=1, maxX=0, maxY=0;
          landmarks.forEach(pt => { if (pt.x<minX) minX=pt.x; if (pt.y<minY) minY=pt.y; if (pt.x>maxX) maxX=pt.x; if (pt.y>maxY) maxY=pt.y; });
          const boxW = maxX - minX; const boxH = maxY - minY;
          const area = boxW * boxH;
          const cx = (minX + maxX)/2; const cy = (minY + maxY)/2;
          const nearCenter = Math.abs(cx - 0.5) < 0.28 && Math.abs(cy - 0.5) < 0.28;
          const bigEnough = area > 0.03;
          return nearCenter && bigEnough;
        } catch(e) { return false; }
      }

      // Substituir lógica de alternar canvas/vídeo: mantemos vídeo fixo; canvas serve apenas para snapshot e overlay
  const doCapture = async ()=>{
        try {
          const w = (video && video.videoWidth) || 640;
          const h = (video && video.videoHeight) || 480;
          if (canvas) { canvas.width = w; canvas.height = h; }
          const ctx = canvas?.getContext('2d');
          if (ctx && video) ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas ? canvas.toDataURL('image/jpeg', 0.9) : null;
          if (dataUrl) {
            const res = await fetch(dataUrl); const blob = await res.blob(); const buf = await blob.arrayBuffer(); const hashBuf = await crypto.subtle.digest('SHA-256', buf); const shaHex = Array.from(new Uint8Array(hashBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
            faceImgSize && (faceImgSize.textContent = Math.round((dataUrl.length * 3/4)/1024) + ' KB');
            faceSha && (faceSha.textContent = shaHex ? (shaHex.slice(0,12) + '…') : '—');
            // Não escrever em hiddens do formulário até o usuário confirmar
            captures[currentStep] = dataUrl;
            captureHashes[currentStep] = shaHex || '';
            // Mantém somente estado interno do modal
            rebuildThumbs();
            updateStepsUI();
            faceStatus && (faceStatus.textContent = 'Imagem da etapa '+(currentStep+1)+' registrada.');
          }
        } catch(e){ console.warn(TAG, 'captura falhou:', e); faceStatus && (faceStatus.textContent = 'Falha na captura: ' + (e?.message || e)); }
      };

  btnClear?.addEventListener('click', ()=>{
        // Limpa SOMENTE o estado interno do modal; não toca nos campos da página
        resetLiveness(true);
        thumbs && (thumbs.innerHTML='');
        thumbsResumo && (thumbsResumo.innerHTML='');
        facialHashesList && (facialHashesList.innerHTML='');
        faceImgSize && (faceImgSize.textContent='—');
        faceSha && (faceSha.textContent='—');
        faceStatus && (faceStatus.textContent='Dados limpos. Centralize o rosto para iniciar.');
        faceInstructionExternal && (faceInstructionExternal.textContent='—');
      });
      btnCapture?.addEventListener('click', async ()=>{
        if (filledCount() >= REQUIRED_CAPTURES) return;
        await doCapture();
        const nxt = firstEmptyIndex();
        if (nxt === -1){ hiddenLiveness && (hiddenLiveness.value='1'); }
        else currentStep = nxt;
        updateStepsUI(); rebuildThumbs();
        btnOk && (btnOk.disabled = filledCount() < REQUIRED_CAPTURES);
      });

      // Ao confirmar: escrever hashes concatenadas e hiddens no formulário da página
      let modalClosedByConfirm = false;
      btnOk?.addEventListener('click', ()=>{
        if (filledCount() < REQUIRED_CAPTURES) return;
        const joined = captureHashes.filter(Boolean).join('|');
        fieldHashDisplay && (fieldHashDisplay.value = joined);
        // Preencher hiddens somente agora
        hiddenSha && (hiddenSha.value = joined);
        try {
          hiddenTemplate && (hiddenTemplate.value = JSON.stringify(captures));
        } catch(_){ /* ignore */ }
        try {
          const arr = captures.map((img, idx) => (img ? { idx, imagem: img, hash: captureHashes[idx] || '' } : null)).filter(Boolean);
          hiddenFaceCapturasJson && (hiddenFaceCapturasJson.value = JSON.stringify(arr));
        } catch(_){ /* ignore */ }
        // imagem de referência (usa a primeira válida)
        try {
          const firstImg = captures.find(Boolean) || '';
          if (firstImg) hiddenImg && (hiddenImg.value = firstImg);
        } catch(_){ /* ignore */ }
        modalClosedByConfirm = true;
        // Fechar modal após confirmação
        const modalEl = document.getElementById('modalBiometriaFacial');
        if (window.bootstrap && window.bootstrap.Modal){
          try { window.bootstrap.Modal.getInstance(modalEl)?.hide(); } catch(_){ }
        } else {
          modalEl?.classList.remove('show'); modalEl?.setAttribute('aria-hidden','true'); modalEl?.removeAttribute('style');
          document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove());
        }
        // Agora sim, refletir no resumo externo
        updateExternalBioUI();
      });

      // Copiar hashes (campo externo)
      const btnCopyExternal = document.getElementById('btnCopiarFacialHashes');
      btnCopyExternal?.addEventListener('click', ()=>{
        const joined = captureHashes.filter(Boolean).join('|');
        if(!joined){ btnCopyExternal.classList.add('btn-danger'); setTimeout(()=>btnCopyExternal.classList.remove('btn-danger'),700); return; }
        navigator.clipboard.writeText(joined).then(()=>{
          btnCopyExternal.classList.remove('btn-outline-secondary');
          btnCopyExternal.classList.add('btn-success');
          btnCopyExternal.textContent='Copiado';
          setTimeout(()=>{ btnCopyExternal.classList.add('btn-outline-secondary'); btnCopyExternal.classList.remove('btn-success'); btnCopyExternal.textContent='Copiar'; },1400);
        });
      });

  // Atualizar overlay continuamente conforme detecção
  let rafId = null; let faceLandmarker = null; let mpVision = null;
      async function loadFaceModel(){
        if (faceLandmarker) return;
        try {
          const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0');
          mpVision = vision;
          const fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm');
          faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
            numFaces: 2,
            runningMode: 'VIDEO',
            minFaceDetectionConfidence: 0.3,
            minFacePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3
          });
        } catch(e){ console.warn(TAG, 'Falha ao carregar Face Landmarker:', e); }
      }
  // Variáveis de estabilidade/auto-captura removidas
      async function analyzeLoop(){
        cancelAnimationFrame(rafId);
        if (!video || video.paused || video.ended) return;
        // Se o modelo não carregou, ainda assim renderizamos overlay padrão e reagendamos
        if (!faceLandmarker){
          drawOverlay(null, false, 'Carregando análise facial…');
          btnCapture && (btnCapture.disabled = false); // permite captura manual como fallback
          rafId = requestAnimationFrame(analyzeLoop);
          return;
        }
        // ===== INÍCIO BLOCO DIAGNÓSTICO FPS =====
        diag.fCount++; const nowPerf = performance.now();
        if (!diag.lastFpsTs) diag.lastFpsTs = nowPerf;
        if (nowPerf - diag.lastFpsTs >= 1000){ diag.fps = diag.fCount; diag.fCount = 0; diag.lastFpsTs = nowPerf; updateDebugPanel(); }
        // ===== FIM BLOCO DIAGNÓSTICO FPS =====
        const now = performance.now();
        try {
          const result = faceLandmarker.detectForVideo(video, now);
          const facesArray = (result && result.faceLandmarks) ? result.faceLandmarks : [];
          const facesCount = facesArray.length || 0;
          const face = facesCount ? { faceLandmarks: facesArray } : null;
          // Helper para caixa do rosto
          const getBox = (landmarks)=>{
            let minX=1, minY=1, maxX=0, maxY=0;
            for (let i=0;i<landmarks.length;i++){ const pt=landmarks[i]; if(pt.x<minX)minX=pt.x; if(pt.y<minY)minY=pt.y; if(pt.x>maxX)maxX=pt.x; if(pt.y>maxY)maxY=pt.y; }
            const boxW=maxX-minX, boxH=maxY-minY, area=boxW*boxH; const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
            return {minX,minY,maxX,maxY,boxW,boxH,area,cx,cy};
          };
          let primaryFaceIndex = 0;
          if (facesCount>1){
            // escolher maior área como primária
            let bestArea = -1; let bestIdx = 0;
            for (let i=0;i<facesCount;i++){ const b = getBox(facesArray[i]); if (b.area>bestArea){ bestArea=b.area; bestIdx=i; } }
            primaryFaceIndex = bestIdx;
          }
          let instruction = 'Centralize o rosto dentro do círculo';
          if (!facesCount){
            drawOverlay(null, false, 'Rosto não detectado — centralize e aproxime um pouco');
            faceStatus && (faceStatus.textContent = 'Rosto não detectado — experimente melhorar a iluminação ou aproximar.');
            btnCapture && (btnCapture.disabled = true);
            rafId = requestAnimationFrame(analyzeLoop);
            return;
          }
          if (facesCount>1){
            instruction = 'Detectamos mais de um rosto — mantenha apenas uma pessoa visível';
            drawOverlay({ faceLandmarks: [facesArray[primaryFaceIndex]] }, false, instruction);
            faceStatus && (faceStatus.textContent = instruction);
            lastOkThisStep = false; btnCapture && (btnCapture.disabled = true);
            rafId = requestAnimationFrame(analyzeLoop);
            return;
          }
          const ok = !!face; // agora só requer detecção simples
          if (face && face.faceLandmarks?.[0]){
            const landmarks = face.faceLandmarks[0];
            const box = getBox(landmarks);
            diag.box = box; diag.faces = facesCount; diag.step = currentStep; diag.progress = filledCount(); updateDebugPanel();
          }
          const done = filledCount() === REQUIRED_CAPTURES;
          updateStepsUI();
          const overlayInstr = done ? 'Concluído — confirmar ou recapturar' : `${STEPS[currentStep].short}: clique em Capturar`;
          drawOverlay(face, ok, overlayInstr);
          faceStatus && (faceStatus.textContent = (done ? 'Capturas concluídas.' : `Etapa ${currentStep+1}/${REQUIRED_CAPTURES}`) + ` — detectados: ${facesCount}`);
          btnCapture && (btnCapture.disabled = done || facesCount !== 1);
          btnOk && (btnOk.disabled = !done);
        } catch(e) {
          btnCapture && (btnCapture.disabled = false); // fallback
        }
        rafId = requestAnimationFrame(analyzeLoop);
      }

  // Observação: analyzeLoop será iniciado dentro de startCamera após abrir a câmera

      const listCams = async ()=>{
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cams = devices.filter(d=> d.kind === 'videoinput');
          cameraSelect.innerHTML = '<option value="">(padrão / frontal)</option>' + cams.map(d=> `<option value="${d.deviceId}">${d.label || 'Câmera'}</option>`).join('');
          // Seleciona a atual se houver
          if (this._currentDeviceId) cameraSelect.value = this._currentDeviceId;
        } catch(e){ console.warn(TAG, 'enumerateDevices falhou:', e); }
      };

      const startCamera = async (deviceId)=>{
        try {
          this._captured = null;
          this._currentDeviceId = deviceId || null;
          if (btnOk) btnOk.disabled = true;
          canvas?.classList.add('d-none');
          video?.classList.remove('d-none');
          if (faceStatus) faceStatus.textContent = 'Abrindo câmera…';
          await loadFaceModel();
          const constraints = deviceId ? { video: { deviceId: { exact: deviceId }, width: {ideal: 640}, height: {ideal: 480} }, audio: false }
                                       : { video: { facingMode: 'user', width: {ideal: 640}, height: {ideal: 480} }, audio: false };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          // Fechar anterior
          try { if(this._stream) this._stream.getTracks().forEach(t=> t.stop()); } catch(_){}
          this._stream = stream; if (video) video.srcObject = stream;
          await new Promise(r=> { if (video) video.onloadedmetadata = r; else r(); });
          // Ajustar overlay ao tamanho do vídeo visível e iniciar análise
          sizeOverlay();
          cancelAnimationFrame(rafId); rafId = null;
          analyzeLoop();
          if (faceStatus) faceStatus.textContent = 'Câmera pronta. Siga as instruções na área do vídeo.';

          // Após abrir uma vez, os labels aparecem — atualizar lista
          listCams();
        } catch(e){
          console.warn(TAG, 'getUserMedia falhou:', e);
          if (faceStatus) faceStatus.textContent = 'Não foi possível acessar a câmera: ' + (e?.message || e);
        }
      };

      const stopCamera = ()=>{
        try { if(this._stream) { this._stream.getTracks().forEach(t=> t.stop()); this._stream = null; } } catch(_){ }
      };

      // Removido: não fechamos o modal ao capturar; mantemos fluxo para múltiplas capturas

  cameraRefresh?.addEventListener('click', listCams);
  cameraSelect?.addEventListener('change', (e)=>{ resetLiveness(); const id = e.target.value || null; startCamera(id); });

  modal?.addEventListener('shown.bs.modal', ()=>{ startCamera(this._currentDeviceId); rebuildThumbs(); updateStepsUI(); });
  modal?.addEventListener('hidden.bs.modal', ()=>{ cancelAnimationFrame(rafId); rafId=null; drawOverlay(null,false); stopCamera(); if (faceStatus) faceStatus.textContent = 'Câmera finalizada.'; if(!modalClosedByConfirm){ /* usuário cancelou: não altera arrays externas */ } modalClosedByConfirm=false; });

  // Botão externo limpar
  document.getElementById('btnLimparFacialCampo')?.addEventListener('click', ()=>{
    resetLiveness();
    fieldHashDisplay && (fieldHashDisplay.value='');
    updateExternalBioUI();
  });

  /* ================= BIOMETRIA DIGITAL (10 SLOTS) RESUMO EXTERNO ================= */
  const fpInputAgregado = document.getElementById('hash_biometria_digital');
  const fpStatusResumo  = document.getElementById('fpStatusResumo');
  const fpHashesResumo  = document.getElementById('fpHashesResumo');
  const fpSlotsWrap     = document.getElementById('fpBioSlots');
  const btnLimparDigital= document.getElementById('btnLimparDigital');
  const btnCopiarDigital= document.getElementById('btnCopiarDigitalHashes');
  const hiddenFpTplB64  = document.getElementById('fp_template_b64');
  const hiddenFpTplSha  = document.getElementById('fp_template_sha256');
  const hiddenFpImg     = document.getElementById('fp_imagem');
  const hiddenFpCapturasJson = document.getElementById('fp_capturas_json');
  // Array para até 10 capturas digitais
  let fpCaptures = new Array(10).fill(null); // (imagem/base64 opcional se existir)
  let fpHashes   = new Array(10).fill(null);

  function updateDigitalExternalUI(){
    if (fpSlotsWrap){
      fpSlotsWrap.querySelectorAll('.fp-slot').forEach(slot=>{
        const idx = parseInt(slot.getAttribute('data-slot'),10);
        const thumb = slot.querySelector('.slot-thumb');
        const hashEl= slot.querySelector('.slot-hash');
        const src = fpCaptures[idx];
        if (src){
          slot.classList.add('filled');
          if (!thumb.querySelector('img')){ const im=document.createElement('img'); im.src=src; thumb.innerHTML=''; thumb.appendChild(im); }
          else thumb.querySelector('img').src = src;
          const h = fpHashes[idx];
          hashEl.textContent = h ? (h.slice(0,10)+'…'+h.slice(-6)) : '—';
          hashEl.title = h||'';
        } else {
          slot.classList.remove('filled');
          thumb.innerHTML = `<span>${idx+1}</span>`;
          hashEl.textContent='—'; hashEl.removeAttribute('title');
        }
      });
    }
    const filled = fpHashes.filter(Boolean).length;
    if (fpStatusResumo){ fpStatusResumo.textContent = filled ? `Capturas: ${filled}/10` : 'Aguardando'; fpStatusResumo.classList.toggle('done', filled===10); }
    if (fpInputAgregado){ fpInputAgregado.value = fpHashes.filter(Boolean).join('|'); }
    if (fpHashesResumo){
      const list = fpHashes.map((h,i)=>{
        if(!h) return `<span class="hash-item text-muted">${i+1}. (vazio)</span>`;
        const short = h.slice(0,10)+'…'+h.slice(-6);
        return `<span class="hash-item" data-full="${h}" title="Clique para copiar" style="cursor:pointer">${i+1}. ${short}</span>`;
      }).join(' ');
      fpHashesResumo.innerHTML = `<div class="face-hashes-resumo flex-wrap">${list}</div>`;
      fpHashesResumo.querySelectorAll('.hash-item').forEach(el=>{
        el.addEventListener('click',()=>{ const full=el.getAttribute('data-full'); if(full){ navigator.clipboard.writeText(full); el.classList.add('text-success'); setTimeout(()=>el.classList.remove('text-success'),1200); }});
      });
    }
    hiddenFpTplSha && (hiddenFpTplSha.value = fpHashes.filter(Boolean).join('|'));
    hiddenFpTplB64 && (hiddenFpTplB64.value = JSON.stringify(fpCaptures));
  }

  // Limpeza digital
  btnLimparDigital?.addEventListener('click', ()=>{
    fpCaptures = new Array(10).fill(null); fpHashes = new Array(10).fill(null);
    fpInputAgregado && (fpInputAgregado.value='');
    hiddenFpTplB64 && (hiddenFpTplB64.value='');
    hiddenFpTplSha && (hiddenFpTplSha.value='');
    hiddenFpImg && (hiddenFpImg.value='');
    updateDigitalExternalUI();
  });

  btnCopiarDigital?.addEventListener('click', ()=>{
    const joined = fpHashes.filter(Boolean).join('|');
    if(!joined){ btnCopiarDigital.classList.add('btn-danger'); setTimeout(()=>btnCopiarDigital.classList.remove('btn-danger'),700); return; }
    navigator.clipboard.writeText(joined).then(()=>{
      btnCopiarDigital.classList.remove('btn-outline-secondary');
      btnCopiarDigital.classList.add('btn-success');
      btnCopiarDigital.textContent='Copiado';
      setTimeout(()=>{ btnCopiarDigital.classList.add('btn-outline-secondary'); btnCopiarDigital.classList.remove('btn-success'); btnCopiarDigital.textContent='Copiar'; },1400);
    });
  });

  // Hook global opcional: quando o modal de digital concluir uma captura, chamar window.onFingerprintCaptured(index, hash, img?)
  window.onFingerprintCaptured = function(slotIndex, hashHex, imageDataUrl){
    if (slotIndex<0 || slotIndex>=10) return;
    fpHashes[slotIndex] = hashHex || '';
    if (imageDataUrl) fpCaptures[slotIndex] = imageDataUrl;
    updateDigitalExternalUI();
  };

  updateDigitalExternalUI();

      // Pré-carregar lista (em alguns navegadores labels só aparecem após 1a permissão)
      if (navigator.mediaDevices?.enumerateDevices) listCams();
    },
    open(){
      const modal = document.getElementById('modalBiometriaFacial');
      if(!modal){ alert('Modal de biometria facial não encontrado.'); return; }
      cleanStuckBackdrop(); ensureInBody(modal);
      if(window.bootstrap && window.bootstrap.Modal){
        try { window.bootstrap.Modal.getOrCreateInstance(modal).show(); }
        catch(e){ console.warn(TAG, 'Erro ao abrir modal:', e); alert('Não foi possível abrir o modal facial.'); }
      } else {
        modal.classList.add('show'); modal.style.display='block'; modal.removeAttribute('aria-hidden');
        const bd=document.createElement('div'); bd.className='modal-backdrop fade show'; document.body.appendChild(bd);
      }
    }
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=> window.WDModalBioFacial.initOnce()); else window.WDModalBioFacial.initOnce();

  // ================= HIDRATAÇÃO (EDIÇÃO) =================
  // Exponho uma função para (re)hidratar as prévias quando o formulário é preenchido programaticamente.
  function hydrateFromHidden(){
    try {
      let faceHydrated=false;
      const faceCapturasJsonEl = document.getElementById('face_capturas_json');
      if (faceCapturasJsonEl && faceCapturasJsonEl.value){
        try {
          const arr = JSON.parse(faceCapturasJsonEl.value);
          if(Array.isArray(arr) && arr.length){
            const imgs = new Array(3).fill(null);
            const hashes = new Array(3).fill(null);
            arr.forEach(o=>{ if(o && Number.isInteger(o.idx) && o.idx>=0 && o.idx<3){ imgs[o.idx] = (o.imagem||o.url||o.file)||null; hashes[o.idx] = o.hash||null; }});
            // Fallback visual quando não houver nenhuma imagem
            const hasAnyImg = imgs.some(Boolean);
            if(!hasAnyImg){
              const fallbackUrl = (document.getElementById('face_imagem')?.value) || (document.getElementById('preview_foto_funcionario')?.src) || ((typeof basePath==='function'? basePath(): (window.basePath||'/gestor')) + '/img/user-placeholder.svg');
              for(let i=0;i<3;i++){ if(hashes[i] && !imgs[i]) imgs[i] = fallbackUrl; }
            }
            if(window.WDModalBioFacial && typeof window.WDModalBioFacial.applyHydration==='function'){
              window.WDModalBioFacial.applyHydration({ captures: imgs, hashes });
            }
            faceHydrated = true;
          }
        } catch(_){ }
      }
      // Fallback adicional: se não houver JSON válido, tenta usar face_imagem (primeiro slot)
      if(!faceHydrated){
        try {
          const imgHidden = document.getElementById('face_imagem');
          const agg = document.getElementById('hash_biometria_facial');
          const imgVal = imgHidden && imgHidden.value ? imgHidden.value : '';
          if(imgVal){
            // Preenche apenas o slot 0 com a imagem disponível e, se possível, associa o primeiro hash
            const firstHash = (agg && typeof agg.value==='string' && agg.value.split('|').filter(Boolean)[0]) || null;
            if(window.WDModalBioFacial && typeof window.WDModalBioFacial.applyHydration==='function'){
              window.WDModalBioFacial.applyHydration({ captures:[imgVal, null, null], hashes:[firstHash, null, null] });
            }
            faceHydrated = true;
          }
        } catch(_e){ /* ignore */ }
      }
      // Fallback legado facial se não hidratou via JSON: usa face_imagem, foto 3x4 ou placeholder para preencher visualmente
      if(!faceHydrated){
        const facialAgregado=document.getElementById('hash_biometria_facial');
        const hashes = (facialAgregado && facialAgregado.value) ? facialAgregado.value.split('|').filter(Boolean).slice(0,3) : [];
        if(hashes.length){
          // tenta melhores fontes de imagem em cascata
          const faceImg = document.getElementById('face_imagem')?.value || '';
          const fotoEl = document.getElementById('preview_foto_funcionario');
          const fotoUrl = (fotoEl && fotoEl.src) ? fotoEl.src : '';
          const placeholder = (typeof basePath==='function'? basePath(): (window.basePath||'/gestor')) + '/img/user-placeholder.svg';

          const imgs = new Array(3).fill(null);
          const hs = new Array(3).fill(null);
          for(let i=0;i<hashes.length;i++){ hs[i]=hashes[i]; imgs[i]= faceImg || fotoUrl || placeholder; }
          if(window.WDModalBioFacial && typeof window.WDModalBioFacial.applyHydration==='function'){
            window.WDModalBioFacial.applyHydration({ captures: imgs, hashes: hs });
          }
          faceHydrated = true;
        }
      }
      // Digitais
      let digitalHydrated=false;
      const fpCapturasJsonEl = document.getElementById('fp_capturas_json');
      if(fpCapturasJsonEl && fpCapturasJsonEl.value){
        try {
          const arr = JSON.parse(fpCapturasJsonEl.value);
          if(Array.isArray(arr) && arr.length){
            fpCaptures = new Array(10).fill(null);
            fpHashes   = new Array(10).fill(null);
            arr.forEach(o=>{ if(o && Number.isInteger(o.idx) && o.idx>=0 && o.idx<10){ fpCaptures[o.idx]=o.imagem||null; fpHashes[o.idx]=o.hash||null; }});
            updateDigitalExternalUI(); digitalHydrated = true;
          }
        } catch(_){ }
      }
      if(!digitalHydrated){
        const digitalAgregado=document.getElementById('hash_biometria_digital');
        if(digitalAgregado && digitalAgregado.value){
          const fpHashesAg=digitalAgregado.value.split('|').filter(Boolean).slice(0,10);
          const fpWrap=document.getElementById('fpBioSlots');
          if(fpWrap){
            fpWrap.querySelectorAll('.fp-slot').forEach(slot=>{
              const idx=parseInt(slot.getAttribute('data-slot'),10);
              const h=fpHashesAg[idx];
              const hashEl=slot.querySelector('.slot-hash');
              const thumb=slot.querySelector('.slot-thumb');
              if(h){
                slot.classList.add('filled');
                if(thumb) thumb.innerHTML=`<span>${idx+1}</span>`;
                if(hashEl){ hashEl.textContent=h.slice(0,10)+'…'+h.slice(-6); hashEl.title=h; }
              }
            });
            const fpStatus=document.getElementById('fpStatusResumo');
            if(fpStatus){ const count=fpHashesAg.length; fpStatus.textContent=count?`Capturas: ${count}/10`:'Aguardando'; fpStatus.classList.toggle('done', count===10); }
          }
        }
      }
    } catch(e){ console.warn('[cadastro_bio_facial][hydrateFromHidden] falhou:', e); }
  }
  // expor globalmente
  window.WDModalBioFacial.hydrateFromHidden = hydrateFromHidden;
  // roda uma vez no load (caso esteja em página de edição carregada por navegação tradicional)
  hydrateFromHidden();

  // ================= PATCH: Painel de diagnóstico (Alt+D) =================
  const diag = { enabled:false, el:null, fps:0, fCount:0, lastFpsTs:0, box:null, dx:0, dxNorm:0, faces:0, step:0, progress:0 };
  function updateDebugPanel(){ if(!diag.enabled || !diag.el) return; const b=diag.box||{}; diag.el.innerHTML = `<strong>DEBUG FACE</strong><br>FPS: ${diag.fps}<br>Faces: ${diag.faces}<br>Step: ${diag.step} / Prog: ${diag.progress}<br>dx: ${diag.dx?.toFixed(4)} dxN: ${diag.dxNorm?.toFixed(4)}<br>cx: ${(b.cx??0).toFixed(3)} cy: ${(b.cy??0).toFixed(3)}<br>area: ${(b.area??0).toFixed(4)}`; }
  function toggleDebug(){ diag.enabled=!diag.enabled; if(diag.enabled){ if(!diag.el){ const d=document.createElement('div'); d.style.cssText='position:fixed;top:8px;right:8px;z-index:99999;background:#111;color:#0f0;padding:6px 8px;font:12px monospace;border:1px solid #0f0;border-radius:4px;max-width:220px;'; document.body.appendChild(d); diag.el=d; } updateDebugPanel(); } else { if(diag.el){ diag.el.remove(); diag.el=null; } } console.log(TAG, 'debug '+(diag.enabled?'ativado':'desativado')); }
  document.addEventListener('keydown', (e)=>{ if(e.altKey && e.key.toLowerCase()==='d'){ e.preventDefault(); toggleDebug(); }});
  // ========================================================================
})();

