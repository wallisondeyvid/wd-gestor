/* Perfil modular reutilizável entre módulos (/gestor, /escalas, etc.)
 * Detecta basePath a partir de:
 *   1) window.__perfilBasePath
 *   2) atributo data-perfil-base em #modalPerfil
 *   3) atributo data-base-path no <body>
 *   4) fallback '' (root)
 */
(function(){
  if (window.__perfilModularLoaded) return; // evita inicialização dupla
  try { window.__perfilModularLoaded = true; } catch(_){ }
  const logPrefix = '[perfil-modular]';
  const resolveBasePath = () => {
    const modal = document.getElementById('modalPerfil');
    const bodyBp = (document.body && (document.body.dataset?.basePath || document.body.getAttribute('data-base-path'))) || '';
    let bp = (window.__perfilBasePath || (modal && modal.getAttribute('data-perfil-base')) || bodyBp || '').trim();
    if (bp.endsWith('/')) bp = bp.slice(0,-1);
    return bp;
  };

  let BASE_PATH = resolveBasePath();
  console.log(logPrefix, 'inicializando com basePath =', BASE_PATH || '(root)');

  function emitReady(stage){
    try {
      window.dispatchEvent(new CustomEvent('perfil-modular:ready', {
        detail: { basePath: BASE_PATH, stage: stage || 'init' }
      }));
    } catch(_e) { /* noop */ }
  }

  // Reexpõe função para permitir mudar dinamicamente se necessário
  window.__setPerfilBasePath = (p)=>{
    BASE_PATH = (p||'').replace(/\/$/,'');
    console.log(logPrefix,'basePath alterado para', BASE_PATH || '(root)');
    emitReady('base-changed');
  };

  // Interceptores globais para 423 Locked (fechamento) => mostrar toast padronizado
  (function installLock423Interceptors(){
    try {
      if (window.__lock423InterceptorsInstalled) return;
      window.__lock423InterceptorsInstalled = true;
      let lastToastAt = 0;
      function uiToast(msg){
        try{
          let cont = document.getElementById('esc-toasts-container');
          if(!cont){
            cont = document.createElement('div');
            cont.id = 'esc-toasts-container';
            cont.style.position = 'fixed';
            cont.style.top = '1rem';
            cont.style.right = '1rem';
            cont.style.zIndex = '99999';
            cont.style.display = 'flex';
            cont.style.flexDirection = 'column';
            cont.style.gap = '0.5rem';
            cont.style.pointerEvents = 'none';
            document.body.appendChild(cont);
          }
          const el = document.createElement('div');
          el.style.padding = '10px 12px';
          el.style.minWidth = '280px';
          el.style.maxWidth = '420px';
          el.style.color = '#0c0c0d';
          el.style.background = '#ffffff';
          el.style.border = '1px solid rgba(0,0,0,0.1)';
          el.style.borderLeft = '4px solid #0d6efd';
          el.style.borderRadius = '6px';
          el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
          el.style.fontSize = '14px';
          el.style.lineHeight = '1.3';
          el.style.opacity = '0';
          el.style.transform = 'translateY(-6px)';
          el.style.transition = 'opacity .15s ease, transform .15s ease';
          el.style.pointerEvents = 'auto';
          el.innerText = String(msg||'');
          cont.appendChild(el);
          requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateY(0)'; });
          setTimeout(()=>{
            try{ el.style.opacity='0'; el.style.transform='translateY(-6px)'; }catch(_){ }
            setTimeout(()=>{ try{ cont.removeChild(el); }catch(_){} }, 200);
          }, 3500);
        }catch(_){ try{ alert(String(msg||'')); }catch(__){} }
      }
      function isDebug(){ try{ return (window.__ESC_DEBUG_LOCKS===true) || (localStorage.getItem('esc_debug_locks')==='1'); }catch(_){ return false; } }
      function showLockedToast(ctx){
        try{
          const now = Date.now();
          if (now - lastToastAt < 1200) return; // rate-limit
          lastToastAt = now;
          if (typeof window.__toastEscalaFechada === 'function') {
            window.__toastEscalaFechada();
          } else if (typeof window.__toastInfoUI === 'function') {
            window.__toastInfoUI('Escala fechada. Proibida a edição!');
          } else if (typeof window.__toastInfo === 'function') {
            window.__toastInfo('Escala fechada. Proibida a edição!');
          } else {
            uiToast('Escala fechada. Proibida a edição!');
          }
          if(isDebug()) { try { console.debug('[perfil-modular][423] bloqueado', ctx||{}); } catch(_){ } }
        }catch(_e){ }
      }
      // Wrap fetch
      if (typeof window.fetch === 'function' && !window.fetch.__lock423Wrapped){
        const originalFetch = window.fetch.bind(window);
        const wrapped = async function(...args){
          const res = await originalFetch(...args);
          try{
            if (res && res.status === 423){
                if (typeof window.handleEscalaLockedResponse === 'function'){
                try { await window.handleEscalaLockedResponse(res, { from:'fetch-interceptor', request: args[0] }); }
                catch(_h) { showLockedToast({ from:'fetch-interceptor-fallback' }); }
              } else {
                showLockedToast({ from:'fetch-interceptor' });
              }
            }
          }catch(_){ }
          return res;
        };
        try { wrapped.__lock423Wrapped = true; } catch(_){ }
        window.fetch = wrapped;
      }
      // Wrap XMLHttpRequest
      if (typeof window.XMLHttpRequest === 'function' && !window.XMLHttpRequest.__lock423Wrapped){
        const OriginalXHR = window.XMLHttpRequest;
        function WrappedXHR(){
          const xhr = new OriginalXHR();
          xhr.addEventListener('load', function(){
            try{
              if (xhr && xhr.status === 423){
                if (typeof window.handleEscalaLockedResponse === 'function'){
                  try {
                    const contentType = (xhr.getResponseHeader && xhr.getResponseHeader('Content-Type')) || '';
                    const resp = new Response(xhr.responseText || '', { status: 423, headers: { 'Content-Type': contentType } });
                    window.handleEscalaLockedResponse(resp, { from:'xhr-interceptor', url: xhr.responseURL });
                  } catch(_h2) { showLockedToast({ from:'xhr-interceptor-fallback', url: xhr.responseURL }); }
                } else {
                  showLockedToast({ from:'xhr-interceptor', url: xhr.responseURL });
                }
              }
            }catch(_){ }
          });
          return xhr;
        }
        try { WrappedXHR.__lock423Wrapped = true; } catch(_){ }
        WrappedXHR.prototype = OriginalXHR.prototype;
        window.XMLHttpRequest = WrappedXHR;
      }
    } catch(_inst){ /* silencioso */ }
  })();

  // Utilidades de caminho
  function api(url){ return BASE_PATH + url; }

  // ================== Lógica principal (adaptada) ==================
  let fotoAtualizada = false;
  let fotoEmEdicao = null;
  let fotoPreviewOriginal = null;

  function abrirModalPerfil(){
    const el = document.getElementById('modalPerfil');
    if (!el) return console.warn(logPrefix,'modalPerfil não encontrado');
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    carregarDadosPerfil();
    modal.show();
  }

  async function carregarDadosPerfil(){
    if (carregarDadosPerfil.__inFlight) return carregarDadosPerfil.__inFlight;

    const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    window.__perfilState?.setStatus('Carregando dados do usuário...','loading');

    const p = (async () => {
      try {
        const resp = await fetch(api('/api/usuario'),{ credentials:'same-origin', cache:'no-store', headers:{'Accept':'application/json'} });
        if(!resp.ok){ let msg='Falha ao obter usuário'; try{ const e=await resp.json(); msg=e.error||e.message||msg; }catch{} throw new Error(msg+` (HTTP ${resp.status})`); }
        const raw = await resp.json();
        let data = raw?.data || raw?.usuario || raw;
        if(!data) throw new Error('Resposta vazia de /api/usuario');
        window.currentUser = data;
        const payload = { nome:data.nome||data.funcionario?.nome||'Não informado', cpf:data.cpf||data.funcionario?.cpf||'Não informado', unidade_nome:(data.role==='master')?'—':(data.unidade_nome||data.unidade?.nome||'Não informado'), unidade_codigo:(data.role==='master')?'':(data.unidade_codigo||''), email:data.email||'Não informado', telefone:data.telefone||data.funcionario?.telefone||'Não informado', primeiro_acesso:!!data.primeiro_acesso, senha_provisoria:!!data.senha_provisoria, role:data.role };
        if(window.__perfilState?.fill) window.__perfilState.fill(payload); else {
          [['perfilNome',payload.nome],['perfilCPF',payload.cpf],['perfilUnidade', payload.unidade_codigo? `${payload.unidade_codigo} - ${payload.unidade_nome}`:payload.unidade_nome],['perfilRole',payload.role],['perfilTelefone',payload.telefone],['perfilEmail',payload.email]].forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.textContent=val; });
        }
        await carregarModulosAcessiveis();
        carregarFotoPerfil();
        window.__perfilState?.setStatus('', '');
      } catch(err){
        console.error(logPrefix,'erro carregarDadosPerfil:',err);
        window.__perfilState?.setStatus(err.message||'Erro ao carregar perfil','error');
      } finally {
        const endedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const ms = Math.max(0, endedAt - startedAt);
        try { console.log(logPrefix, 'carregarDadosPerfil:', ms.toFixed(1), 'ms'); } catch(_){ }
      }
    })();

    carregarDadosPerfil.__inFlight = p;
    try { return await p; }
    finally { carregarDadosPerfil.__inFlight = null; }
  }

  async function carregarModulosAcessiveis(){
    try {
      const r = await fetch(api('/api/modulos'), { credentials:'same-origin', cache:'no-store' });
      const cont = document.getElementById('perfilModulos');
      if(!r.ok){ cont && (cont.innerHTML='<span class="text-muted">Erro ao carregar módulos</span>'); return; }
      const payload = await r.json();
      const mods = payload?.data || payload || [];
      if(Array.isArray(mods) && mods.length){
        cont.innerHTML='';
        mods
          .filter(m=>m && String(m.status||'').toLowerCase()==='ativo')
          .forEach(m=>{ const b=document.createElement('span'); b.className='badge text-bg-primary me-1'; b.textContent=m.nome||'Módulo'; cont.appendChild(b); });
      } else cont.innerHTML='<span class="text-muted">Nenhum módulo acessível</span>';
    } catch(e){ console.warn(logPrefix,'falha módulos',e); const cont=document.getElementById('perfilModulos'); cont && (cont.innerHTML='<span class="text-muted">Erro ao carregar módulos</span>'); }
  }

  function carregarFotoPerfil(){
    const img=document.getElementById('fotoPerfil'); const user=window.currentUser||{}; if(!img) return;
    const ph = (BASE_PATH || '') + '/img/user-placeholder.svg';
    if(user.foto){
      // Sempre usar API para servir a imagem, evitando data URLs no src
      const apiUrl = BASE_PATH + '/api/usuario/foto';
      const sep = apiUrl.includes('?') ? '&' : '?';
      img.src = apiUrl + sep + 'v=' + Date.now();
    } else {
      img.src=ph;
    }
    img.onerror=function(){
      if(!this.dataset.fallback){
        this.dataset.fallback='1';
        this.src=ph + '?v=' + Date.now();
      }
    };
  }

  // Helper público para construção de URL de foto de usuário (navbar, offcanvas, etc.)
  function buildUserFotoUrl(foto){
    if(!foto) return (BASE_PATH||'') + '/img/user-placeholder.svg';
    // Sempre retornar API URL para evitar data URLs no src
    return BASE_PATH + '/api/usuario/foto';
  }

  function iniciarAlteracaoFoto(){ const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.style.display='none'; input.addEventListener('change',e=>{ const file=e.target.files?.[0]; if(!file){ input.remove(); return;} if(file.size>5*1024*1024){ alert('Arquivo muito grande. Máximo 5MB.'); input.remove(); return;} if(!file.type.startsWith('image/')){ alert('Selecione uma imagem válida.'); input.remove(); return;} const img=document.getElementById('fotoPerfil'); if(!fotoPreviewOriginal) fotoPreviewOriginal=img.src; fotoEmEdicao=file; const reader=new FileReader(); reader.onload=ev=>{ img.src=ev.target.result; }; reader.readAsDataURL(file); document.getElementById('btnAlterarFoto')?.classList.add('d-none'); document.getElementById('grupoConfirmarFoto')?.classList.remove('d-none'); }); document.body.appendChild(input); input.click(); }
  function cancelarAlteracaoFoto(){ if(fotoEmEdicao && fotoPreviewOriginal){ document.getElementById('fotoPerfil').src=fotoPreviewOriginal; } fotoEmEdicao=null; fotoPreviewOriginal=null; document.getElementById('btnAlterarFoto')?.classList.remove('d-none'); document.getElementById('grupoConfirmarFoto')?.classList.add('d-none'); }
  async function confirmarAlteracaoFoto(){ if(!fotoEmEdicao){ cancelarAlteracaoFoto(); return;} try { setStatusFoto('Enviando...','info'); await enviarFoto(fotoEmEdicao); fotoAtualizada=true; setStatusFoto('Foto atualizada.','success'); } catch(e){ console.error(logPrefix,'erro enviar foto',e); setStatusFoto('Falha ao enviar foto: '+(e.message||'erro'),'error'); return;} fotoEmEdicao=null; fotoPreviewOriginal=null; document.getElementById('btnAlterarFoto')?.classList.remove('d-none'); document.getElementById('grupoConfirmarFoto')?.classList.add('d-none'); }
  function setStatusFoto(msg,kind){ let el=document.getElementById('statusFotoPerfil'); if(!el){ el=document.createElement('div'); el.id='statusFotoPerfil'; el.className='small mt-2'; document.getElementById('perfilFotoBotoes')?.appendChild(el);} const map={info:'text-muted',success:'text-success',error:'text-danger',warning:'text-warning'}; el.className='small mt-2 '+(map[kind]||'text-muted'); el.textContent=msg||''; }
  // Versão aprimorada: atualiza navbar/offcanvas imediatamente
  async function enviarFoto(file){
    const fd=new FormData(); fd.append('foto',file);
    const r=await fetch(api('/api/usuario/foto'),{ method:'POST', body:fd, credentials:'same-origin', cache:'no-store' });
    if(r.ok){
      const result=await r.json();
      const novoNome = result.foto;
      const bust = Date.now();
      const localImg = document.getElementById('fotoPerfil');
      try {
        // Sempre usar API URL após upload
        const apiUrl = BASE_PATH + '/api/usuario/foto';
        const sep = apiUrl.includes('?') ? '&' : '?';
        if(localImg) localImg.src = apiUrl + sep + 'v=' + bust;
      } catch(e){ if(localImg) localImg.src = (String(novoNome||'').startsWith('data:')? novoNome : ('/uploads/' + String(novoNome||'').replace(/^uploads\//,'') + '?v=' + bust)); }
      fotoAtualizada = true;
      if(window.currentUser) window.currentUser.foto = novoNome;
      try {
        // Atualiza avatares existentes instantaneamente, sempre via API
        const apiUrl = BASE_PATH + '/api/usuario/foto';
        const sep = apiUrl.includes('?') ? '&' : '?';
        const finalSrc = apiUrl + sep + 'v=' + bust;
        document.querySelectorAll('.avatar-img').forEach(img=>{ img.src = finalSrc; });
      } catch(e){ console.warn('[perfil-modular] falha atualizar avatares imediatos', e); }
      // Dispara evento para listeners adicionais
      window.dispatchEvent(new CustomEvent('perfil:fotoAtualizada', { detail:{ foto: novoNome } }));
      alert('Foto atualizada com sucesso!');
    } else {
      const err = await r.json().catch(()=>({}));
      alert('Erro ao atualizar foto: '+(err.error||'Erro desconhecido'));
    }
  }
  function alterarSenha(){ const mp=bootstrap.Modal.getInstance(document.getElementById('modalPerfil')); mp?.hide(); const el=document.getElementById('modalAlterarSenha'); if(el) bootstrap.Modal.getOrCreateInstance(el).show(); }
  function mostrarErro(msg){ if(window.__perfilState){ window.__perfilState.setStatus(msg,'error'); return;} alert(msg); }

  document.addEventListener('DOMContentLoaded',()=>{
    console.log(logPrefix,'DOM pronto');
    const form=document.getElementById('formAlterarSenha');
    form && form.addEventListener('submit',e=>{ e.preventDefault(); salvarNovaSenha(); });
    const modalPerfilEl=document.getElementById('modalPerfil');
    if(modalPerfilEl){
      modalPerfilEl.addEventListener('show.bs.modal',()=>{ try{ carregarDadosPerfil(); }catch(e){ console.warn(logPrefix,'falha show',e);} });
      modalPerfilEl.addEventListener('hidden.bs.modal',()=>{ if(fotoEmEdicao && fotoPreviewOriginal){ document.getElementById('fotoPerfil').src=fotoPreviewOriginal; fotoEmEdicao=null; fotoPreviewOriginal=null; document.getElementById('btnAlterarFoto')?.classList.remove('d-none'); document.getElementById('grupoConfirmarFoto')?.classList.add('d-none'); }
        if(fotoAtualizada){ fotoAtualizada=false; window.dispatchEvent(new CustomEvent('perfil:fotoAtualizada')); }
      });
    }
  });

  async function salvarNovaSenha(){
    const statusEl=document.getElementById('statusAlterarSenha');
    const senhaAtualEl=document.getElementById('senhaAtual');
    const novaSenhaEl=document.getElementById('novaSenha');
    const confirmarEl=document.getElementById('confirmarSenha');
    const btnSalvar=document.getElementById('btnSalvarSenha');
    function setStatus(msg,tipo='info'){ if(!statusEl) return; statusEl.className=''; const map={info:'text-secondary',success:'text-success',error:'text-danger',warning:'text-warning'}; statusEl.classList.add(map[tipo]||'text-secondary'); statusEl.textContent=msg; }
    const senhaAtual=senhaAtualEl?.value?.trim()||''; const novaSenha=novaSenhaEl?.value?.trim()||''; const confirmar=confirmarEl?.value?.trim()||'';
    if(!senhaAtual||!novaSenha||!confirmar){ setStatus('Preencha todos os campos.','warning'); return; }
    if(novaSenha.length<6){ setStatus('Nova senha deve ter ao menos 6 caracteres.','warning'); return; }
    if(novaSenha!==confirmar){ setStatus('Confirmação não confere.','warning'); return; }
    try {
      setStatus('Salvando...','info'); if(btnSalvar){ btnSalvar.disabled=true; btnSalvar.dataset.originalText=btnSalvar.textContent; btnSalvar.textContent='Salvando...'; }
      const resp=await fetch(api('/api/usuario/senha'),{ method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ senhaAtual, novaSenha }), credentials:'same-origin', cache:'no-store' });
      const payload=await resp.json().catch(()=>({}));
      if(!resp.ok || payload?.error){ setStatus(payload.error||payload.message||`Erro (${resp.status}) ao alterar senha`,'error'); return; }
      setStatus('Senha alterada com sucesso!','success'); senhaAtualEl.value=''; novaSenhaEl.value=''; confirmarEl.value=''; if(window.currentUser){ window.currentUser.primeiro_acesso=false; window.currentUser.senha_provisoria=false; }
      setTimeout(()=>{ const modal=bootstrap.Modal.getInstance(document.getElementById('modalAlterarSenha')); modal?.hide(); },800);
    } catch(err){ console.error(logPrefix,'erro salvarNovaSenha',err); setStatus(err.message||'Falha ao alterar senha','error'); } finally { if(btnSalvar){ btnSalvar.disabled=false; btnSalvar.textContent=btnSalvar.dataset.originalText||'Salvar Senha'; } }
  }

  // Expor API global
  Object.assign(window, {
    abrirModalPerfil,
    carregarDadosPerfil,
    iniciarAlteracaoFoto,
    cancelarAlteracaoFoto,
    confirmarAlteracaoFoto,
    alterarSenha,
    salvarNovaSenha,
    buildUserFotoUrl
  });

  emitReady('init');
})();
