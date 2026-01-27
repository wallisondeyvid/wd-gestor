// Migrado de public/js/modals/cadastro_bio_digital.js
// Mantido conteúdo original.
(() => {
  const AGENT = 'http://127.0.0.1:17890';

  const CAPTURE_PAUSE_MS        = 300;
  const MAX_WINDOW_MS           = 15000; // 15s por clique
  const SEARCH_CONF_MIN         = 50;    // confiança mínima para bloquear via /search
  const DUP_AHASH_MAX_STRICT    = 10;    // limiar “igual” (RAW→aHash)
  const DUP_DHASH_MAX_STRICT    = 10;    // limiar “igual” (RAW→dHash)
  const DUP_AHASH_MAX_SESSION   = 24;    // limiar sessão para “muito parecido”
  const DUP_DHASH_MAX_SESSION   = 20;

  let _abortCapture = false;

  function initFp() {
    const els = {
      modal:     document.getElementById('modalBiometriaDigitalPro'),
      selPort:   document.getElementById('fpPort'),
      btnList:   document.getElementById('fpBtnListarPortas'),
      btnCon:    document.getElementById('fpBtnConectar'),
      btnSearch: document.getElementById('fpBtnPesquisar'),
      btnEnroll: document.getElementById('fpBtnCadastrar'),
      btnClear:  document.getElementById('fpBtnLimpar'),
      btnUse:    document.getElementById('fpBtnUsar'),
      btnCancel: document.getElementById('fpBtnCancelar'),
  // btnDebug removido
  progress:  document.getElementById('fpProgress'),
      status:    document.getElementById('fpStatus'),
      log:       document.getElementById('fpLog'),
      canvas:    document.getElementById('fpCanvas'),
      slotsWrap: document.getElementById('fpSlots'),
      hand:      document.querySelector('.hand-wrap'),
      qList:     document.getElementById('fpQueue'),
      tplJson:   document.getElementById('fp_templates_json'),
      tplB64:    document.getElementById('fp_template_b64'),
      tplSha:    document.getElementById('fp_template_sha256'),
      toast:     document.getElementById('fpToast'),
      toastBody: document.getElementById('fpToastBody'),
    };
    if (!els.modal) return;

    // estado
    const selected = new Set();   // '1'..'10'
    const captured = new Map();   // code -> {code,label,sha,b64,thumb:{w,h,b64},ahash,dhash,seenId?}
    const indexSha = new Map();   // sha -> code
    const indexSeen= new Map();   // seenId -> code

    // utils
    const http = async (path, opt = {}) => {
      const res = await fetch(AGENT + path, { cache: 'no-store', ...opt, headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()));
      return res.json();
    };
    const setStatus = (s) => { els.status && (els.status.textContent = s); };
    const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
    const log = (o) => {
      if (!els.log) return;
      const clean = JSON.stringify(o, (k, v) => {
        const kk = k.toLowerCase();
        if (kk.includes('b64') || kk === 'raw' || kk === 'image')
          return typeof v === 'string' ? `[${k}:${v.length} chars]` : '[binary]';
        return v;
      });
      els.log.textContent += clean + '\n';
      els.log.scrollTop = els.log.scrollHeight;
    };
    const b64ToBytes = (b64) => { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr; };
    const sha256Hex = async (bytesOrB64) => {
      const buf = (bytesOrB64 instanceof Uint8Array) ? bytesOrB64 : b64ToBytes(bytesOrB64);
      const h = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2,'0')).join('');
    };
    function showToast(msg, variant='warning'){
      if (!els.toast) { alert(msg); return; }
      els.toastBody && (els.toastBody.textContent = msg);
      els.toast.classList.remove('text-bg-warning','text-bg-success','text-bg-danger','text-bg-info');
      els.toast.classList.add('text-bg-' + variant);
      try { bootstrap.Toast.getOrCreateInstance(els.toast, { delay: 2600 }).show(); }
      catch { alert(msg); }
    }

    // hashes perceptuais
    function aHash64FromRaw(bytes, w, h) {
      const sample = new Array(64); let idx = 0;
      for (let y=0;y<8;y++){
        const sy = Math.min(h-1, Math.floor((y+0.5)*h/8));
        for (let x=0;x<8;x++){
          const sx = Math.min(w-1, Math.floor((x+0.5)*w/8));
          sample[idx++] = bytes[sy*w + sx];
        }
      }
      const avg = sample.reduce((a,b)=>a+b,0)/64;
      let bits = 0n;
      for (let i=0;i<64;i++) if (sample[i] >= avg) bits |= (1n << BigInt(63-i));
      return bits;
    }
    function dHash64FromRaw(bytes, w, h){
      let bits = 0n, k = 0;
      for (let y=0;y<8;y++){
        const sy = Math.min(h-1, Math.floor((y+0.5)*h/8));
        for (let x=0;x<8;x++){
          const sx1 = Math.min(w-1, Math.floor((x+0.5)*w/8));
          const sx2 = Math.min(w-1, Math.floor((x+1.5)*w/8));
          const v1 = bytes[sy*w + sx1], v2 = bytes[sy*w + sx2];
          if (v2 >= v1) bits |= (1n << BigInt(63-k));
          k++;
        }
      }
      return bits;
    }
    function hamming64(a,b){ let x=a^b,c=0; while(x){ c+=Number(x&1n); x>>=1n; } return c; }

    function fingerLabel(code){
      const n = Number(code), L = ['polegar','indicador','médio','anelar','mínimo'];
      if (n>=1 && n<=5)  return `dedo ${L[n-1]} da mão esquerda`;
      if (n>=6 && n<=10) return `dedo ${L[n-6]} da mão direita`;
      return `dedo #${code}`;
    }

    // slots
    function ensureSlots(){
      if (!els.slotsWrap) return;
      if (els.slotsWrap.querySelectorAll('.fp-slot').length === 10) return;
      els.slotsWrap.innerHTML = '';
      for (let i=1;i<=10;i++){
        const slot = document.createElement('div');
        slot.className = 'fp-slot';
        slot.id = `fp-slot-${i}`;
        slot.dataset.code = String(i);
        slot.innerHTML = `<span class="fp-tag">#${i}</span><canvas class="fp-canvas" width="120" height="140"></canvas>`;
        els.slotsWrap.appendChild(slot);
      }
    }
    ensureSlots();

    function drawRawToCanvas(canvas, b64, w, h){
      // Desenha a imagem RAW em um canvas offscreen, depois aplica com "contain"
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const octx = off.getContext('2d');
      const bytes = b64ToBytes(b64);
      const img = octx.createImageData(w,h);
      for (let i=0,j=0;i<bytes.length && j<img.data.length;i++,j+=4){
        const v=bytes[i]; img.data[j]=v; img.data[j+1]=v; img.data[j+2]=v; img.data[j+3]=255;
      }
      octx.putImageData(img,0,0);

      // Canvas do slot tem 120x140 (definido no HTML); preserva dimensões e centraliza
      const ctx = canvas.getContext('2d');
      const TW = 120, TH = 140;
      canvas.width = TW; canvas.height = TH;
      ctx.clearRect(0,0,TW,TH);
      const scale = Math.min(TW / w, TH / h);
      const dw = Math.round(w * scale), dh = Math.round(h * scale);
      const dx = Math.floor((TW - dw) / 2), dy = Math.floor((TH - dh) / 2);
      ctx.drawImage(off, 0,0,w,h, dx,dy,dw,dh);
      canvas.style.width = '120px';
      canvas.style.height = '140px';
    }
    function setSlotImage(code, b64Raw, w, h){
      const slot = els.slotsWrap?.querySelector(`.fp-slot[data-code="${code}"]`);
      const cvs  = slot?.querySelector('canvas');
      if (!slot || !cvs) return;
      drawRawToCanvas(cvs, b64Raw, w, h);
      slot.classList.add('filled');
    }
    function flashSlot(code){
      const slot = document.getElementById(`fp-slot-${code}`);
      const dot  = els.hand?.querySelector(`.finger-dot[data-code="${code}"]`);
      slot?.classList.add('fp-flash');
      dot?.classList.add('current');
      setTimeout(()=>{ slot?.classList.remove('fp-flash'); dot?.classList.remove('current'); }, 1600);
    }
    function updateHiddenJson(){
      // Serializa convertendo BigInt -> string para evitar erro "Do not know how to serialize a BigInt"
      const replacer = (k, v) => (typeof v === 'bigint' ? v.toString() : v);
      els.tplJson && (els.tplJson.value = JSON.stringify(Array.from(captured.values()), replacer));
      if (els.btnUse) {
        const need = selected.size;
        const got  = Array.from(captured.keys()).filter(k => selected.has(String(k))).length;
        els.btnUse.disabled = !(need > 0 && got === need);
        if (els.progress){ els.progress.textContent = `${got}/${need}`; els.progress.classList.toggle('bg-success', need>0 && got===need); }
      }
    }
    function redrawQueue(){
      if (!els.qList) return;
      els.qList.innerHTML = '';
      const order = Array.from(selected).map(Number).sort((a,b)=>a-b);
      for (const code of order){
        const cap = captured.get(String(code));
        const li = document.createElement('li');
        li.className = 'd-flex align-items-center justify-content-between py-1';
        li.innerHTML =
          `<span><strong>${fingerLabel(code)}</strong> <small class="text-muted">[#${code}]</small></span>` +
          `<span><span class="badge ${cap ? 'bg-success' : 'bg-secondary'} me-2">${cap ? 'Capturado' : 'Pendente'}</span>` +
          `<button class="btn btn-link btn-sm p-0 fp-retry" data-code="${code}" ${cap?'':'disabled'}>Repetir</button></span>`;
        els.qList.appendChild(li);
        const btn = els.hand?.querySelector(`.finger-dot[data-code="${code}"]`);
        btn?.classList.toggle('selected', true);
        btn?.classList.toggle('captured', !!cap);
      }
      els.hand?.querySelectorAll('.finger-dot').forEach(b=>{
        if (!selected.has(b.dataset.code)) b.classList.remove('selected','captured','current');
      });
    }
    function nextPendingSelected(){
      const nums = Array.from(selected).map(Number).sort((a,b)=>a-b);
      for (const n of nums) if (!captured.has(String(n))) return String(n);
      return null;
    }

    // seleção nas mãos
    els.hand?.querySelectorAll('.finger-dot').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const code = String(btn.dataset.code||''); if (!code) return;
        if (selected.has(code)) selected.delete(code); else selected.add(code);
        btn.classList.toggle('selected', selected.has(code));
        redrawQueue(); updateHiddenJson();
      });
    });

    // prévia grande
    function renderLastThumb({ b64, w, h }){
      if (!els.canvas || !b64 || !w || !h) return;
      const can = els.canvas, ctx = can.getContext('2d');
      // desenha com contain no espaço disponível mantendo aspecto
      const off = document.createElement('canvas'); off.width=w; off.height=h;
      const octx = off.getContext('2d');
      const bytes = b64ToBytes(b64);
      const img = octx.createImageData(w,h);
      for (let i=0,j=0;i<bytes.length && j<img.data.length;i++,j+=4){ const v=bytes[i]; img.data[j]=v; img.data[j+1]=v; img.data[j+2]=v; img.data[j+3]=255; }
      octx.putImageData(img,0,0);
      const TW = can.clientWidth || 420; const TH = Math.round(TW * (h/w));
      can.width = TW; can.height = Math.max(TH, 260);
      ctx.clearRect(0,0,can.width,can.height);
      const scale = Math.min(can.width / w, can.height / h);
      const dw = Math.round(w * scale), dh = Math.round(h * scale);
      const dx = Math.floor((can.width - dw)/2), dy = Math.floor((can.height - dh)/2);
      ctx.drawImage(off, 0,0,w,h, dx,dy,dw,dh);
      can.style.width = '100%';
      can.style.height = 'auto';
    }

    // agente
    async function listPorts(){
      const r = await http('/pico/devices');
      const ports = r?.ports || [];
      if (els.selPort){
        els.selPort.innerHTML =
          '<option value="">' + (ports.length ? '(selecione...)' : '(nenhuma porta)') + '</option>' +
          ports.map(p => `<option value="${p.port}">${p.port}</option>`).join('');
      }
      return ports;
    }
    async function connect(){
      const chosen = els.selPort?.value || (await listPorts())[0]?.port;
      if (!chosen){ setStatus('Nenhuma porta encontrada.'); return; }
      try { await http('/pico/close', { method:'POST', body:'{}' }); } catch {}
      await http('/pico/open', { method:'POST', body: JSON.stringify({ port: chosen }) });
      setStatus('Aguardando dispositivo ficar pronto...');
      let ok=false;
      for (let i=0;i<12;i++){ try{ const pong=await http('/pico/ping'); log({PONG:pong.pong}); ok=true; break; } catch { await sleep(300); } }
      if (!ok){ setStatus('Falha ao conectar (PING).'); return; }
      setStatus('Conectado em ' + chosen);
      els.btnEnroll && (els.btnEnroll.disabled = false);
    }

    // pré-checagem: /pico/search (com confiança mínima)
    async function preCheckSearch(){
      try{
        const r = await http('/pico/search');
        const m = r?.msg || r || {};
        const found = !!(m.found || (m.ok && (m.id !== undefined)));
        const conf  = m.confidence ?? m.score ?? null;
        if (found){
          log({ preSearch:{found:true, id:(m.id ?? m.match_id ?? '?'), conf} });
          if (conf == null || conf >= SEARCH_CONF_MIN) return { found:true, id:m.id, conf };
        } else {
          log({ preSearch:{found:false} });
        }
      }catch(e){
        log({ preSearchErr:e.message });
      }
      return { found:false };
    }

    // checagem rápida por RAW da miniatura (antes de sair o template)
    function findDupByThumbRaw(tb64, w, h){
      if (!tb64 || !w || !h || captured.size === 0) return null;
      const bytes = b64ToBytes(tb64);
      const ah = aHash64FromRaw(bytes, w, h);
      const dh = dHash64FromRaw(bytes, w, h);
      for (const [code, obj] of captured){
        if (obj.ahash != null && obj.dhash != null){
          const da = hamming64(ah, obj.ahash);
          const dd = hamming64(dh, obj.dhash);
          if (da <= DUP_AHASH_MAX_STRICT && dd <= DUP_DHASH_MAX_STRICT){
            log({ dupThumb:{to:code, a:da, d:dd} });
            return { code, a:da, d:dd };
          }
        }
      }
      return null;
    }

    // captura (janela curta + detecção de repetido por RAW + cancelar)
    async function captureOne(){
      _abortCapture = false;
      const t0 = performance.now();

      els.btnCancel?.classList.remove('d-none');
      if (els.btnEnroll){ els.btnEnroll.classList.add('loading'); els.btnEnroll.disabled = true; }

      try{
        setStatus('Mantenha o dedo bem apoiado e centralizado…');

        while(!_abortCapture && (performance.now() - t0) < MAX_WINDOW_MS){
          let r;
          const tCap = performance.now();
          try { r = await http('/pico/template', { method:'POST', body:'{}' }); }
          catch (e) { log({ error:'template', message:e.message }); await sleep(Math.min(CAPTURE_PAUSE_MS*2,1000)); continue; }
          log({ captureMs: Math.round(performance.now() - tCap) });

          const m    = r.msg || {};
          const tb64 = (m.thumb?.b64) || m.thumb || '';
          const tw   = m.thumb?.w || m.thumb_w || 256;
          const th   = m.thumb?.h || m.thumb_h || 288;

          if (tb64){
            renderLastThumb({ b64: tb64, w: tw, h: th });
            // detectar repetido SÓ pela miniatura (sem esperar template)
            const dupThumb = findDupByThumbRaw(tb64, tw, th);
            if (dupThumb){
              return { ok:false, duplicate:true, duplicateOf: dupThumb.code, reason:`thumb_match(a=${dupThumb.a},d=${dupThumb.d})` };
            }
          }

          // sucesso: veio template
          if (r.b64){
            const bytesTpl = b64ToBytes(r.b64);
            const bytesRaw = tb64 ? b64ToBytes(tb64) : null;
            const [sha, ahash, dhash] = await Promise.all([
              sha256Hex(bytesTpl),
              bytesRaw ? Promise.resolve(aHash64FromRaw(bytesRaw, tw, th)) : Promise.resolve(null),
              bytesRaw ? Promise.resolve(dHash64FromRaw(bytesRaw, tw, th)) : Promise.resolve(null),
            ]);
            const seenId = m.seen_id ?? null;
            if (seenId == null) log({ warn:'Firmware não forneceu seen_id' });
            return { ok:true, tplB64:r.b64, sha, thumb: tb64 ? {w:tw,h:th,b64:tb64} : null, ahash, dhash, seenId };
          }

          // sem template: pistas de repetição do firmware (inclui enroll_mismatch)
          const rawErr = (m.err || r.error || '').toString().toLowerCase();
          if (rawErr && /(dup|same|exist|match|enroll_mismatch)/.test(rawErr)) {
            log({ duplicateHint: rawErr });
            return { ok:false, duplicate:true, reason:rawErr };
          }

          await sleep(CAPTURE_PAUSE_MS);
        }

        setStatus('Tempo esgotado para esta captura. Levante e reposicione o dedo.');
        return { ok:false };
      } finally {
        els.btnCancel?.classList.add('d-none');
        if (els.btnEnroll){ els.btnEnroll.classList.remove('loading'); els.btnEnroll.disabled = false; }
      }
    }

    // duplicidade na sessão (pós-template)
    function findDuplicateSession(newSha, newAhash, newDhash, newSeenId, excludeCode=null){
      if (newSeenId != null && indexSeen.has(newSeenId)){
        const code = indexSeen.get(newSeenId);
        if (!excludeCode || String(code) !== String(excludeCode)) return { code, reason:'seen_id' };
      }
      if (newSha && indexSha.has(newSha)){
        const code = indexSha.get(newSha);
        if (!excludeCode || String(code) !== String(excludeCode)) return { code, reason:'sha' };
      }
      for (const [code, obj] of captured){
        if (excludeCode && String(excludeCode) === String(code)) continue;
        if (obj.ahash != null && obj.dhash != null && newAhash != null && newDhash != null){
          const da = hamming64(newAhash, obj.ahash);
          const dd = hamming64(newDhash, obj.dhash);
          if (da <= DUP_AHASH_MAX_SESSION && dd <= DUP_DHASH_MAX_SESSION) {
            log({ dupCheck:{to:code, a:da, d:dd} });
            return { code, reason:`pHash(a=${da},d=${dd})` };
          }
        }
      }
      return null;
    }

    function announceDuplicate(nextCodeToGuide, highlightCode=null){
      const base = highlightCode
        ? `Biometria já capturada como ${fingerLabel(highlightCode)}`
        : `Biometria deste dedo já foi capturada`;
      const msg = `${base}, vamos ao ${fingerLabel(nextCodeToGuide)}.`;
      setStatus(msg); showToast(msg, 'warning');
      if (highlightCode) flashSlot(highlightCode);
    }

    // fluxos
    async function captureNext(){
      if (selected.size === 0){ setStatus('Selecione ao menos um dedo.'); return; }
      const code = nextPendingSelected();
      if (!code){ setStatus('Todos os dedos selecionados já foram capturados.'); return; }

      // pré-checagem
      const pre = await preCheckSearch();
      if (pre.found){
        const nextCode = nextPendingSelected() || code;
        announceDuplicate(nextCode); // não sabemos qual slot do sensor → só guia
        return;
      }

      const dot = els.hand?.querySelector(`.finger-dot[data-code="${code}"]`);
      dot?.classList.add('current');

      const res = await captureOne();
      dot?.classList.remove('current');

      if (!res.ok){
        if (res.duplicate){
          const nextCode = nextPendingSelected() || code;
          announceDuplicate(nextCode, res.duplicateOf ?? null);
        }
        return;
      }

      // duplicidade pós-template (sessão)
      const dup = findDuplicateSession(res.sha, res.ahash, res.dhash, res.seenId, null);
      if (dup){ announceDuplicate(nextPendingSelected() || code, dup.code); return; }

      captured.set(code, { code, label:'#'+code, sha:res.sha, b64:res.tplB64, thumb:res.thumb, ahash:res.ahash, dhash:res.dhash, seenId:res.seenId ?? undefined });
      if (res.sha)   indexSha.set(res.sha, code);
      if (res.seenId!=null) indexSeen.set(res.seenId, code);
      if (res.thumb) setSlotImage(code, res.thumb.b64, res.thumb.w, res.thumb.h);

      redrawQueue(); updateHiddenJson();

      const nextCode = nextPendingSelected();
      if (nextCode) setStatus(`Pronto! Agora posicione o ${fingerLabel(nextCode)} e clique Capturar.`);
      else setStatus('Todos os selecionados foram capturados. Você pode usar a biometria.');
    }

    async function captureReplace(code){
      // pré-checagem também vale
      const pre = await preCheckSearch();
      if (pre.found){ announceDuplicate(nextPendingSelected() || code); return; }

      const dot = els.hand?.querySelector(`.finger-dot[data-code="${code}"]`);
      dot?.classList.add('current');
      const res = await captureOne();
      dot?.classList.remove('current');

      if (!res.ok){
        if (res.duplicate) announceDuplicate(nextPendingSelected() || code, res.duplicateOf ?? null);
        return;
      }

      const dup = findDuplicateSession(res.sha, res.ahash, res.dhash, res.seenId, code);
      if (dup){ announceDuplicate(nextPendingSelected() || code, dup.code); return; }

      const prev = captured.get(String(code));
      if (prev){ if (prev.sha) indexSha.delete(prev.sha); if (prev.seenId != null) indexSeen.delete(prev.seenId); }

      captured.set(String(code), { code:String(code), label:'#'+code, sha:res.sha, b64:res.tplB64, thumb:res.thumb, ahash:res.ahash, dhash:res.dhash, seenId:res.seenId ?? undefined });
      if (res.sha)   indexSha.set(res.sha, String(code));
      if (res.seenId!=null) indexSeen.set(res.seenId, String(code));
      if (res.thumb) setSlotImage(code, res.thumb.b64, res.thumb.w, res.thumb.h);

      redrawQueue(); updateHiddenJson();
      setStatus(`Dedo ${fingerLabel(code)} atualizado.`);
    }

    // eventos
    els.qList?.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.fp-retry'); if (!btn) return;
      const code = btn.getAttribute('data-code'); if (code) captureReplace(code);
    });

    function resetAll(){
      _abortCapture = true;
      captured.clear(); selected.clear(); indexSha.clear(); indexSeen.clear();
      els.hand?.querySelectorAll('.finger-dot').forEach(b => b.classList.remove('selected','captured','current'));
      for (let i=1;i<=10;i++){
        const slot= document.getElementById(`fp-slot-${i}`);
        const cvs = slot?.querySelector('canvas');
        slot?.classList.remove('filled','fp-flash');
        if (cvs){ const ctx=cvs.getContext('2d'); ctx.clearRect(0,0,cvs.width,cvs.height); }
      }
      if (els.canvas){ const c=els.canvas.getContext('2d'); c.clearRect(0,0,els.canvas.width,els.canvas.height); }
      els.tplJson && (els.tplJson.value = '[]');
      els.tplB64  && (els.tplB64.value  = '');
      els.tplSha  && (els.tplSha.value  = '');
      els.btnUse  && (els.btnUse.disabled = true);
      redrawQueue();
      setStatus('Pronto.');
    }

    async function closePort(){ try { await http('/pico/close', { method:'POST', body: '{}' }); } catch {} }

    els.btnList?.addEventListener('click', async () => { try { await listPorts(); setStatus('Portas atualizadas.'); } catch(e){ setStatus('Erro ao listar portas.'); log(e); } });
    els.btnCon?.addEventListener('click',  async () => { try { await connect(); } catch(e){ setStatus('Falha ao conectar.'); log(e); } });
    els.btnSearch?.addEventListener('click',async () => { try { const r = await http('/pico/search'); log({SEARCH:r}); } catch(e){ setStatus('Erro na busca.'); log(e); } });
    els.btnEnroll?.addEventListener('click', captureNext);
    els.btnClear?.addEventListener('click',  resetAll);
    els.btnCancel?.addEventListener('click', () => { _abortCapture = true; setStatus('Captura cancelada pelo usuário.'); });

    els.modal.addEventListener('shown.bs.modal', () => {
      els.log && (els.log.textContent = '');
      els.btnUse && (els.btnUse.disabled = true);
      els.btnCancel && els.btnCancel.classList.add('d-none');
      setStatus('Desconectado.');
      ensureSlots(); redrawQueue(); updateHiddenJson();
      listPorts().catch(e => { setStatus('Erro ao listar portas.'); log(e); });
      // inicializa tooltips (Bootstrap 5)
      try { const ttSel = [].slice.call(els.hand.querySelectorAll('[data-bs-toggle="tooltip"]')); ttSel.forEach(el=>{ bootstrap.Tooltip.getOrCreateInstance(el); }); } catch{}
      // aplica preferência dark se salva
      try { if (localStorage.getItem('fpDark')==='1') els.modal.classList.add('fp-dark'); } catch{}
    });
    els.modal.addEventListener('hidden.bs.modal', () => { _abortCapture = true; closePort(); });

    // Converter miniatura RAW para dataURL (opcional para UI externa)
    function rawThumbToDataUrl(tb64, w, h){
      if (!tb64 || !w || !h) return null;
      const off = document.createElement('canvas'); off.width=w; off.height=h;
      const octx = off.getContext('2d');
      const bytes = b64ToBytes(tb64);
      const img = octx.createImageData(w,h);
      for (let i=0,j=0;i<bytes.length && j<img.data.length;i++,j+=4){ const v=bytes[i]; img.data[j]=v; img.data[j+1]=v; img.data[j+2]=v; img.data[j+3]=255; }
      octx.putImageData(img,0,0);
      return off.toDataURL('image/png');
    }

    // Confirmar uso da biometria selecionada
    els.btnUse?.addEventListener('click', ()=>{
      const order = Array.from(selected).map(Number).sort((a,b)=>a-b);
      if (order.length === 0) { showToast('Selecione ao menos um dedo.', 'warning'); return; }
      // Verifica se todos selecionados têm captura
      const missing = order.filter(n=> !captured.has(String(n)));
      if (missing.length){ showToast('Ainda faltam capturas selecionadas.', 'warning'); return; }

      // Monta estrutura para hidden json e agregados
      const jsonArr = [];
      const hashes = [];
      for (const n of order){
        const obj = captured.get(String(n));
        const idx0 = n - 1; // 0..9
        hashes.push(obj.sha || '');
        jsonArr.push({ idx: idx0, hash: obj.sha || '', imagem: obj.thumb ? rawThumbToDataUrl(obj.thumb.b64, obj.thumb.w, obj.thumb.h) : null });
        try { if (window.onFingerprintCaptured) window.onFingerprintCaptured(idx0, obj.sha || '', jsonArr[jsonArr.length-1].imagem || undefined); } catch {}
      }
      if (els.tplJson) els.tplJson.value = JSON.stringify(jsonArr);
      if (els.tplSha)  els.tplSha.value  = hashes.join('|');
      if (els.tplB64)  els.tplB64.value  = JSON.stringify(order.map(n=> captured.get(String(n))?.b64 || ''));

      // Preenche campo agregado externo se existir
      try { const ext = document.getElementById('hash_biometria_digital'); if (ext) ext.value = hashes.join('|'); } catch{}

      showToast('Biometria aplicada. Você pode salvar o cadastro.', 'success');
      // Fecha o modal para dar feedback de conclusão
      try {
        const modal = els.modal; if (modal && window.bootstrap){ window.bootstrap.Modal.getInstance(modal)?.hide(); }
      } catch{}
    });

    // debug
    window._fp = { selected, captured, captureNext, captureReplace };

    // Modo debug: adiciona guias centrais e mostra coordenadas em tempo real ao passar o mouse
    // (Debug removido)
  }

  function safeInitFp() {
    if (document.getElementById('modalBiometriaDigitalPro')) {
      initFp();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInitFp);
  else safeInitFp();
})();
// Migrated modal: cadastro_bio_digital.js (placeholder)
(() => {})();