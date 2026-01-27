/* eslint-disable max-lines-per-function */
(function(){
  const modalEl = document.getElementById('modalEditACRegrasUso');
  if(!modalEl || typeof bootstrap === 'undefined') return;

  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });

  const basePathAttr = document.body ? document.body.getAttribute('data-base-path') : '';
  const basePath = (typeof basePathAttr === 'string' && basePathAttr ? basePathAttr : '/condominios').replace(/\/$/, '');
  const ICON_EDIT = `${basePath}/images/editar.png`;
  const ICON_DELETE = `${basePath}/images/excluir.png`;
  const ICON_UP = `${basePath}/images/acima.png`;
  const ICON_DOWN = `${basePath}/images/abaixo.png`;

  const areaLabelEl = modalEl.querySelector('#acUsoContextArea');
  const unidadeLabelEl = modalEl.querySelector('#acUsoContextUnidade');
  const textarea = modalEl.querySelector('#acUsoTextarea');
  const counterEl = modalEl.querySelector('#acUsoCharCounter');
  const feedbackEl = modalEl.querySelector('#acUsoFeedback');
  const insertBtn = modalEl.querySelector('#acUsoInsertBtn');
  const clearBtn = modalEl.querySelector('#acUsoClearBtn');
  const rulesBody = modalEl.querySelector('#acUsoRulesBody');
  const emptyEl = modalEl.querySelector('#acUsoEmpty');
  const badgeTotal = modalEl.querySelector('#acUsoTotalBadge');
  const saveBtn = modalEl.querySelector('#acUsoSaveBtn');
  const cancelBtn = modalEl.querySelector('#acUsoCancelBtn');
  const editorPre = modalEl.querySelector('.wdg-uso-editor-pre');
  const editorTitle = modalEl.querySelector('.wdg-uso-editor-title');
  const dirtyHintEl = modalEl.querySelector('#acUsoDirtyHint');
  const pageSizeSelect = modalEl.querySelector('#acUsoPageSize');
  const pagerEl = modalEl.querySelector('#acUsoPager');

  const SAVE_DEFAULT_LABEL = saveBtn ? saveBtn.textContent.trim() : 'Salvar regras';
  const SAVE_DIRTY_LABEL = 'Salvar alterações';

  const state = {
    area: null,
    areaId: '',
    rules: [],
    editingIndex: -1,
    editingRuleId: null,
    resolver: null,
    saved: false,
    originalSerialized: '',
    dirty: false,
    page: 1,
    pageSize: pageSizeSelect ? parseInt(pageSizeSelect.value, 10) || 10 : 10
  };

  function cloneValue(value){
    try{
      if(typeof structuredClone === 'function') return structuredClone(value);
    }catch(_err){ }
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(_err){ return null; }
  }

  function sanitizeRuleText(input){
    if(input == null) return '';
    let text = String(input).replace(/\s+/g, ' ').trim();
    if(!text || text === '[object Object]') return '';
    if(text.length > 8000) text = text.slice(0, 8000);
    return text;
  }

  function generateId(){
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function parseInitialRules(raw){
    const collected = [];
    const collect = value => {
      if(value == null) return;
      if(Array.isArray(value)){
        value.forEach(collect);
        return;
      }
      if(typeof value === 'object'){
        if(Object.prototype.hasOwnProperty.call(value, 'rules')) collect(value.rules);
        if(Object.prototype.hasOwnProperty.call(value, 'regras')) collect(value.regras);
        if(Object.prototype.hasOwnProperty.call(value, 'text')) collect(value.text);
        if(Object.prototype.hasOwnProperty.call(value, 'rule')) collect(value.rule);
        const keys = Object.keys(value).filter(k => !['rules','regras','text','rule'].includes(k));
        keys.forEach(key => collect(value[key]));
        return;
      }
      if(typeof value === 'string'){
        value.split(/\r?\n+/).forEach(part => {
          const normalized = sanitizeRuleText(part);
          if(normalized) collected.push(normalized);
        });
        return;
      }
      const normalized = sanitizeRuleText(value);
      if(normalized) collected.push(normalized);
    };
    collect(raw);
    if(!collected.length) return [];
    const seen = new Set();
    const unique = [];
    for(const item of collected){
      if(seen.has(item)) continue;
      seen.add(item);
      unique.push(item);
      if(unique.length >= 100) break;
    }
    return unique;
  }

  function serializeRules(list){
    if(!Array.isArray(list) || !list.length) return '';
    return list.map(item => sanitizeRuleText(item.text || item)).filter(Boolean).join('\n');
  }

  function updateCounter(){
    if(!counterEl) return;
    const length = textarea.value.length;
    counterEl.textContent = `${length}/8000`;
  }

  function setFeedback(message, status, timeoutMs){
    if(!feedbackEl) return;
    if(!message){
      feedbackEl.removeAttribute('data-status');
      feedbackEl.textContent = '';
      return;
    }
    feedbackEl.dataset.status = status || 'info';
    feedbackEl.textContent = String(message);
    if(timeoutMs && timeoutMs > 0){
      setTimeout(() => {
        if(feedbackEl.dataset.status === status){
          feedbackEl.removeAttribute('data-status');
          feedbackEl.textContent = '';
        }
      }, timeoutMs);
    }
  }

  function highlightEditingRow(){
    const rows = rulesBody.querySelectorAll('tr');
    rows.forEach(row => {
      if(row.dataset.ruleId === state.editingRuleId) row.classList.add('wdg-uso-row-editing');
      else row.classList.remove('wdg-uso-row-editing');
    });
  }

  function resetEditor(options){
    state.editingIndex = -1;
    state.editingRuleId = null;
    if(editorPre) editorPre.textContent = 'Nova regra';
    if(editorTitle) editorTitle.textContent = 'Cadastrar regra de uso';
    insertBtn.textContent = 'Inserir';
    textarea.value = '';
    updateCounter();
    highlightEditingRow();
    if(!options || !options.skipFocus) textarea.focus();
  }

  function clearForm(){
    resetEditor();
    setFeedback('', null);
  }

  function createIconButton(options){
    const {
      role,
      index,
      ruleId,
      title,
      icon,
      alt,
      disabled,
      fallback
    } = options;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wdg-uso-action-btn wdg-icon-btn';
    btn.dataset.role = role;
    btn.dataset.index = String(index);
    if(ruleId) btn.dataset.ruleId = ruleId;
    if(title) btn.title = title;
    if(alt) btn.setAttribute('aria-label', alt);
    if(disabled) btn.disabled = true;

    const img = document.createElement('img');
    img.src = icon;
    img.alt = alt || '';
    img.loading = 'lazy';
    if(fallback){
      img.onerror = () => {
        if(!img.parentElement) return;
        const span = document.createElement('span');
        span.textContent = fallback;
        span.className = 'wdg-uso-icon-fallback';
        img.replaceWith(span);
      };
    }
    btn.appendChild(img);
    return btn;
  }

  function renderList(){
    rulesBody.innerHTML = '';
    const total = state.rules.length;
    if(badgeTotal) badgeTotal.textContent = String(total);
    const pageSize = Math.max(1, state.pageSize || 10);
    const totalPages = Math.max(1, Math.ceil(Math.max(1, total) / pageSize));
    if(state.page > totalPages) state.page = totalPages;
    if(state.page < 1) state.page = 1;
    if(!total){
      state.page = 1;
      emptyEl.classList.add('is-visible');
      if(pagerEl) pagerEl.innerHTML = '';
      return;
    }
    emptyEl.classList.remove('is-visible');
    const start = (state.page - 1) * pageSize;
    const slice = state.rules.slice(start, start + pageSize);
    const frag = document.createDocumentFragment();
    slice.forEach((rule, offset) => {
      const index = start + offset;
      const tr = document.createElement('tr');
      tr.dataset.ruleIndex = String(index);
      tr.dataset.ruleId = rule.id;
      if(rule.id === state.editingRuleId) tr.classList.add('wdg-uso-row-editing');

      const tdOrder = document.createElement('td');
      tdOrder.className = 'wdg-uso-table-order';
      const orderWrap = document.createElement('div');
      orderWrap.className = 'wdg-uso-order';
      const upBtn = createIconButton({
        role: 'up',
        index,
        ruleId: rule.id,
        title: 'Mover regra para cima',
        icon: ICON_UP,
        alt: 'Mover para cima',
        disabled: index === 0,
        fallback: '↑'
      });
      const downBtn = createIconButton({
        role: 'down',
        index,
        ruleId: rule.id,
        title: 'Mover regra para baixo',
        icon: ICON_DOWN,
        alt: 'Mover para baixo',
        disabled: index === total - 1,
        fallback: '↓'
      });
      orderWrap.appendChild(upBtn);
      orderWrap.appendChild(downBtn);
      tdOrder.appendChild(orderWrap);

      const tdRule = document.createElement('td');
      tdRule.className = 'wdg-uso-rule-cell';
      const wrap = document.createElement('div');
      wrap.className = 'wdg-uso-rule-wrap';
      const textSpan = document.createElement('span');
      textSpan.className = 'wdg-uso-rule-text';
      textSpan.textContent = rule.text;
      textSpan.title = rule.text;
      wrap.appendChild(textSpan);
      tdRule.appendChild(wrap);

      const tdActions = document.createElement('td');
      tdActions.className = 'wdg-uso-table-actions';
      const actions = document.createElement('div');
      actions.className = 'wdg-uso-actions';
      const editBtn = createIconButton({
        role: 'edit',
        index,
        ruleId: rule.id,
        title: 'Editar regra',
        icon: ICON_EDIT,
        alt: 'Editar',
        fallback: '✎'
      });
      const deleteBtn = createIconButton({
        role: 'delete',
        index,
        ruleId: rule.id,
        title: 'Excluir regra',
        icon: ICON_DELETE,
        alt: 'Excluir',
        fallback: '✖'
      });
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      tdActions.appendChild(actions);

      tr.appendChild(tdOrder);
      tr.appendChild(tdRule);
      tr.appendChild(tdActions);
      frag.appendChild(tr);
    });
    rulesBody.appendChild(frag);
    renderPager(total, totalPages);
  }

  function syncEditingMarker(){
    if(!state.editingRuleId){
      state.editingIndex = -1;
      return;
    }
    const idx = state.rules.findIndex(rule => rule.id === state.editingRuleId);
    state.editingIndex = idx;
    if(idx === -1){
      state.editingRuleId = null;
    }
  }

  function startEdit(index){
    const idx = Number(index);
    if(Number.isNaN(idx) || idx < 0 || idx >= state.rules.length) return;
    const rule = state.rules[idx];
    state.editingIndex = idx;
    state.editingRuleId = rule.id;
    ensureRuleVisible(idx);
    renderList();
    textarea.value = rule.text;
    updateCounter();
    if(editorPre) editorPre.textContent = 'Editando regra';
    if(editorTitle) editorTitle.textContent = 'Atualize o conteúdo da regra';
    insertBtn.textContent = 'Atualizar';
    textarea.focus();
    highlightEditingRow();
    flashRuleRow(idx);
    setFeedback('Alterando uma regra já cadastrada. Confirme para salvar.', 'info', 4200);
  }

  function removeRule(index){
    const idx = Number(index);
    if(Number.isNaN(idx) || idx < 0 || idx >= state.rules.length) return;
    state.rules.splice(idx, 1);
    syncEditingMarker();
    adjustPageAfterChange();
    renderList();
    updateDirtyIndicators();
    highlightEditingRow();
    setFeedback('Regra removida da lista.', 'info', 3200);
  }

  function moveRule(index, direction){
    const idx = Number(index);
    if(Number.isNaN(idx)) return;
    const target = idx + direction;
    if(target < 0 || target >= state.rules.length) return;
    const [entry] = state.rules.splice(idx, 1);
    state.rules.splice(target, 0, entry);
    syncEditingMarker();
    ensureRuleVisible(target);
    renderList();
    updateDirtyIndicators();
    highlightEditingRow();
    flashRuleRow(target);
    setFeedback('Ordem das regras atualizada.', 'info', 2600);
  }

  function applyRule(){
    const text = sanitizeRuleText(textarea.value);
    if(!text){
      setFeedback('Informe a descrição da regra de uso.', 'warning', 3600);
      textarea.focus();
      return;
    }
    let targetIndex = -1;
    if(state.editingIndex >= 0 && state.editingIndex < state.rules.length){
      state.rules[state.editingIndex].text = text;
      targetIndex = state.editingIndex;
      setFeedback('Regra atualizada.', 'success', 2800);
    } else {
      state.rules.push({ id: generateId(), text });
      targetIndex = state.rules.length - 1;
      setFeedback('Regra adicionada à lista.', 'success', 2800);
    }
    ensureRuleVisible(targetIndex);
    resetEditor();
    renderList();
    updateDirtyIndicators();
    textarea.focus();
    if(targetIndex >= 0) flashRuleRow(targetIndex);
  }

  function ensureRuleVisible(index){
    if(index == null || index < 0) return;
    const size = Math.max(1, state.pageSize || 10);
    const page = Math.floor(index / size) + 1;
    if(state.page !== page){
      state.page = page;
    }
  }

  function adjustPageAfterChange(){
    const size = Math.max(1, state.pageSize || 10);
    const total = state.rules.length;
    const totalPages = Math.max(1, Math.ceil(Math.max(1, total) / size));
    if(state.page > totalPages) state.page = totalPages;
    if(state.page < 1) state.page = 1;
  }

  function flashRuleRow(index){
    const raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : (fn => setTimeout(fn, 0));
    raf(() => {
      const row = rulesBody.querySelector(`tr[data-rule-index="${index}"]`);
      if(!row) return;
      row.classList.add('wdg-uso-row-flash');
      setTimeout(() => row.classList.remove('wdg-uso-row-flash'), 900);
    });
  }

  function buildResult(saved){
    const areaClone = cloneValue(state.area) || state.area;
    const rulesTexts = state.rules.map(rule => rule.text);
    const serialized = serializeRules(state.rules);
    if(areaClone) areaClone.regras_uso = serialized;
    return {
      saved: !!saved,
      area: areaClone,
      areaId: state.areaId,
      rules: rulesTexts,
      serialized,
      dirty: state.dirty,
      count: rulesTexts.length
    };
  }

  function updateDirtyIndicators(){
    const serialized = serializeRules(state.rules);
    state.dirty = serialized !== state.originalSerialized;
    if(saveBtn){
      saveBtn.disabled = !state.dirty;
      saveBtn.textContent = state.dirty ? SAVE_DIRTY_LABEL : SAVE_DEFAULT_LABEL;
    }
    if(dirtyHintEl){
      dirtyHintEl.hidden = !state.dirty;
    }
  }

  function openModal(options){
    const opts = options || {};
    state.area = opts.area ? cloneValue(opts.area) : null;
    state.areaId = opts.areaId ? String(opts.areaId) : (state.area && (state.area._id || state.area.id) ? String(state.area._id || state.area.id) : '');
    const rawRules = opts.regras || opts.rules || opts.regrasUso || (opts.area ? opts.area.regras_uso : '');
    const parsed = parseInitialRules(rawRules);
    state.rules = parsed.map(text => ({ id: generateId(), text }));
    state.editingIndex = -1;
    state.editingRuleId = null;
    state.saved = false;
    state.originalSerialized = serializeRules(state.rules);
    state.dirty = false;
    const parsedPageSize = pageSizeSelect ? parseInt(pageSizeSelect.value, 10) : NaN;
    state.pageSize = (!Number.isNaN(parsedPageSize) && parsedPageSize > 0) ? parsedPageSize : 10;
    state.page = 1;

    renderList();
    updateDirtyIndicators();
    setFeedback('', null);
    resetEditor({ skipFocus: true });
    updateCounter();

    if(areaLabelEl){
      const areaNome = (opts.area && (opts.area.nome || opts.area.label)) || (state.area && (state.area.nome || state.area.label)) || 'Área comum';
      areaLabelEl.textContent = String(areaNome);
    }
    if(unidadeLabelEl){
      const unidadeNome = (opts.area && (opts.area._unidadeLabel || (opts.area.unidade && (opts.area.unidade.nome || opts.area.unidade_label)))) || (state.area && (state.area._unidadeLabel || (state.area.unidade && (state.area.unidade.nome || state.area.unidade_label))));
      unidadeLabelEl.textContent = unidadeNome ? String(unidadeNome) : 'Unidade não informada';
    }

    return new Promise(resolve => {
      state.resolver = resolve;
      bsModal.show();
    });
  }

  function closeModal(){
    bsModal.hide();
  }

  textarea.addEventListener('input', () => {
    if(textarea.value.length > 8000){
      textarea.value = textarea.value.slice(0, 8000);
    }
    updateCounter();
  });

  textarea.addEventListener('keydown', ev => {
    if(ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)){
      ev.preventDefault();
      applyRule();
    }
  });

  insertBtn.addEventListener('click', applyRule);
  clearBtn.addEventListener('click', clearForm);

  if(pageSizeSelect){
    pageSizeSelect.addEventListener('change', () => {
      const value = parseInt(pageSizeSelect.value, 10);
      state.pageSize = (!Number.isNaN(value) && value > 0) ? value : 10;
      state.page = 1;
      renderList();
    });
  }

  rulesBody.addEventListener('click', ev => {
    const btn = ev.target.closest('.wdg-uso-action-btn');
    if(!btn) return;
    const role = btn.dataset.role;
    const index = btn.dataset.index;
    if(role === 'edit'){
      startEdit(index);
      return;
    }
    if(role === 'delete'){
      if(window.confirm('Remover esta regra da lista?')) removeRule(index);
      return;
    }
    if(role === 'up'){
      moveRule(index, -1);
      return;
    }
    if(role === 'down'){
      moveRule(index, 1);
    }
  });

  saveBtn.addEventListener('click', () => {
    if(!state.dirty){
      setFeedback('Nenhuma alteração para salvar.', 'info', 2800);
      return;
    }
    state.saved = true;
    const result = buildResult(true);
    state.originalSerialized = result.serialized;
    state.dirty = false;
    updateDirtyIndicators();
    if(state.resolver){
      state.resolver(result);
      state.resolver = null;
    }
    closeModal();
  });

  cancelBtn.addEventListener('click', () => {
    state.saved = false;
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    textarea.focus();
  });

  modalEl.addEventListener('hide.bs.modal', ev => {
    if(state.saved) return;
    if(!state.dirty) return;
    const shouldClose = window.confirm('Existem alterações não salvas. Deseja realmente fechar o modal?');
    if(!shouldClose) ev.preventDefault();
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    if(state.resolver){
      const pending = buildResult(false);
      state.resolver(pending);
      state.resolver = null;
    }
    state.area = null;
    state.areaId = '';
    state.rules = [];
    state.originalSerialized = '';
    state.dirty = false;
    state.saved = false;
    state.page = 1;
    const teardownPageSize = pageSizeSelect ? parseInt(pageSizeSelect.value, 10) : NaN;
    state.pageSize = (!Number.isNaN(teardownPageSize) && teardownPageSize > 0) ? teardownPageSize : 10;
    resetEditor({ skipFocus: true });
    rulesBody.innerHTML = '';
    if(badgeTotal) badgeTotal.textContent = '0';
    emptyEl.classList.add('is-visible');
    setFeedback('', null);
    updateCounter();
    updateDirtyIndicators();
    if(pagerEl) pagerEl.innerHTML = '';
  });

  function renderPager(total, totalPages){
    if(!pagerEl) return;
    pagerEl.innerHTML = '';
    if(totalPages <= 1){
      const info = document.createElement('div');
      info.className = 'wdg-pager-info';
      info.textContent = `Total: ${total} regra(s)`;
      pagerEl.appendChild(info);
      return;
    }
    const fragment = document.createDocumentFragment();
    fragment.appendChild(createPagerBtn('<<', 1, state.page === 1));
    fragment.appendChild(createPagerBtn('<', Math.max(1, state.page - 1), state.page === 1));

    const windowSize = 5;
    let start = Math.max(1, state.page - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    if(end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

    for(let page = start; page <= end; page++){
      fragment.appendChild(createPagerBtn(String(page), page, false, page === state.page));
    }

    fragment.appendChild(createPagerBtn('>', Math.min(totalPages, state.page + 1), state.page === totalPages));
    fragment.appendChild(createPagerBtn('>>', totalPages, state.page === totalPages));

    const info = document.createElement('div');
    info.className = 'wdg-pager-info';
    info.textContent = `Total: ${total} regra(s)`;
    fragment.appendChild(info);

    pagerEl.appendChild(fragment);
  }

  function createPagerBtn(label, page, disabled, active){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wdg-pager-btn';
    btn.textContent = label;
    if(disabled) btn.disabled = true;
    if(active) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if(btn.disabled) return;
      state.page = page;
      renderList();
    });
    return btn;
  }

  window.WDG_AC_REGRAS = {
    abrir: openModal,
    fechar: closeModal,
    parse: parseInitialRules,
    serialize: serializeRules,
    isDirty: () => state.dirty
  };
})();
