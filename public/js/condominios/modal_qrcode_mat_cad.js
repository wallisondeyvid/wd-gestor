(function(){
  // Usaremos a biblioteca externa qrcodejs (carregada via CDN no EJS).
  /* eslint-enable */

  function encodePayload(obj){ try{ var json=JSON.stringify(obj); var b64 = btoa(unescape(encodeURIComponent(json))); return b64; }catch(e){ return ''; } }
  function decodePayload(b64){ try{ var json=decodeURIComponent(escape(atob(b64))); return JSON.parse(json); }catch(e){ return null; } }
  function safeClone(obj){ try{ return JSON.parse(JSON.stringify(obj)); }catch(_){ return null; } }
  function normalizeQrUrl(url){
    if(!url) return '';
    try{
      if(/^https?:\/\//i.test(url)) return url;
      if(url.charAt(0)==='/') return window.location.origin + url;
      return window.location.origin + '/' + url;
    }catch(_){ return String(url||''); }
  }
  function extractQrHash(url){ if(!url) return ''; var idx=String(url).indexOf('#'); return idx>=0 ? String(url).slice(idx+1) : ''; }

  window.WDG_MAT_QR = {
    abrir: function(ctx, onPersist){
      var el=document.getElementById('modalQrMatCad'); if(!el) return;
  var btnCriar=document.getElementById('btnCriarQR'); var secCreate=document.getElementById('qrCreateSection'); var secView=document.getElementById('qrViewSection');
  var qrReal=document.getElementById('qrReal'); var urlInput=document.getElementById('qrUrlInput'); var btnCopiar=document.getElementById('btnCopiarQR'); var btnCompart=document.getElementById('btnCompartilharQR'); var btnBaixar=document.getElementById('btnBaixarQR'); var btnAbrir=document.getElementById('btnAbrirQR');
      if(!ctx || !ctx.material) return;
      var mat=ctx.material;
      // Campo onde guardaremos qrData
      var jaTem = !!mat.qrData;
      // Utilitários de ações
      function copyText(txt){ try{ if(navigator.clipboard && navigator.clipboard.writeText){ return navigator.clipboard.writeText(String(txt)); } }catch(_){}
        try{ var ta=document.createElement('textarea'); ta.value=String(txt||''); ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return Promise.resolve(); }catch(e){ return Promise.reject(e); } }
      function openLink(href){ if(!href) return; try{ window.open(href, '_blank','noopener'); }catch(_){} }
      function setDownloadHref(href){ if(!btnBaixar) return; btnBaixar.href = href || '';
        btnBaixar.onclick = null; // reseta handler anterior
        if(!href){ return; }
        // Para links cross-origin, alguns navegadores ignoram 'download'. Fazemos fetch e baixamos via blob.
        try{
          var isData = String(href).indexOf('data:')===0;
          var sameOrigin = isData || href.startsWith(window.location.origin);
          if(sameOrigin){ return; } // deixar o navegador tentar primeiro
          btnBaixar.onclick = function(ev){ ev.preventDefault(); fetch(href, { mode:'cors' }).then(function(r){ return r.blob(); }).then(function(blob){ var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='qrcode-material.png'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500); }).catch(function(){ openLink(href); }); };
        }catch(_){ /* fallback sem handler */ }
      }
      function mostrarView(){ secCreate.classList.add('d-none'); secView.classList.remove('d-none'); }
      function mostrarCreate(){ secCreate.classList.remove('d-none'); secView.classList.add('d-none'); }
      if(jaTem){
        mostrarView();
        var qrData = mat.qrData || {};
        var storedPayload = (qrData.payload && typeof qrData.payload === 'object') ? qrData.payload : {};
        var payload = safeClone(storedPayload);
        if(!payload || typeof payload!=='object'){ payload = {}; }
        var urlOriginal = qrData.url || '';
        var urlNormalized = normalizeQrUrl(urlOriginal);
        var urlHashExisting = extractQrHash(urlOriginal);
        var imgUrl=qrData.imgUrl || '';
        var persistedOnce=false;
        var wasRelative = !!urlOriginal && !/^https?:\/\//i.test(urlOriginal);

        function ensureString(target, key, value){
          if(!target) return;
          var next = value === undefined || value === null ? '' : String(value);
          if(target[key] !== next){ target[key] = next; }
        }

        var unidadeIdAtual = mat.unidadeId || (mat.unidade && (mat.unidade._id||mat.unidade.id||mat.unidadeId)) || payload.unidadeId || payload.unidade_id || '';
        ensureString(payload, 'unidadeId', unidadeIdAtual);
        if(!payload.unidade_id){ ensureString(payload, 'unidade_id', unidadeIdAtual); }
        ensureString(payload, 'materialId', mat.id);
        if(!payload.material_id){ ensureString(payload, 'material_id', mat.id); }
        ensureString(payload, 'nome', mat.nome);
        ensureString(payload, 'marca', mat.marca);
        ensureString(payload, 'modelo', mat.modelo);
        ensureString(payload, 'cor', mat.cor);
        ensureString(payload, 'serie', mat.serie);
        var lotacaoValor = mat.lotacao || mat.areaRotulo || payload.lotacao || '';
        ensureString(payload, 'lotacao', lotacaoValor);

        try{
          var uniSnap = ctx && ctx.unidade ? ctx.unidade : {};
          var payloadUni = (payload.unidade && typeof payload.unidade === 'object') ? payload.unidade : null;
          if(!payloadUni){ payloadUni = {}; payload.unidade = payloadUni; }
          var snapshotId = unidadeIdAtual || (uniSnap && (uniSnap._id || uniSnap.id));
          if(snapshotId){ ensureString(payloadUni, '_id', snapshotId); }
          if(uniSnap.nome !== undefined) ensureString(payloadUni, 'nome', uniSnap.nome);
          var razaoSnap = uniSnap.razao !== undefined ? uniSnap.razao : uniSnap.razaoSocial;
          if(razaoSnap !== undefined) ensureString(payloadUni, 'razao', razaoSnap);
          if(uniSnap.cnpj !== undefined) ensureString(payloadUni, 'cnpj', uniSnap.cnpj);
          if(uniSnap.endereco !== undefined) ensureString(payloadUni, 'endereco', uniSnap.endereco);
          if(uniSnap.telefone !== undefined) ensureString(payloadUni, 'telefone', uniSnap.telefone);
          if(uniSnap.logo !== undefined) ensureString(payloadUni, 'logo', uniSnap.logo);
        }catch(__snapshotErr){ }

        var essentialMissing = !(payload.materialId || payload.material_id) || !(payload.unidadeId || payload.unidade_id);

        var parsedUrl=null;
        var currentOrigin='';
        var currentPath='';
        var currentSearch='';
        var pathChanged=false;
        try{
          if(urlNormalized){ parsedUrl = new URL(urlNormalized); currentOrigin = parsedUrl.origin||''; currentPath = parsedUrl.pathname||''; currentSearch = parsedUrl.search||''; }
        }catch(__url){ }
        if(!currentPath || currentPath==='/'){ currentPath = '/informacao_material_condominios.html'; pathChanged=true; }
        var targetOrigin = currentOrigin || window.location.origin;
        var targetPath = currentPath;
        var searchLower = (currentSearch || '').toLowerCase();
        var versionChanged = searchLower !== '?v=3';
        var targetSearch = versionChanged ? '?v=3' : (currentSearch||'?v=3');
        var targetPrefix = targetOrigin + targetPath + targetSearch;

        var storedPayloadStr='';
        var payloadStr='';
        try{ storedPayloadStr = JSON.stringify(storedPayload||{}); }catch(__sStore){ storedPayloadStr='{}'; }
        try{ payloadStr = JSON.stringify(payload||{}); }catch(__sPayload){ payloadStr = storedPayloadStr ? storedPayloadStr+'#' : '{}#'; }
        var payloadChanged = storedPayloadStr !== payloadStr;

        var encodedCandidate = urlHashExisting;
        if(!encodedCandidate || payloadChanged){
          encodedCandidate = encodePayload(payload);
        }
        if(!encodedCandidate){ payloadChanged = true; }
        var urlCandidate = targetPrefix + '#' + (encodedCandidate||'');
        var matchesExisting = (urlOriginal === urlCandidate) && (storedPayloadStr === payloadStr);

        var requiresPersist = false;
        if(!urlOriginal){ requiresPersist = true; }
        if(!urlHashExisting){ requiresPersist = true; }
        if(payloadChanged){ requiresPersist = true; }
        if(versionChanged){ requiresPersist = true; }
        if(wasRelative){ requiresPersist = true; }
        if(pathChanged){ requiresPersist = true; }
        if(essentialMissing){ requiresPersist = true; }
        if(matchesExisting){ requiresPersist = false; }

        var urlFinal = requiresPersist ? urlCandidate : (urlOriginal || urlCandidate);
        urlInput.value=urlFinal;
        if(requiresPersist){
          mat.qrData.payload = payload;
          mat.qrData.url = urlFinal;
          // Regerar imagem do QR para refletir a URL nova e persistir snapshot
          renderQR(urlFinal);
          setTimeout(function(){ try{ var dataUrl=''; var canvas = qrReal.querySelector('canvas'); var imgEl = qrReal.querySelector('img'); if(canvas){ dataUrl = canvas.toDataURL('image/png'); } else if(imgEl && imgEl.src && imgEl.src.indexOf('data:')===0){ dataUrl = imgEl.src; } mat.qrData.imgDataUrl = dataUrl; }catch(_){ mat.qrData.imgDataUrl = undefined; }
            if(typeof onPersist==='function' && !persistedOnce){ persistedOnce=true; onPersist(mat); }
          }, 120);
        } else {
          if(imgUrl){
            try{ qrReal.innerHTML=''; var im=document.createElement('img'); im.src=imgUrl; im.alt='QR Code'; im.width=240; im.height=240; qrReal.appendChild(im); setDownloadHref(imgUrl); }
            catch(_){ renderQR(urlFinal); }
          } else {
            renderQR(urlFinal);
          }
        }
      }
      else { mostrarCreate(); }
  if(btnCriar){ btnCriar.onclick=function(){
        if(mat.qrData){ return; }
  // Payload mínimo: IDs e alguns dados do material. Dados da unidade serão buscados no backend.
  var uni = (ctx && ctx.unidade) || {};
  var unidadeIdAtual = mat.unidadeId || (mat.unidade && (mat.unidade._id||mat.unidade.id||mat.unidadeId)) || '';
  var payload={ unidadeId: unidadeIdAtual, materialId: mat.id, nome: mat.nome, marca: mat.marca||'', modelo: mat.modelo||'', cor: mat.cor||'', serie: mat.serie||'', lotacao: mat.lotacao || mat.areaRotulo || '', unidade: { _id: unidadeIdAtual, nome: uni.nome||'', razao: uni.razao||uni.razaoSocial||'', cnpj: uni.cnpj||'', endereco: uni.endereco||'', telefone: uni.telefone||'', logo: uni.logo||'' } };
        var encoded=encodePayload(payload);
  var publicUrl=window.location.origin + '/informacao_material_condominios.html?v=3#'+encoded;
        urlInput.value=publicUrl;
        renderQR(publicUrl);
        // Captura a imagem gerada e persiste após renderizar
        setTimeout(function(){ try{ var dataUrl=''; var canvas = qrReal.querySelector('canvas'); var imgEl = qrReal.querySelector('img'); if(canvas){ dataUrl = canvas.toDataURL('image/png'); } else if(imgEl && imgEl.src && imgEl.src.indexOf('data:')===0){ dataUrl = imgEl.src; } mat.qrData={ url: publicUrl, payload: payload, imgDataUrl: dataUrl }; if(typeof onPersist==='function'){ onPersist(mat); } }catch(_){ try{ mat.qrData={ url: publicUrl, payload: payload }; if(typeof onPersist==='function'){ onPersist(mat); } }catch(__){} } mostrarView(); }, 80);
      }; }
  function renderQR(text){
    try{
      qrReal.innerHTML='';
      if(!(window.QRCode && window.QRCode.CorrectLevel)){
        qrReal.innerHTML='<div class="text-danger small">Lib QR não carregada</div>';
        return;
      }
      var q = new QRCode(qrReal, { text: text, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.L });
      setTimeout(function(){ try{ var canvas = qrReal.querySelector('canvas'); var img=qrReal.querySelector('img'); if(canvas){ setDownloadHref(canvas.toDataURL('image/png')); } else if(img){ setDownloadHref(img.src); } }catch(_){ } }, 80);
    }catch(e){
      qrReal.innerHTML = '<div class="text-danger small">Falha ao gerar QR</div>';
    }
  }
      if(btnCopiar){ btnCopiar.onclick=function(){ var link=urlInput.value||''; copyText(link).then(function(){ /* ok */ }).catch(function(){ try{ urlInput.select(); urlInput.setSelectionRange(0, 99999); document.execCommand('copy'); }catch(__){} }); }; }
      if(btnCompart){ btnCompart.onclick=function(){ var link=urlInput.value||''; if(navigator.share){ navigator.share({ title:'Material', text:'Informações do material', url:link }).catch(function(){}); } else { copyText(link).then(function(){ alert('Link copiado para a área de transferência.'); }).catch(function(){ alert('Compartilhamento não suportado. Link:\n'+link); }); } }; }
  if(btnAbrir){ btnAbrir.onclick=function(){ var link=urlInput.value; if(link){ openLink(link); } }; }
      try{ var m=bootstrap.Modal.getOrCreateInstance(el); m.show(); }catch(_){ }
    },
    decode: decodePayload
  };
})();
