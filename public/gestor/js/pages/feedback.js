/* =========================================================================
 *  FEEDBACK — Gerenciar feedbacks (Gestor)
 *  - Lista / detalhe
 *  - Alterar status
 *  - Salvar resposta
 *  Obs.: Endpoints podem existir em /api/gestor/feedback* (deploy) OU /gestor/api/gestor/feedback* (repo modularizado).
 * ========================================================================= */

console.debug('[feedback.js] carregado');

document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);
  const els = {
    alert: byId('fbAlert'),
    filters: byId('fbFilters'),
    search: byId('fbSearch'),
    status: byId('fbStatus'),
    tipo: byId('fbTipo'),
    btnRefresh: byId('fbBtnRefresh'),
    btnDelete: byId('fbBtnDelete'),
    btnClear: byId('fbBtnClear'),
    count: byId('fbCount'),
    tbody: byId('fbTbody'),

    selectAll: byId('fbSelectAll'),

    pageSize: byId('fbPageSize'),
    btnPrev: byId('fbBtnPrev'),
    btnNext: byId('fbBtnNext'),
    pagerInfo: byId('fbPagerInfo'),

    detail: byId('fbDetail'),
    detailHint: byId('fbDetailHint'),
    detailId: byId('fbDetailId'),
    detailTipo: byId('fbDetailTipo'),
    detailStatus: byId('fbDetailStatus'),
    detailData: byId('fbDetailData'),
    detailMsg: byId('fbDetailMensagem'),
    detailUrl: byId('fbDetailUrl'),

    editStatus: byId('fbEditStatus'),
    editStatusBtn: byId('fbEditStatusBtn'),
    editStatusLabel: byId('fbEditStatusLabel'),
    editStatusPill: byId('fbEditStatusPill'),
    editStatusMenu: byId('fbEditStatusMenu'),
    btnSaveStatus: byId('fbBtnSaveStatus'),

    resposta: byId('fbResposta'),
    btnSaveResposta: byId('fbBtnSaveResposta'),

    anexos: byId('fbAnexos'),

    detailCard: byId('fbDetailCard'),
    detailUrlLink: byId('fbDetailUrlLink'),

    detailAvatar: byId('fbDetailAvatar'),

    // filtro por coluna (estilo Excel)
    colFilter: byId('fbColFilter'),
    colFilterTitle: byId('fbColFilterTitle'),
    colFilterClose: byId('fbColFilterClose'),
    colFilterSearch: byId('fbColFilterSearch'),
    colFilterAll: byId('fbColFilterAll'),
    colFilterList: byId('fbColFilterList'),
    colFilterApply: byId('fbColFilterApply'),
    colFilterCancel: byId('fbColFilterCancel'),
    colFilterClear: byId('fbColFilterClear'),

    widgetsBox: byId('fbWidgetsBox'),
  };

  function formatFeedbackCountLabel(n){
    const count = Number(n || 0);
    if (!Number.isFinite(count) || count <= 0) return '0 feedbacks';
    return `${count} feedback${count === 1 ? '' : 's'}`;
  }

  function askDeleteConfirm(count){
    const modalEl = byId('fbDeleteConfirmModal');
    const countEl = byId('fbDeleteConfirmCount');
    const yesBtn = byId('fbDeleteConfirmYes');

    const label = formatFeedbackCountLabel(count);

    // fallback (caso Bootstrap/modal não esteja disponível)
    if (!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)){
      return Promise.resolve(window.confirm(`Deseja excluir ${label}? Esta exclusão é definitiva e não pode ser desfeita.`));
    }

    if (countEl) countEl.textContent = label;

    return new Promise((resolve) => {
      let resolved = false;

      const bs = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true, focus: true });

      const onHidden = () => {
        if (resolved) return;
        resolved = true;
        resolve(false);
      };

      const onYes = (e) => {
        try { e?.preventDefault?.(); } catch { /* noop */ }
        if (resolved) return;
        resolved = true;
        resolve(true);
        try { bs.hide(); } catch { /* noop */ }
      };

      modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      yesBtn.addEventListener('click', onYes, { once: true });

      bs.show();
    });
  }

  // ===== Avatar (mesmas regras do widget de feedback) =====
  function normalizeTipoKey(v){
    let s = String(v || '').toLowerCase().trim();
    if (!s) return '';
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { /* noop */ }
    return s.replaceAll(' ', '_');
  }

  function avatarFileForTipo(tipo){
    const t = normalizeTipoKey(tipo);
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

  function setDetailAvatarByFile(fileName){
    if (!els.detailAvatar) return;
    try {
      els.detailAvatar.src = `/images/${String(fileName || '')}`;
    } catch { /* noop */ }
  }

  function setDetailAvatarIntro(){
    setDetailAvatarByFile('avatarposicao1.png');
  }

  function setDetailAvatarForTipo(tipo){
    setDetailAvatarByFile(avatarFileForTipo(tipo));
  }

  // ===== Base path (para fallback) =====
  const BASE = (function(){
    if (window.__APP_BASE_PATH__) return String(window.__APP_BASE_PATH__);
    const fromBody = document.body && document.body.getAttribute('data-base-path');
    if (fromBody) return String(fromBody);
    try {
      const p = window.location.pathname || '';
      return p.startsWith('/gestor') ? '/gestor' : '';
    } catch { return ''; }
  })();
  if (!window.__APP_BASE_PATH__) window.__APP_BASE_PATH__ = BASE;

  // ===== Endpoints (com fallback) =====
  function candidates(root){
    const a = [];
    // deploy antigo: /api/gestor/feedback...
    a.push(root);
    // modularizado: /gestor/api/gestor/feedback...
    if (BASE) a.push(`${BASE}${root.startsWith('/') ? '' : '/'}${root}`);
    // (extra) alguns setups montam tudo em /gestor/api/feedback...
    if (BASE && root.startsWith('/api/gestor/')) a.push(`${BASE}/api${root.slice('/api'.length)}`);
    // unique
    return [...new Set(a)];
  }

  const API = {
    list: () => candidates('/api/gestor/feedback'),
    detail: (id) => candidates(`/api/gestor/feedback/${encodeURIComponent(String(id))}`),
    status: (id) => candidates(`/api/gestor/feedback/${encodeURIComponent(String(id))}/status`),
    resposta: (id) => candidates(`/api/gestor/feedback/${encodeURIComponent(String(id))}/resposta`),
    del: (id) => candidates(`/api/gestor/feedback/${encodeURIComponent(String(id))}`),

    widgetModules: () => candidates('/api/gestor/widgets/modules'),
    widgetVisibility: () => candidates('/api/gestor/widgets/feedback'),
    widgetSetVisibility: () => candidates('/api/gestor/widgets/feedback'),
  };

  async function initWidgetsPanel(){
    if (!els.widgetsBox) return;

    // Helper: normaliza resposta
    const unwrap = (out) => {
      if (!out || !out.ok) return null;
      return out.data || null;
    };

    // carregar módulos
    const modsOut = await fetchJsonWithFallback(API.widgetModules(), { method: 'GET' });
    const modsData = unwrap(modsOut);
    const modules = Array.isArray(modsData?.modules) ? modsData.modules : [];

    if (!modules.length){
      els.widgetsBox.innerHTML = '<div class="text-muted">Nenhum módulo encontrado.</div>';
      return;
    }

    // carregar visibilidade
    const visOut = await fetchJsonWithFallback(API.widgetVisibility(), { method: 'GET' });
    const visData = unwrap(visOut);
    const enabledByModule = (visData && typeof visData.enabledByModule === 'object' && visData.enabledByModule) ? visData.enabledByModule : {};

    const rows = modules.map((m) => {
      const id = String(m?.id || '').trim();
      const name = String(m?.name || id).trim();
      const enabled = enabledByModule[id] !== false;

      const inputId = `fbWidgetFeedback_${cssEscape(id)}`;
      return `
        <div class="fb-widget-row">
          <div class="fb-widget-name">${escapeHtml(name)}</div>
          <div class="form-check form-switch fb-widget-switch">
            <input class="form-check-input" type="checkbox" role="switch" id="${inputId}" data-module="${escapeHtml(id)}" ${enabled ? 'checked' : ''}>
            <label class="form-check-label" for="${inputId}">${enabled ? 'Ativo' : 'Oculto'}</label>
          </div>
        </div>
      `;
    }).join('');

    const allEnabled = modules.every(m => enabledByModule[String(m?.id||'').trim()] !== false);
    const anyEnabled = modules.some(m => enabledByModule[String(m?.id||'').trim()] !== false);
    const mixed = anyEnabled && !allEnabled;

    const allId = 'fbWidgetFeedbackAll';
    const head = `
      <div class="fb-widget-head">
        <div class="fb-widget-head-left">Módulos</div>
        <div class="fb-widget-head-right">
          <div class="form-check form-switch fb-widget-switch fb-widget-switch--all">
            <input class="form-check-input" type="checkbox" role="switch" id="${allId}" ${allEnabled ? 'checked' : ''}>
            <label class="form-check-label" for="${allId}">${allEnabled ? 'Ativo' : (mixed ? 'Misto' : 'Oculto')}</label>
          </div>
        </div>
      </div>
    `;

    els.widgetsBox.innerHTML = `
      <div class="fb-widget-panel">
        ${head}
        <div class="fb-widget-scroll" data-widgets-scroll>
          <div class="fb-widget-grid">${rows}</div>
        </div>
      </div>
    `;

    const allEl = els.widgetsBox.querySelector(`#${cssEscape(allId)}`);
    const allLabel = els.widgetsBox.querySelector(`label[for="${cssEscape(allId)}"]`);
    if (allEl && mixed) {
      try { allEl.indeterminate = true; } catch { /* noop */ }
      if (allLabel) allLabel.textContent = 'Misto';
    }

    const setAllUi = () => {
      const items = [...els.widgetsBox.querySelectorAll('input[type="checkbox"][data-module]')];
      const checkedCount = items.filter(i => i.checked).length;
      const all = checkedCount === items.length;
      const none = checkedCount === 0;
      const mix = !all && !none;
      if (!allEl) return;
      allEl.indeterminate = mix;
      allEl.checked = all;
      if (allLabel) allLabel.textContent = all ? 'Ativo' : (mix ? 'Misto' : 'Oculto');
    };

    async function setAllEnabled(nextEnabled){
      const inputs = [...els.widgetsBox.querySelectorAll('input[type="checkbox"][data-module]')];
      if (!inputs.length) return;

      // trava UI durante operação
      inputs.forEach(i => { i.disabled = true; });
      if (allEl) allEl.disabled = true;

      // aplica otimista
      inputs.forEach(i => {
        i.checked = !!nextEnabled;
        const label = els.widgetsBox.querySelector(`label[for="${cssEscape(i.id)}"]`);
        if (label) label.textContent = nextEnabled ? 'Ativo' : 'Oculto';
      });
      if (allEl) {
        allEl.indeterminate = false;
        allEl.checked = !!nextEnabled;
        if (allLabel) allLabel.textContent = nextEnabled ? 'Ativo' : 'Oculto';
      }

      const results = await Promise.allSettled(inputs.map(async (i) => {
        const moduleId = String(i.getAttribute('data-module') || '').trim();
        const body = JSON.stringify({ module: moduleId, enabled: !!nextEnabled });
        const out = await fetchJsonWithFallback(API.widgetSetVisibility(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        return { ok: out.ok, status: out.status, moduleId };
      }));

      const anyFail = results.some(r => (r.status === 'fulfilled' ? !r.value.ok : true));
      if (anyFail){
        showAlert('Não foi possível aplicar a configuração em todos os módulos.', 'warning');
      } else {
        showAlert('Configuração aplicada em todos os módulos.', 'success');
      }

      // reabilita UI
      inputs.forEach(i => { i.disabled = false; });
      if (allEl) allEl.disabled = false;
      setAllUi();
    }

    // bind
    els.widgetsBox.querySelectorAll('input[type="checkbox"][data-module]').forEach((el) => {
      el.addEventListener('change', async () => {
        const moduleId = String(el.getAttribute('data-module') || '').trim();
        const enabled = !!el.checked;

        // UI: label
        const label = els.widgetsBox.querySelector(`label[for="${cssEscape(el.id)}"]`);
        if (label) label.textContent = enabled ? 'Ativo' : 'Oculto';

        const body = JSON.stringify({ module: moduleId, enabled });
        const out = await fetchJsonWithFallback(API.widgetSetVisibility(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (!out.ok){
          // rollback visual
          el.checked = !enabled;
          if (label) label.textContent = (!enabled) ? 'Ativo' : 'Oculto';
          const msg = out.status === 403
            ? 'Acesso negado para alterar widgets.'
            : 'Não foi possível salvar a configuração do widget.';
          showAlert(msg, out.status === 403 ? 'warning' : 'danger');
          return;
        }

        showAlert('Configuração do widget atualizada.', 'success');
        setAllUi();
      });
    });

    if (allEl){
      allEl.addEventListener('change', async () => {
        const nextEnabled = !!allEl.checked;
        // se estava em estado misto, o clique pode “des-indeterminate” sem mudar checked; garantimos ação explícita
        await setAllEnabled(nextEnabled);
      });
    }
  }

  // ===== UI helpers =====
  function showAlert(message, type='info'){
    if (!els.alert) return;
    const cls = (type === 'danger' || type === 'warning' || type === 'success' || type === 'info') ? type : 'info';
    els.alert.innerHTML = `
      <div class="alert alert-${cls} alert-dismissible fade show" role="alert">
        ${escapeHtml(String(message || ''))}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
      </div>
    `;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  function cssEscape(s){
    const v = String(s ?? '');
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
    } catch {}
    // fallback simples
    return v.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function fmtDate(v){
    if(!v) return '';
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString('pt-BR');
    } catch { return String(v); }
  }

  function fmtBytes(bytes){
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '';
    const units = ['B','KB','MB','GB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1){
      v /= 1024;
      i++;
    }
    const digits = i === 0 ? 0 : (v < 10 ? 1 : 0);
    return `${v.toFixed(digits)} ${units[i]}`;
  }

  function normalizeStatus(v){
    const s = String(v || '').toLowerCase().trim();
    if(!s) return '';
    // tolerar variantes
    if (s === 'em andamento') return 'em_andamento';
    if (s === 'in_progress') return 'em_andamento';
    if (s === 'respondido' || s === 'replied') return 'respondido';
    return s.replaceAll(' ', '_');
  }

  function humanStatus(v){
    const s = normalizeStatus(v);
    switch(s){
      case 'novo': return 'Novo';
      case 'respondido': return 'Respondido';
      case 'aberto': return 'Aberto';
      case 'em_andamento': return 'Em andamento';
      case 'resolvido': return 'Resolvido';
      case 'cancelado': return 'Cancelado';
      default: return s || '—';
    }
  }

  function statusBadgeHtml(v){
    const s = normalizeStatus(v);
    const label = (humanStatus(s) || '—').toUpperCase();
    if (s === 'novo') return `<span class="badge text-bg-warning fb-badge">${escapeHtml(label)}</span>`;
    if (s === 'respondido' || s === 'resolvido') return `<span class="badge text-bg-success fb-badge">${escapeHtml(label)}</span>`;
    if (s === 'cancelado') return `<span class="badge text-bg-secondary fb-badge">${escapeHtml(label)}</span>`;
    if (s === 'em_andamento' || s === 'aberto') return `<span class="badge text-bg-info fb-badge">${escapeHtml(label)}</span>`;
    return `<span class="badge text-bg-light text-dark fb-badge">${escapeHtml(label)}</span>`;
  }

  function tipoBadgeHtml(v){
    const raw = String(v || '').toLowerCase().trim();
    const label = (humanTipo(raw) || '—').toUpperCase();
    let cls = 'fb-tipo-outro';
    if (raw === 'bug' || raw === 'erro') cls = 'fb-tipo-bug';
    else if (raw === 'sugestao') cls = 'fb-tipo-sugestao';
    else if (raw === 'duvida') cls = 'fb-tipo-duvida';
    else if (raw === 'critica') cls = 'fb-tipo-critica';
    else if (raw === 'elogio') cls = 'fb-tipo-elogio';
    return `<span class="fb-chip fb-chip--tipo ${cls}">${escapeHtml(label)}</span>`;
  }

  function humanTipo(v){
    const s = String(v||'').toLowerCase().trim();
    switch(s){
      case 'bug': return 'Bug';
      case 'sugestao': return 'Sugestão';
      case 'duvida': return 'Dúvida';
      case 'critica': return 'Crítica';
      case 'erro': return 'Erro';
      case 'elogio': return 'Elogio';
      case 'outro': return 'Outro';
      default: return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '—';
    }
  }

  // ===== HTTP helpers =====
  async function fetchJsonTry(url, options){
    const r = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'fetch',
        ...(options && options.headers ? options.headers : {})
      },
      ...options,
    });

    const text = await r.text().catch(() => '');
    const data = (function(){
      try { return text ? JSON.parse(text) : null; } catch { return null; }
    })();

    return { ok: r.ok, status: r.status, data, text };
  }

  async function fetchJsonWithFallback(urls, options){
    const errors = [];
    for (const u of urls){
      try {
        const out = await fetchJsonTry(u, options);
        if (out.ok) return { ...out, url: u };
        // 404/405 costumam indicar endpoint/método não suportado; tenta próximos.
        errors.push({ url:u, status: out.status, text: out.text });
        if (out.status !== 404 && out.status !== 405) {
          // Para erros de permissão/validação, devolve já.
          return { ...out, url: u };
        }
      } catch (e){
        errors.push({ url:u, error: e?.message || String(e) });
      }
    }
    const last = errors[errors.length - 1];
    return { ok:false, status: 0, data: null, text: last ? JSON.stringify(last) : '', url: urls[0] };
  }

  // ===== Data mapping =====
  function pickId(item){
    return item? (item._id || item.id || item.feedback_id || item.protocolo || item.codigo) : '';
  }

  function pickResumo(item){
    const msg = item?.mensagem || item?.message || item?.texto || item?.descricao || '';
    const s = String(msg || '').trim();
    if (!s) return '';
    return s.length > 90 ? (s.slice(0, 90) + '…') : s;
  }

  function pickCreatedAt(item){
    return item?.createdAt || item?.created_at || item?.data || item?.dataCriacao || item?.created || '';
  }

  function pickTipo(item){
    return item?.tipo || item?.type || item?.categoria || item?.assunto || '';
  }

  function pickStatus(item){
    return item?.status || item?.state || item?.situacao || '';
  }

  function pickMensagem(item){
    return item?.mensagem || item?.message || item?.texto || item?.descricao || '';
  }

  function pickResposta(item){
    return item?.resposta || item?.reply || item?.resposta_admin || item?.adminReply || '';
  }

  function pickContextoUrl(item){
    return item?.contexto?.url || item?.contexto?.path || item?.origem?.path || item?.origem?.url || item?.url || item?.contextoUrl || '';
  }

  function normalizeKey(v){
    return String(v || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function extractFirstUrl(text){
    const s = String(text || '');
    const m = s.match(/https?:\/\/[^\s"'<>]+/i);
    return m ? m[0] : '';
  }

  function sanitizeMensagemAndInferUrl(rawMsg, tipo, contextoUrl){
    const msg = String(rawMsg || '');
    const lines = msg.split(/\r?\n/).map(l => String(l || '').trim());

    const tipoKey = normalizeKey(tipo);
    let inferredUrl = String(contextoUrl || '').trim();

    const out = [];
    for (let i = 0; i < lines.length; i++){
      const line = lines[i];
      if (!line) continue;

      const key = normalizeKey(line);

      // remove linha do tipo (ex: "BUG")
      if (i === 0 && tipoKey && key === tipoKey) {
        continue;
      }

      // remove linha "Módulo/Página ..." (widget BUG) e move para Contexto (URL)
      // Obs.: não depende de ':' ou '/' pois normalizeKey remove pontuação
      if (key.startsWith('modulo pagina')){
        // pega o valor após ':' quando existir, senão tenta extrair URL ou usa a linha original
        const afterColon = (line.includes(':') ? line.split(':').slice(1).join(':') : '').trim();
        const fromUrl = extractFirstUrl(line);
        const candidate = String(fromUrl || afterColon || '').trim();

        // Aqui a prioridade é o que o usuário informou no fluxo do widget
        if (candidate) inferredUrl = candidate;
        continue;
      }

      // fallback: linhas explicitamente de URL/página (se vierem em outros formatos)
      if (key.startsWith('url') || key.startsWith('pagina')){
        const afterColon = (line.includes(':') ? line.split(':').slice(1).join(':') : '').trim();
        const fromUrl = extractFirstUrl(line);
        const candidate = String(fromUrl || afterColon || '').trim();
        if (candidate && !inferredUrl) inferredUrl = candidate;
        continue;
      }

      out.push(line);
    }

    return {
      mensagem: out.join('\n').trim(),
      contextoUrl: inferredUrl,
    };
  }

  function pickUsuario(item){
    const n = item?.criadoPor?.nome || item?.usuario?.nome || item?.user?.nome || '';
    const e = item?.criadoPor?.email || item?.usuario?.email || item?.user?.email || '';
    const a = String(n || '').trim();
    const b = String(e || '').trim();
    if (a && b && a.toLowerCase() !== b.toLowerCase()) return `${a} (${b})`;
    return a || b || '—';
  }

  function respostaToText(v){
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      // Prioriza campos textuais conhecidos (deploys diferentes)
      const maybe = v.texto || v.resposta || v.message || v.mensagem || v.body || v.value || v.content;
      if (typeof maybe === 'string') return maybe;
      // Se for um objeto "metadados" (ex.: {por:{...}, userId..., nome...}) não exibe JSON no textarea.
      const hasTextLike = Object.values(v).some(x => typeof x === 'string' && x.trim());
      const looksLikeMetaOnly = ('por' in v) || ('userId' in v) || ('nome' in v) || ('email' in v) || ('role' in v);
      if (!hasTextLike && looksLikeMetaOnly) return '';
      try { return JSON.stringify(v, null, 2); } catch { return String(v); }
    }
    return String(v);
  }

  function pickAnexos(item){
    const v = item?.anexos || item?.anexo || item?.attachments || item?.files;
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v];
    return [];
  }

  function pickAnexoUrl(a){
    return a?.url || a?.href || a?.link || a?.path || a?.src || '';
  }

  function pickAnexoNome(a){
    return a?.nome || a?.name || a?.filename || a?.arquivo || '';
  }

  function pickAnexoMime(a){
    return a?.mime || a?.mimetype || a?.type || '';
  }

  function pickAnexoSize(a){
    return a?.size || a?.tamanho || a?.bytes || 0;
  }

  function isImageAttachment(a){
    const mime = String(pickAnexoMime(a) || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    const url = String(pickAnexoUrl(a) || '').toLowerCase();
    return /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url);
  }

  // ===== State =====
  let rawList = [];
  let currentList = [];
  let selectedId = '';
  let page = 1;

  const selectedIds = new Set();

  const COLS = {
    protocolo: 'Protocolo',
    tipo: 'Tipo',
    status: 'Status',
    usuario: 'Usuário',
    data: 'Data',
  };

  /** @type {Record<string, Set<string> | null>} */
  const columnFilters = {
    protocolo: null,
    tipo: null,
    status: null,
    usuario: null,
    data: null,
  };

  let activeCol = '';
  let activeColButton = null;

  function setStatusValue(v){
    const norm = normalizeStatus(v);
    if (els.editStatus) els.editStatus.value = norm;

    const label = norm ? humanStatus(norm) : 'Selecione…';
    // Para não repetir: com status selecionado, mostramos só o chip.
    if (els.editStatusLabel) els.editStatusLabel.textContent = norm ? '' : label;

    if (els.editStatusBtn){
      els.editStatusBtn.setAttribute('aria-label', norm ? `Status: ${label}` : 'Selecionar status');
    }

    if (els.editStatusPill){
      if (!norm){
        els.editStatusPill.hidden = true;
        els.editStatusPill.className = 'fb-status-pill';
        els.editStatusPill.textContent = '—';
      } else {
        els.editStatusPill.hidden = false;
        els.editStatusPill.className = `fb-status-pill fb-status--${norm}`;
        els.editStatusPill.textContent = label;
      }
    }

    if (els.editStatusMenu){
      els.editStatusMenu.querySelectorAll('[data-value]').forEach((b) => {
        const bv = normalizeStatus(b.getAttribute('data-value') || '');
        const isActive = !!norm && bv === norm;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-current', isActive ? 'true' : 'false');
      });
    }
  }

  function initStatusDropdown(){
    if (!els.editStatusMenu) return;
    els.editStatusMenu.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-value]') : null;
      if (!btn) return;
      if (els.editStatusBtn && els.editStatusBtn.disabled) return;
      const v = btn.getAttribute('data-value') || '';
      setStatusValue(v);
    });
  }

  function setDetailEnabled(isEnabled){
    const disabled = !isEnabled;

    // Hint: quando há seleção, some sem reservar espaço
    if (els.detailHint) {
      els.detailHint.hidden = !!isEnabled;
    }

    if (els.editStatusBtn) els.editStatusBtn.disabled = disabled;
    if (els.btnSaveStatus) els.btnSaveStatus.disabled = disabled;
    if (els.resposta) els.resposta.disabled = disabled;
    if (els.btnSaveResposta) els.btnSaveResposta.disabled = disabled;
  }

  function clearSelection(){
    selectedId = '';
    setDetailEnabled(false);
    if (els.detailId) els.detailId.textContent = '—';
    if (els.detailTipo) els.detailTipo.innerHTML = '—';
    if (els.detailStatus) els.detailStatus.innerHTML = '—';
    if (els.detailData) els.detailData.textContent = '—';
    if (els.detailMsg) els.detailMsg.value = '';
    if (els.detailUrl) els.detailUrl.value = '';
    if (els.detailUrlLink){
      els.detailUrlLink.hidden = true;
      els.detailUrlLink.href = '#';
    }
    setStatusValue('');
    if (els.resposta) els.resposta.value = '';
    if (els.anexos) els.anexos.innerHTML = '<div class="text-muted">—</div>';

    setDetailAvatarIntro();

    // remove active
    document.querySelectorAll('.fb-row.active').forEach(tr => tr.classList.remove('active'));
  }

  function clearCheckedSelection(){
    selectedIds.clear();
    syncSelectionUI();
  }

  function visibleRowCheckboxes(){
    if (!els.tbody) return [];
    return [...els.tbody.querySelectorAll('input.fb-row-check[data-id]')];
  }

  function updateSelectAllState(){
    if (!els.selectAll) return;
    const checks = visibleRowCheckboxes();
    if (!checks.length){
      els.selectAll.checked = false;
      els.selectAll.indeterminate = false;
      return;
    }
    const checkedCount = checks.filter(c => c.checked).length;
    els.selectAll.checked = checkedCount === checks.length;
    els.selectAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
  }

  function syncSelectionUI(){
    // Atualiza checkboxes visíveis conforme o Set
    visibleRowCheckboxes().forEach((c) => {
      const id = String(c.getAttribute('data-id') || '');
      c.checked = !!(id && selectedIds.has(id));
    });

    updateSelectAllState();

    // Botão Excluir só aparece com seleção
    if (els.btnDelete){
      els.btnDelete.hidden = selectedIds.size === 0;
      els.btnDelete.disabled = selectedIds.size === 0;
    }
  }

  function renderList(items){
    currentList = Array.isArray(items) ? items : [];
    if (els.count) {
      const total = Array.isArray(rawList) ? rawList.length : 0;
      const shown = currentList.length;
      els.count.textContent = (total && total !== shown)
        ? `${shown} item(ns) (filtrado de ${total})`
        : `${shown} item(ns)`;
    }

    if (!els.tbody) return;
    page = 1;
    renderPage();
  }

  function valueForColumn(item, col){
    switch(String(col || '')){
      case 'protocolo':
        return String(pickId(item) || '').trim();
      case 'tipo':
        return String(humanTipo(pickTipo(item)) || '').trim();
      case 'status':
        return String(humanStatus(pickStatus(item)) || '').trim();
      case 'usuario':
        return String(pickUsuario(item) || '').trim();
      case 'data': {
        const v = pickCreatedAt(item);
        if(!v) return '';
        try {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) return '';
          return d.toLocaleDateString('pt-BR');
        } catch { return ''; }
      }
      default:
        return '';
    }
  }

  function normalizeFilterValue(v){
    return String(v ?? '').trim();
  }

  function applyColumnFilters(list, exceptCol){
    const items = Array.isArray(list) ? list : [];
    const except = exceptCol ? String(exceptCol) : '';

    return items.filter((it) => {
      for (const col of Object.keys(COLS)){
        if (except && col === except) continue;
        const set = columnFilters[col];
        if (!set || !(set instanceof Set) || set.size === 0) continue;
        const v = normalizeFilterValue(valueForColumn(it, col));
        if (!set.has(v)) return false;
      }
      return true;
    });
  }

  function setData(items){
    rawList = Array.isArray(items) ? items : [];

    // remove seleções que não existem mais
    const validIds = new Set(rawList.map((it) => String(pickId(it) || '')).filter(Boolean));
    for (const id of [...selectedIds]){
      if (!validIds.has(String(id))) selectedIds.delete(id);
    }

    applyAndRender();
  }

  function applyAndRender(){
    const filtered = applyColumnFilters(rawList);
    renderList(filtered);

    // se selecionado, manter selecionado se existir no filtro
    if (selectedId){
      const exists = filtered.some(it => String(pickId(it)) === String(selectedId));
      if (!exists) clearSelection();
    }

    updateFilterIcons();
    syncSelectionUI();
  }

  function isFilterActive(col){
    const set = columnFilters[String(col || '')];
    return !!(set && set instanceof Set && set.size > 0);
  }

  function updateFilterIcons(){
    document.querySelectorAll('.fb-colfilter-btn').forEach((btn) => {
      const col = btn.getAttribute('data-col') || '';
      const icon = btn.querySelector('i');
      const active = isFilterActive(col);
      btn.classList.toggle('is-active', active);
      if (icon) icon.className = active ? 'bi bi-funnel-fill' : 'bi bi-filter';
    });
  }

  function uniqueValuesForColumn(list, col){
    const base = Array.isArray(list) ? list : [];
    const values = new Set();
    for (const it of base){
      values.add(normalizeFilterValue(valueForColumn(it, col)));
    }
    const arr = [...values];
    // ordenação com vazios por último
    arr.sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (a !== '' && b === '') return -1;
      return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    });
    return arr;
  }

  function ensureColFilterInBody(){
    if (!els.colFilter) return;
    // Importante: ancestrais com `transform` fazem `position: fixed` se comportar como relativo a eles.
    // Como os cards usam transform (ex.: translateZ), movemos o popover para o body.
    if (els.colFilter.parentElement !== document.body){
      document.body.appendChild(els.colFilter);
    }
  }

  function openColFilter(col, buttonEl){
    if (!els.colFilter || !els.colFilterList || !els.colFilterAll || !els.colFilterSearch) return;
    const colKey = String(col || '');
    if (!COLS[colKey]) return;

    ensureColFilterInBody();

    activeCol = colKey;
    activeColButton = buttonEl || null;

    // valores devem respeitar os outros filtros (exceto este)
    const base = applyColumnFilters(rawList, colKey);
    const values = uniqueValuesForColumn(base, colKey);

    if (els.colFilterTitle) els.colFilterTitle.textContent = `Filtro: ${COLS[colKey]}`;
    els.colFilterSearch.value = '';

    // seleção atual
    const currentSet = columnFilters[colKey];
    const isAll = !currentSet || !(currentSet instanceof Set) || currentSet.size === 0;

    els.colFilterList.innerHTML = values.map((v, idx) => {
      const id = `fbColFilterOpt_${colKey}_${idx}`;
      const label = v === '' ? '(Vazios)' : v;
      const checked = isAll ? true : currentSet.has(v);
      return `
        <div class="form-check">
          <input class="form-check-input fb-colfilter-opt" type="checkbox" id="${escapeHtml(id)}" data-value="${escapeHtml(v)}" ${checked ? 'checked' : ''}>
          <label class="form-check-label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
        </div>
      `;
    }).join('');

    // (Selecionar tudo)
    els.colFilterAll.checked = true;

    // posicionar popover
    const rect = (buttonEl && buttonEl.getBoundingClientRect) ? buttonEl.getBoundingClientRect() : null;
    const pop = els.colFilter;
    pop.hidden = false;
    pop.setAttribute('aria-hidden', 'false');
    // medir após abrir
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    // Como o popover é position: fixed, as coordenadas devem ser de viewport.
    let left = 8;
    let top = 8;
    if (rect){
      left = rect.left;
      top = rect.bottom + 6;

      // clamp horizontal
      left = Math.min(Math.max(8, left), vw - popRect.width - 8);

      // se estourar embaixo, tenta acima
      const bottom = top + popRect.height;
      const viewportBottom = vh - 8;
      if (bottom > viewportBottom){
        const tryTop = rect.top - popRect.height - 6;
        if (tryTop >= 8) top = tryTop;
      }
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    updateColFilterAllCheckbox();
    applyColFilterSearch();
    els.colFilterSearch.focus();
  }

  function closeColFilter(){
    if (!els.colFilter) return;
    els.colFilter.hidden = true;
    els.colFilter.setAttribute('aria-hidden', 'true');
    activeCol = '';
    activeColButton = null;
  }

  function getColFilterCheckedValues(){
    if (!els.colFilterList) return [];
    const checks = els.colFilterList.querySelectorAll('.fb-colfilter-opt');
    const out = [];
    checks.forEach((c) => {
      if (c && c.checked){
        out.push(normalizeFilterValue(c.getAttribute('data-value')));
      }
    });
    return out;
  }

  function updateColFilterAllCheckbox(){
    if (!els.colFilterAll || !els.colFilterList) return;
    const checks = [...els.colFilterList.querySelectorAll('.fb-colfilter-opt')];
    if (!checks.length){
      els.colFilterAll.checked = true;
      return;
    }
    const allChecked = checks.every(c => c.checked);
    els.colFilterAll.checked = allChecked;
  }

  function applyColFilterSearch(){
    if (!els.colFilterSearch || !els.colFilterList) return;
    const q = String(els.colFilterSearch.value || '').trim().toLowerCase();
    const items = els.colFilterList.querySelectorAll('.form-check');
    items.forEach((row) => {
      const lbl = row.querySelector('label');
      const txt = String(lbl?.textContent || '').toLowerCase();
      row.style.display = (!q || txt.includes(q)) ? '' : 'none';
    });
  }

  function renderPage(){
    if (!els.tbody) return;
    const total = currentList.length;

    const ps = Math.max(1, Number(els.pageSize?.value || 25) || 25);
    const totalPages = Math.max(1, Math.ceil(total / ps));
    page = Math.min(Math.max(1, page), totalPages);

    if (els.pagerInfo) {
      els.pagerInfo.textContent = `Página ${page} de ${totalPages} • ${total} itens`;
    }
    if (els.btnPrev) els.btnPrev.disabled = page <= 1;
    if (els.btnNext) els.btnNext.disabled = page >= totalPages;

    if (!total){
      els.tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Nenhum feedback encontrado.</td></tr>';
      syncSelectionUI();
      return;
    }

    const start = (page - 1) * ps;
    const slice = currentList.slice(start, start + ps);

    els.tbody.innerHTML = slice.map((it) => {
      const id = pickId(it);
      const tipoRaw = pickTipo(it);
      const st = pickStatus(it);
      const userLabel = pickUsuario(it);
      const dt = fmtDate(pickCreatedAt(it));
      const idText = escapeHtml(String(id || '—'));
      const idAttr = escapeHtml(String(id || ''));
      const checked = (id && selectedIds.has(String(id))) ? 'checked' : '';

      return `
        <tr class="fb-row" data-id="${escapeHtml(String(id || ''))}">
          <td class="fb-col-select">
            <input class="form-check-input fb-row-check" type="checkbox" data-id="${idAttr}" aria-label="Selecionar" ${checked}>
          </td>
          <td><strong>${idText}</strong></td>
          <td>${tipoBadgeHtml(tipoRaw)}</td>
          <td>${statusBadgeHtml(st)}</td>
          <td>${escapeHtml(userLabel)}</td>
          <td>${escapeHtml(dt)}</td>
        </tr>
      `;
    }).join('');

    // manter seleção visual após re-render/paginação
    if (selectedId){
      const active = els.tbody.querySelector(`.fb-row[data-id="${cssEscape(String(selectedId))}"]`);
      if (active) active.classList.add('active');
    }

    syncSelectionUI();
  }

  async function loadList(){
    if (els.tbody) els.tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Carregando…</td></tr>';

    const q = (els.search?.value || '').trim();
    const status = (els.status?.value || '').trim();
    const tipo = (els.tipo?.value || '').trim();

    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (tipo) qs.set('tipo', tipo);
    // cache-buster
    qs.set('_', String(Date.now()));

    const urls = API.list().map((u) => `${u}?${qs.toString()}`);
    const out = await fetchJsonWithFallback(urls, { method: 'GET' });

    if (!out.ok){
      const msg = out.status === 403
        ? 'Acesso negado. Esta página é restrita a Master/Admin.'
        : 'Falha ao carregar feedbacks. Verifique se a API /api/gestor/feedback está disponível.';
      showAlert(msg, out.status === 403 ? 'warning' : 'danger');
      renderList([]);
      return;
    }

    // aceitar {ok:true, items:[...]} ou array direto
    const payload = out.data;
    const items = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload?.data) ? payload.data : []));

    setData(items);
  }

  async function deleteSelected(){
    const ids = [...selectedIds].filter(Boolean);
    if (!ids.length) return;

    const ok = await askDeleteConfirm(ids.length);
    if (!ok) return;

    let successCount = 0;
    let failCount = 0;

    for (const id of ids){
      let out = await fetchJsonWithFallback(API.del(id), { method: 'DELETE' });

      // fallback: alguns setups podem não aceitar DELETE
      if (!out.ok && (out.status === 404 || out.status === 405)){
        out = await fetchJsonWithFallback(API.del(id), { method: 'POST' });
      }

      if (out.ok) {
        successCount++;
        selectedIds.delete(String(id));
        if (String(selectedId) === String(id)) clearSelection();
      } else {
        failCount++;
      }
    }

    if (failCount === 0){
      showAlert(`Exclusão concluída: ${successCount} item(ns).`, 'success');
    } else if (successCount === 0){
      showAlert('Não foi possível excluir os itens selecionados.', 'danger');
    } else {
      showAlert(`Excluídos ${successCount} item(ns). Falharam ${failCount}.`, 'warning');
    }

    syncSelectionUI();
    await loadList();
  }

  async function loadDetail(id){
    if (!id) return;
    selectedId = String(id);

    const out = await fetchJsonWithFallback(API.detail(selectedId), { method: 'GET' });
    if (!out.ok){
      showAlert('Falha ao carregar detalhes do feedback.', 'danger');
      clearSelection();
      return;
    }

    const payload = out.data;
    const item = payload?.item || payload?.data || payload;

    setDetailEnabled(true);

    const tipo = pickTipo(item);
    const status = pickStatus(item);
    const dt = pickCreatedAt(item);
    const msgRaw = pickMensagem(item);
    const resposta = pickResposta(item);
    const contextoUrlRaw = pickContextoUrl(item);

    const cleaned = sanitizeMensagemAndInferUrl(msgRaw, tipo, contextoUrlRaw);
    const msg = cleaned.mensagem;
    const contextoUrl = cleaned.contextoUrl;

    if (els.detailId) {
      const pid = String(pickId(item) || selectedId || '').trim();
      els.detailId.textContent = pid ? `Protocolo: ${pid}` : 'Protocolo: —';
    }
    if (els.detailTipo) els.detailTipo.innerHTML = tipoBadgeHtml(tipo);

    setDetailAvatarForTipo(tipo);
    if (els.detailStatus) els.detailStatus.innerHTML = statusBadgeHtml(status);
    if (els.detailData) els.detailData.textContent = fmtDate(dt) || '—';
    if (els.detailMsg) els.detailMsg.value = String(msg || '');
    const urlText = String(contextoUrl || '').trim();
    if (els.detailUrl) els.detailUrl.value = urlText;
    if (els.detailUrlLink){
      const isHttp = /^https?:\/\//i.test(urlText);
      const isAbsPath = urlText.startsWith('/');
      if (urlText && (isHttp || isAbsPath)){
        els.detailUrlLink.hidden = false;
        els.detailUrlLink.href = isHttp ? urlText : urlText;
      } else {
        els.detailUrlLink.hidden = true;
        els.detailUrlLink.href = '#';
      }
    }

    const stNorm = normalizeStatus(status);
    if (stNorm) setStatusValue(stNorm);

    if (els.resposta) els.resposta.value = respostaToText(resposta || '');

    const anexos = pickAnexos(item);
    if (els.anexos){
      if (!anexos.length){
        els.anexos.innerHTML = '<div class="text-muted">Nenhum anexo.</div>';
      } else {
        els.anexos.innerHTML = anexos.map((a, idx) => {
          const url = String(pickAnexoUrl(a) || '').trim();
          const nome = String(pickAnexoNome(a) || `Anexo ${idx+1}`);
          const mime = String(pickAnexoMime(a) || '').trim();
          const size = pickAnexoSize(a);
          const sizeText = fmtBytes(size);
          const metaParts = [mime ? mime.toUpperCase() : '', sizeText].filter(Boolean);
          const meta = metaParts.join(' • ');

          const safeNome = escapeHtml(nome);
          const safeMeta = escapeHtml(meta);
          const isImg = isImageAttachment(a);

          if (!url) {
            return `
              <div class="fb-attach">
                <div class="fb-attach-main">
                  <div class="fb-attach-icon"><i class="bi bi-paperclip" aria-hidden="true"></i></div>
                  <div class="fb-attach-meta">
                    <div class="fb-attach-name">${safeNome}</div>
                    ${meta ? `<div class=\"fb-attach-sub\">${safeMeta}</div>` : ''}
                  </div>
                </div>
                <div class="fb-attach-actions">
                  <button type="button" class="btn btn-sm btn-outline-secondary" disabled>Indisponível</button>
                </div>
              </div>
            `;
          }

          const safeUrl = escapeHtml(url);
          const icon = isImg ? 'bi-image' : 'bi-paperclip';
          const thumb = isImg ? `<img class=\"fb-attach-thumb\" src=\"${safeUrl}\" alt=\"${safeNome}\" loading=\"lazy\">` : '';

          return `
            <div class="fb-attach">
              <div class="fb-attach-main">
                <div class="fb-attach-icon"><i class="bi ${icon}" aria-hidden="true"></i></div>
                ${thumb}
                <div class="fb-attach-meta">
                  <div class="fb-attach-name" title="${safeNome}">${safeNome}</div>
                  ${meta ? `<div class=\"fb-attach-sub\">${safeMeta}</div>` : ''}
                </div>
              </div>
              <div class="fb-attach-actions">
                <a class="btn btn-sm btn-outline-secondary" href="${safeUrl}" target="_blank" rel="noopener">Abrir</a>
                <a class="btn btn-sm btn-primary" href="${safeUrl}" download>Baixar</a>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  async function saveStatus(){
    if (!selectedId) return;
    const newStatus = normalizeStatus(els.editStatus?.value || '');
    if (!newStatus){
      showAlert('Selecione um status.', 'warning');
      return;
    }

    const body = JSON.stringify({ status: newStatus });
    const optionsPatch = {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    };
    let out = await fetchJsonWithFallback(API.status(selectedId), optionsPatch);

    // fallback: alguns backends usam POST
    if (!out.ok && (out.status === 404 || out.status === 405)){
      out = await fetchJsonWithFallback(API.status(selectedId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    }

    if (!out.ok){
      const msg = out.status === 403
        ? 'Acesso negado para alterar status.'
        : 'Falha ao salvar status.';
      showAlert(msg, out.status === 403 ? 'warning' : 'danger');
      return;
    }

    showAlert('Status salvo com sucesso.', 'success');
    await loadDetail(selectedId);
    await loadList();
  }

  async function saveResposta(){
    if (!selectedId) return;
    const resposta = String(els.resposta?.value || '').trim();

    const body = JSON.stringify({ resposta });
    let out = await fetchJsonWithFallback(API.resposta(selectedId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!out.ok && (out.status === 404 || out.status === 405)){
      out = await fetchJsonWithFallback(API.resposta(selectedId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    }

    if (!out.ok){
      const msg = out.status === 403
        ? 'Acesso negado para salvar resposta.'
        : 'Falha ao salvar resposta.';
      showAlert(msg, out.status === 403 ? 'warning' : 'danger');
      return;
    }

    showAlert('Resposta salva com sucesso.', 'success');
    await loadDetail(selectedId);
    await loadList();
  }

  // ===== Events =====
  els.filters?.addEventListener('submit', (e) => {
    e.preventDefault();
    loadList();
  });

  // Botão Atualizar é submit, mas mantém fallback para click direto
  els.btnRefresh?.addEventListener('click', (e) => {
    // evita duplo submit em alguns browsers
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    loadList();
  });
  els.btnDelete?.addEventListener('click', () => deleteSelected());
  els.btnClear?.addEventListener('click', () => {
    clearSelection();
    clearCheckedSelection();
  });

  els.selectAll?.addEventListener('change', () => {
    const checks = visibleRowCheckboxes();
    const want = !!els.selectAll.checked;
    checks.forEach((c) => {
      const id = String(c.getAttribute('data-id') || '');
      if (!id) return;
      if (want) selectedIds.add(id);
      else selectedIds.delete(id);
      c.checked = want;
    });
    syncSelectionUI();
  });

  els.pageSize?.addEventListener('change', () => {
    page = 1;
    renderPage();
  });
  els.btnPrev?.addEventListener('click', () => {
    page = Math.max(1, page - 1);
    renderPage();
  });
  els.btnNext?.addEventListener('click', () => {
    page = page + 1;
    renderPage();
  });

  els.tbody?.addEventListener('click', (e) => {
    const target = e.target;
    // se clicou no checkbox, não abre detalhes
    if (target && target.classList && target.classList.contains('fb-row-check')) return;

    const tr = target && target.closest ? target.closest('.fb-row') : null;
    if (!tr) return;
    const id = tr.getAttribute('data-id');
    if (!id) return;

    document.querySelectorAll('.fb-row.active').forEach(x => x.classList.remove('active'));
    tr.classList.add('active');

    loadDetail(id);
  });

  els.tbody?.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t && t.classList && t.classList.contains('fb-row-check'))) return;
    const id = String(t.getAttribute('data-id') || '');
    if (!id) return;
    if (t.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    syncSelectionUI();
  });

  // ===== Filtro por coluna (estilo Excel) =====
  function initColumnFilters(){
    // abrir
    document.querySelectorAll('.fb-colfilter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const col = btn.getAttribute('data-col');
        openColFilter(col, btn);
      });
    });

    // fechar
    els.colFilterClose?.addEventListener('click', () => closeColFilter());
    els.colFilterCancel?.addEventListener('click', () => closeColFilter());

    // clicar fora
    document.addEventListener('pointerdown', (e) => {
      if (!els.colFilter || els.colFilter.hidden) return;
      const t = e.target;
      if (t && (els.colFilter.contains(t) || (activeColButton && activeColButton.contains && activeColButton.contains(t)))) return;
      closeColFilter();
    }, { capture: true });

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.colFilter && !els.colFilter.hidden) closeColFilter();
    });

    // busca
    els.colFilterSearch?.addEventListener('input', () => applyColFilterSearch());

    // (Selecionar tudo)
    els.colFilterAll?.addEventListener('change', () => {
      if (!els.colFilterList) return;
      const checks = els.colFilterList.querySelectorAll('.fb-colfilter-opt');
      checks.forEach((c) => { c.checked = !!els.colFilterAll.checked; });
    });

    // check individual
    els.colFilterList?.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('fb-colfilter-opt')){
        updateColFilterAllCheckbox();
      }
    });

    // aplicar
    els.colFilterApply?.addEventListener('click', () => {
      if (!activeCol) return;
      const checked = getColFilterCheckedValues();

      // se marcou tudo, remove filtro
      const base = applyColumnFilters(rawList, activeCol);
      const allValues = uniqueValuesForColumn(base, activeCol);
      const isAll = checked.length === allValues.length;

      columnFilters[activeCol] = isAll ? null : new Set(checked);
      closeColFilter();
      applyAndRender();
    });

    // limpar filtro da coluna
    els.colFilterClear?.addEventListener('click', () => {
      if (!activeCol) return;
      columnFilters[activeCol] = null;
      closeColFilter();
      applyAndRender();
    });
  }

  els.btnSaveStatus?.addEventListener('click', () => saveStatus());
  els.btnSaveResposta?.addEventListener('click', () => saveResposta());

  // Boot
  clearSelection();
  clearCheckedSelection();
  initStatusDropdown();
  initWidgetsPanel();
  initColumnFilters();
  updateFilterIcons();
  loadList();
});
