(function(){
  const modalEl = document.getElementById('modalEditarSlotOrganograma');
  if (!modalEl) return;

  const previewHost = document.getElementById('slotEditorPreviewHost');
  const bgHost = document.getElementById('slotBgPalette');
  const borderHost = document.getElementById('slotBorderPalette');
  const textHost = document.getElementById('slotTextPalette');
  const pillBgHost = document.getElementById('slotPillBgPalette');
  const pillBorderHost = document.getElementById('slotPillBorderPalette');
  const btnApply = document.getElementById('btnSlotEditorApply');
  const btnApplyAll = document.getElementById('btnSlotEditorApplyAll');

  const fontFamilySel = document.getElementById('slotFontFamily');
  const fontSizeSel = document.getElementById('slotFontSizeSelect');

  const cardWidthSel = document.getElementById('slotCardWidth');
  const contentScaleRange = document.getElementById('slotContentScale');
  const contentScaleLabel = document.getElementById('slotContentScaleLabel');

  const bgAlphaRange = document.getElementById('slotBgAlpha');
  const bgAlphaLabel = document.getElementById('slotBgAlphaLabel');
  const btnBgClear = document.getElementById('btnSlotBgClear');

  const bgIndicator = document.getElementById('slotBgColorIndicator');
  const borderIndicator = document.getElementById('slotBorderColorIndicator');
  const textIndicator = document.getElementById('slotTextColorIndicator');
  const pillBgIndicator = document.getElementById('slotPillBgColorIndicator');
  const pillBorderIndicator = document.getElementById('slotPillBorderColorIndicator');

  const borderWidthSel = document.getElementById('slotBorderWidth');
  const borderStyleSel = document.getElementById('slotBorderStyle');
  const borderStyleHint = document.getElementById('slotBorderStyleHint');
  const borderAlphaRange = document.getElementById('slotBorderAlpha');
  const borderAlphaLabel = document.getElementById('slotBorderAlphaLabel');
  const btnBorderClear = document.getElementById('btnSlotBorderClear');

  const btnTextClear = document.getElementById('btnSlotTextClear');
  const btnPillBgClear = document.getElementById('btnSlotPillBgClear');
  const btnPillBorderClear = document.getElementById('btnSlotPillBorderClear');

  const btnBold = document.getElementById('btnSlotBold');
  const btnItalic = document.getElementById('btnSlotItalic');
  const btnUnderline = document.getElementById('btnSlotUnderline');
  const btnStrike = document.getElementById('btnSlotStrike');

  const COLORS_36 = [
    '#FFFFFF','#F8FAFC','#E2E8F0','#CBD5E1','#94A3B8','#64748B',
    '#0F172A','#1E293B','#334155','#475569','#6B7280','#9CA3AF',
    '#0EA5E9','#2563EB','#1D4ED8','#7C3AED','#A855F7','#EC4899',
    '#F43F5E','#EF4444','#F97316','#F59E0B','#EAB308','#84CC16',
    '#22C55E','#10B981','#14B8A6','#06B6D4','#38BDF8','#60A5FA',
    '#818CF8','#C084FC','#FCA5A5','#FDBA74','#FDE68A','#BBF7D0'
  ];

  const cssEscape = (value) => {
    const v = String(value || '');
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
    return v.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  let __fallbackBackdrop = null;
  let __fallbackKeyHandler = null;
  let __fallbackPrevOverflow = '';

  const fallbackIsOpen = () => {
    try { return modalEl.classList.contains('show') && String(modalEl.style.display || '').toLowerCase() === 'block'; } catch { return false; }
  };

  const fallbackShow = () => {
    if (fallbackIsOpen()) return;
    try {
      __fallbackPrevOverflow = String(document.body && document.body.style ? document.body.style.overflow : '') || '';
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
    } catch {}

    try {
      modalEl.style.display = 'block';
      modalEl.removeAttribute('aria-hidden');
      modalEl.setAttribute('aria-modal', 'true');
      modalEl.setAttribute('role', 'dialog');
      modalEl.scrollTop = 0;
      modalEl.classList.add('show');
    } catch {}

    try {
      __fallbackBackdrop = document.createElement('div');
      __fallbackBackdrop.className = 'modal-backdrop fade show';
      document.body.appendChild(__fallbackBackdrop);
    } catch {
      __fallbackBackdrop = null;
    }

    try {
      __fallbackKeyHandler = (ev) => {
        if (ev && ev.key === 'Escape') {
          try { ev.preventDefault(); } catch {}
          fallbackHide();
        }
      };
      document.addEventListener('keydown', __fallbackKeyHandler);
    } catch {
      __fallbackKeyHandler = null;
    }

    try { modalEl.dispatchEvent(new CustomEvent('shown.bs.modal')); } catch {}
  };

  const fallbackHide = () => {
    if (!fallbackIsOpen()) {
      // Ainda assim dispara o reset se algo chamou hide sem estar aberto.
      try { modalEl.dispatchEvent(new CustomEvent('hidden.bs.modal')); } catch {}
      return;
    }

    try { modalEl.classList.remove('show'); } catch {}
    try { modalEl.style.display = 'none'; } catch {}
    try { modalEl.setAttribute('aria-hidden', 'true'); } catch {}

    try {
      if (__fallbackBackdrop) __fallbackBackdrop.remove();
    } catch {}
    __fallbackBackdrop = null;

    try {
      if (__fallbackKeyHandler) document.removeEventListener('keydown', __fallbackKeyHandler);
    } catch {}
    __fallbackKeyHandler = null;

    try {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = __fallbackPrevOverflow || '';
    } catch {}

    try { modalEl.dispatchEvent(new CustomEvent('hidden.bs.modal')); } catch {}
  };

  const getModalController = () => {
    try {
      if (window.bootstrap && window.bootstrap.Modal) {
        return window.bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
      }
    } catch { /* noop */ }
    return { show: fallbackShow, hide: fallbackHide };
  };

  let currentRoleId = '';
  let workingStyle = {
    shape: 'rect',
    bgColor: '',
    bgAlpha: 100,
    borderWidth: null,
    borderStyle: '',
    borderColor: '',
    borderAlpha: 100,
    cardWidth: null,
    contentScale: 1,
    text: '',
    align: 'center',
    textParts: { name:{}, role:{}, email:{}, pill:{} }
  };
  let previewCard = null;

  let activeTextTarget = '';

  const CLIP_SHAPES = new Set(['triangle','pentagon','hexagon','octagon','star']);
  const UNSUPPORTED_BORDER_STYLES = new Set(['dashed','dotted','double']);
  let borderHintTimer = null;

  const clampInt = (n, min, max) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, Math.round(v)));
  };

  const isHexColor = (c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(c || '').trim());

  const hexToRgba = (hex, alpha01) => {
    const h = String(hex || '').trim();
    if (!isHexColor(h)) return '';
    const a = Number(alpha01);
    const alpha = Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
    let r = 0, g = 0, b = 0;
    if (h.length === 4) {
      r = parseInt(h[1] + h[1], 16);
      g = parseInt(h[2] + h[2], 16);
      b = parseInt(h[3] + h[3], 16);
    } else {
      r = parseInt(h.slice(1, 3), 16);
      g = parseInt(h.slice(3, 5), 16);
      b = parseInt(h.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const computeFill = (color, alphaPct) => {
    const c = String(color || '').trim();
    if (!c) return '';
    if (isHexColor(c)) {
      const a = clampInt(alphaPct, 0, 100) / 100;
      return hexToRgba(c, a);
    }
    return c;
  };

  const getCollapse = (id) => {
    try {
      if (!window.bootstrap || !window.bootstrap.Collapse) return null;
      const el = document.getElementById(id);
      if (!el) return null;
      return window.bootstrap.Collapse.getOrCreateInstance(el, { toggle: false });
    } catch {
      return null;
    }
  };

  const showPanel = (collapseId) => {
    const c = getCollapse(collapseId);
    try { c && c.show(); } catch {}
  };

  const setIndicator = (el, color) => {
    if (!el) return;
    const c = String(color || '').trim();
    if (!c) {
      try { el.style.removeProperty('background'); } catch {}
      return;
    }
    try { el.style.background = c; } catch {}
  };

  const isClipShape = (shape) => CLIP_SHAPES.has(String(shape || '').trim().toLowerCase());

  const setBorderStyleOptionsForShape = (shape) => {
    if (!borderStyleSel) return;
    const clip = isClipShape(shape);
    try {
      Array.from(borderStyleSel.options || []).forEach(opt => {
        const v = String(opt.value || '').trim();
        if (UNSUPPORTED_BORDER_STYLES.has(v)) opt.disabled = clip;
      });
    } catch {}
  };

  const showBorderHint = (msg) => {
    if (!borderStyleHint) return;
    try {
      borderStyleHint.textContent = String(msg || '');
      borderStyleHint.classList.remove('d-none');
    } catch {}
    if (borderHintTimer) {
      try { clearTimeout(borderHintTimer); } catch {}
      borderHintTimer = null;
    }
    borderHintTimer = setTimeout(() => {
      try { borderStyleHint.classList.add('d-none'); } catch {}
      borderHintTimer = null;
    }, 4500);
  };

  const enforceBorderStyleCompatibility = () => {
    const shape = String(workingStyle.shape || 'rect').toLowerCase();
    setBorderStyleOptionsForShape(shape);

    const raw = String(workingStyle.borderStyle || '').trim();
    if (isClipShape(shape) && UNSUPPORTED_BORDER_STYLES.has(raw)) {
      workingStyle.borderStyle = 'solid';
      if (borderStyleSel) {
        try { borderStyleSel.value = 'solid'; } catch {}
      }
      showBorderHint('Nesta forma, tracejada/pontilhada/dupla não é suportada. Aplicamos Sólida automaticamente.');
    }
  };

  function normalizeStyle(style){
    const s = style && typeof style === 'object' ? style : {};
    const shapeAllowed = new Set(['rect','circle','triangle','pentagon','hexagon','octagon','star']);
    const rawShape = String(s.shape || 'rect').toLowerCase();
    const shape = shapeAllowed.has(rawShape) ? rawShape : 'rect';

    // Back-compat: se ainda vier "bg", mapeia para bgColor
    const legacyBg = String(s.bg || '').trim();
    const bgColor = String((s.bgColor != null ? s.bgColor : legacyBg) || '').trim();
    const bgAlpha = (s.bgAlpha == null || s.bgAlpha === '') ? 100 : clampInt(s.bgAlpha, 0, 100);

    const borderWidth = (s.borderWidth == null || s.borderWidth === '') ? null : clampInt(s.borderWidth, 0, 24);
    let borderStyle = String(s.borderStyle || '').trim();
    if (CLIP_SHAPES.has(shape) && UNSUPPORTED_BORDER_STYLES.has(borderStyle)) borderStyle = 'solid';
    const borderColor = String(s.borderColor || '').trim();
    const borderAlpha = (s.borderAlpha == null || s.borderAlpha === '') ? 100 : clampInt(s.borderAlpha, 0, 100);

    const cardWidth = (s.cardWidth == null || s.cardWidth === '') ? null : clampInt(s.cardWidth, 200, 520);
    const contentScaleRaw = (s.contentScale == null || s.contentScale === '') ? 1 : Number(s.contentScale);
    const contentScale = Number.isFinite(contentScaleRaw) ? Math.max(0.6, Math.min(1.1, contentScaleRaw)) : 1;

    return {
      shape,
      bgColor,
      bgAlpha,
      borderWidth,
      borderStyle,
      borderColor,
      borderAlpha,
      cardWidth,
      contentScale,
      text: String(s.text || '').trim(),
      align: (String(s.align || 'center').toLowerCase() === 'left' || String(s.align || 'center').toLowerCase() === 'right')
        ? String(s.align).toLowerCase()
        : 'center',
      textParts: (() => {
        const parts = (s.textParts && typeof s.textParts === 'object') ? s.textParts : {};
        const clean = (p) => {
          const o = (p && typeof p === 'object') ? p : {};
          let size = null;
          if (o.size !== '' && o.size != null) {
            const n = Number(o.size);
            if (Number.isFinite(n) && n > 0) size = n;
          }
          const alignRaw = String(o.align || '').trim().toLowerCase();
          const partAlign = (alignRaw === 'left' || alignRaw === 'center' || alignRaw === 'right') ? alignRaw : '';
          return {
            color: String(o.color || '').trim(),
            bgColor: String(o.bgColor || '').trim(),
            borderColor: String(o.borderColor || '').trim(),
            size,
            weight: String(o.weight || '').trim(),
            italic: !!o.italic,
            underline: !!o.underline,
            strike: !!o.strike,
            font: String(o.font || '').trim(),
            align: partAlign,
          };
        };
        return {
          name: clean(parts.name),
          role: clean(parts.role),
          email: clean(parts.email),
          pill: clean(parts.pill),
        };
      })()
    };
  }

  function decorationValue(part){
    const u = !!(part && part.underline);
    const s = !!(part && part.strike);
    if (u && s) return 'underline line-through';
    if (u) return 'underline';
    if (s) return 'line-through';
    return 'none';
  }

  function setCssVar(el, name, value){
    try {
      const v = (value == null) ? '' : String(value).trim();
      if (v) el.style.setProperty(name, v);
      else el.style.removeProperty(name);
    } catch {}
  }

  function findSourceCard(roleId){
    const rid = String(roleId || '').trim();
    if (!rid) return null;

    // Prefer o slot da pré-visualização
    const inPreview = document.querySelector(`#orgPreview li[data-role-id="${cssEscape(rid)}"] .wdg-orgcard`);
    if (inPreview) return inPreview;

    // Fallback: organograma principal
    const inMain = document.querySelector(`#orgContainer li[data-role-id="${cssEscape(rid)}"] .wdg-orgcard`);
    return inMain || null;
  }

  function applyStyleToCard(card, style){
    if (!card) return;
    const s = normalizeStyle(style);

    // Forma
    const shapeClasses = ['rect','circle','triangle','pentagon','hexagon','octagon','star'].map(x => `wdg-slot-shape-${x}`);
    try { card.classList.remove(...shapeClasses); } catch {}
    card.classList.add(`wdg-slot-shape-${s.shape}`);

    const fill = computeFill(s.bgColor, s.bgAlpha);
    const hasCustom = !!(fill);
    if (hasCustom) card.setAttribute('data-slot-custom', '1');
    else card.removeAttribute('data-slot-custom');

    // Transparência real: quando alpha < 100, removemos o efeito de "vidro" (backdrop-filter)
    const bgAlphaNum = (s.bgAlpha == null || s.bgAlpha === '') ? 100 : Number(s.bgAlpha);
    const isTranslucent = !!(String(s.bgColor || '').trim()) && Number.isFinite(bgAlphaNum) && bgAlphaNum < 100;
    card.classList.toggle('wdg-slot-bg-translucent', isTranslucent);

    setCssVar(card, '--wdg-slot-bg', fill);
    // Limpa sempre (compat antigo)
    setCssVar(card, '--wdg-slot-text', '');

    // Borda
    const borderFill = computeFill(s.borderColor, s.borderAlpha);
    setCssVar(card, '--wdg-slot-border-width', (s.borderWidth == null) ? '' : `${Number(s.borderWidth)}px`);
    setCssVar(card, '--wdg-slot-border-style', s.borderStyle);
    setCssVar(card, '--wdg-slot-border-color', borderFill);

    // Tamanho da forma (largura) e escala do conteúdo
    // Padronizado: circle usa o mesmo cardWidth dos demais shapes (fallback CSS: 280px)
    setCssVar(card, '--wdg-slot-card-width', (s.cardWidth != null) ? `${Number(s.cardWidth)}px` : '');
    setCssVar(card, '--wdg-slot-content-scale', (s.contentScale === 1) ? '' : String(s.contentScale));

    // Borda premium (formas com clip-path): overlay SVG com stroke real
    const clipShapes = new Set(['triangle','pentagon','hexagon','octagon','star']);
    const shapeKey = String(s.shape || 'rect').trim().toLowerCase();
    const needsSvgBorder = clipShapes.has(shapeKey);

    const ensureSvgBorderLayer = (host) => {
      let existing = null;
      try {
        existing = host.querySelector(':scope > svg.wdg-slot-svg-border');
      } catch {
        existing = Array.from(host.children || []).find(x => x && x.tagName === 'svg' && x.classList && x.classList.contains('wdg-slot-svg-border')) || null;
      }
      if (existing) return existing;

      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'wdg-slot-svg-border');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.display = 'block';
      svg.style.overflow = 'visible';

      const makePoly = (cls, points) => {
        const p = document.createElementNS(NS, 'polygon');
        p.setAttribute('class', `wdg-slot-svg-shape ${cls}`);
        p.setAttribute('points', points);
        return p;
      };

      svg.appendChild(makePoly('wdg-slot-svg-triangle', '50,0 0,100 100,100'));
      svg.appendChild(makePoly('wdg-slot-svg-pentagon', '50,0 100,38 82,100 18,100 0,38'));
      svg.appendChild(makePoly('wdg-slot-svg-hexagon', '25,0 75,0 100,50 75,100 25,100 0,50'));
      svg.appendChild(makePoly('wdg-slot-svg-octagon', '30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30'));
      svg.appendChild(makePoly('wdg-slot-svg-star', '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35'));

      try { host.insertBefore(svg, host.firstChild); } catch { host.appendChild(svg); }
      return svg;
    };

    if (needsSvgBorder) {
      const svg = ensureSvgBorderLayer(card);

      const fallbackStroke = 'rgba(255,255,255,.72)';
      const stroke = String(borderFill || '').trim() || fallbackStroke;
      const bw = (s.borderWidth == null || s.borderWidth === '') ? 1 : Number(s.borderWidth);
      const borderPx = (Number.isFinite(bw) && bw > 0) ? bw : 1;

      // mostra apenas a forma ativa
      const clsFor = {
        triangle: 'wdg-slot-svg-triangle',
        pentagon: 'wdg-slot-svg-pentagon',
        hexagon: 'wdg-slot-svg-hexagon',
        octagon: 'wdg-slot-svg-octagon',
        star: 'wdg-slot-svg-star',
      };
      const activeCls = clsFor[shapeKey] || '';

      const styleKey = String(s.borderStyle || 'solid').trim().toLowerCase();
      const dashFor = (key, w) => {
        if (key === 'dashed') return `${Math.max(2, Math.round(w * 3))} ${Math.max(2, Math.round(w * 2))}`;
        if (key === 'dotted') return `0 ${Math.max(2, Math.round(w * 2.4))}`;
        return '';
      };

      try {
        const shapes = Array.from(svg.querySelectorAll('.wdg-slot-svg-shape'));
        shapes.forEach(el => {
          const isActive = activeCls && el.classList && el.classList.contains(activeCls);
          el.style.display = isActive ? 'block' : 'none';
          if (!isActive) return;
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke', stroke);
          el.setAttribute('stroke-width', `${borderPx}px`);
          el.setAttribute('vector-effect', 'non-scaling-stroke');
          el.setAttribute('stroke-linejoin', 'round');
          el.setAttribute('stroke-linecap', 'round');
          const dash = dashFor(styleKey, borderPx);
          if (dash) el.setAttribute('stroke-dasharray', dash);
          else el.removeAttribute('stroke-dasharray');
        });
      } catch {}

      let minDim = 280;
      try {
        const r = card.getBoundingClientRect();
        const w = Number(r && r.width) || 0;
        const h = Number(r && r.height) || 0;
        if (w > 0 && h > 0) minDim = Math.max(80, Math.min(w, h));
      } catch {}
      // empurra o contorno pra dentro ~ 2x a borda (evita clip)
      const rawScale = 1 - ((borderPx * 2) / minDim);
      const scale = Math.max(0.88, Math.min(0.995, rawScale));
      setCssVar(card, '--wdg-slot-border-svg-scale', String(scale));
    } else {
      try {
        const svg = card.querySelector(':scope > svg.wdg-slot-svg-border');
        svg && svg.remove();
      } catch {}
      setCssVar(card, '--wdg-slot-border-svg-scale', '');
    }

    // Alinhamento
    card.classList.toggle('wdg-slot-align-left', s.align === 'left');
    card.classList.toggle('wdg-slot-align-right', s.align === 'right');
    card.classList.toggle('wdg-slot-align-center', s.align !== 'left' && s.align !== 'right');

    const parts = s.textParts || {};
    const applyPart = (key, prefix) => {
      const p = parts[key] || {};
      setCssVar(card, `--wdg-slot-${prefix}-color`, p.color);
      setCssVar(card, `--wdg-slot-${prefix}-size`, (p.size != null && Number.isFinite(Number(p.size)) && Number(p.size) > 0) ? `${Number(p.size)}px` : '');
      setCssVar(card, `--wdg-slot-${prefix}-weight`, p.weight);
      setCssVar(card, `--wdg-slot-${prefix}-style`, p.italic ? 'italic' : 'normal');
      setCssVar(card, `--wdg-slot-${prefix}-decoration`, decorationValue(p));
      setCssVar(card, `--wdg-slot-${prefix}-font`, p.font);
      setCssVar(card, `--wdg-slot-${prefix}-align`, (p.align === 'left' || p.align === 'center' || p.align === 'right') ? p.align : '');

      if (prefix === 'pill') {
        setCssVar(card, '--wdg-slot-pill-bg', String(p.bgColor || '').trim());
        setCssVar(card, '--wdg-slot-pill-border-color', String(p.borderColor || '').trim());
      }
    };
    applyPart('name', 'name');
    applyPart('role', 'role');
    applyPart('email', 'email');
    applyPart('pill', 'pill');

    // Alinhamento do status (pílula) é via flex no container
    try {
      const pillAlign = String((parts && parts.pill && parts.pill.align) || '').trim().toLowerCase();
      const justify = (pillAlign === 'left') ? 'flex-start'
        : (pillAlign === 'center') ? 'center'
          : (pillAlign === 'right') ? 'flex-end'
            : '';
      setCssVar(card, '--wdg-slot-status-justify', justify);
    } catch {}

    try {
      card.dataset.slotShape = s.shape;
      card.dataset.slotBg = fill;
      card.dataset.slotBgColor = s.bgColor;
      card.dataset.slotBgAlpha = String(s.bgAlpha);
      card.dataset.slotBorderWidth = (s.borderWidth == null) ? '' : String(s.borderWidth);
      card.dataset.slotBorderStyle = s.borderStyle;
      card.dataset.slotBorderColor = s.borderColor;
      card.dataset.slotBorderAlpha = String(s.borderAlpha);
      card.dataset.slotCardWidth = (s.cardWidth == null) ? '' : String(s.cardWidth);
      card.dataset.slotContentScale = String(s.contentScale);
      card.dataset.slotText = s.text;
      card.dataset.slotAlign = s.align;
      card.dataset.slotName = JSON.stringify(parts.name || {});
      card.dataset.slotRole = JSON.stringify(parts.role || {});
      card.dataset.slotEmail = JSON.stringify(parts.email || {});
      card.dataset.slotPill = JSON.stringify(parts.pill || {});
    } catch {}

    // Circle: desativa auto-ajuste por conteúdo (tamanho vem só do cardWidth + CSS fallback)
    setCssVar(card, '--wdg-slot-circle-size', '');
    try { delete card.dataset.circleToken; } catch {}
  }

  function getPartFromElement(el){
    if (!el) return '';
    if (el.classList.contains('wdg-orgname')) return 'name';
    if (el.classList.contains('wdg-orgrole')) return 'role';
    if (el.classList.contains('wdg-orgemail')) return 'email';
    if (el.classList.contains('wdg-orgpill')) return 'pill';
    return '';
  }

  function setActiveTextTarget(target){
    const t = String(target || '').trim();
    const allowed = new Set(['name','role','email','pill']);
    activeTextTarget = allowed.has(t) ? t : '';
    try { modalEl.dataset.hasText = activeTextTarget ? '1' : '0'; } catch {}
    try { modalEl.dataset.activeText = activeTextTarget || ''; } catch {}

    // Realce no preview
    if (previewCard) {
      try {
        previewCard.querySelectorAll('.wdg-slot-text-active').forEach(x => x.classList.remove('wdg-slot-text-active'));
        if (activeTextTarget) {
          const selector = activeTextTarget === 'name' ? '.wdg-orgname'
            : activeTextTarget === 'role' ? '.wdg-orgrole'
            : activeTextTarget === 'email' ? '.wdg-orgemail'
            : '.wdg-orgpill';
          const el = previewCard.querySelector(selector);
          if (el) el.classList.add('wdg-slot-text-active');
        }
      } catch {}
    }

    // Sincroniza paleta da fonte para o alvo atual
    try {
      const p = getActivePart();
      setActiveSwatch(textHost, String(p?.color || '').trim());
      setIndicator(textIndicator, String(p?.color || '').trim());
    } catch {}

    // Sincroniza paletas do badge quando o alvo é pill
    try {
      const p = getActivePart();
      if (activeTextTarget === 'pill') {
        setActiveSwatch(pillBgHost, String(p?.bgColor || '').trim());
        setIndicator(pillBgIndicator, String(p?.bgColor || '').trim());
        setActiveSwatch(pillBorderHost, String(p?.borderColor || '').trim());
        setIndicator(pillBorderIndicator, String(p?.borderColor || '').trim());
      }
    } catch {}

    if (activeTextTarget) showPanel('accText');
    syncTypoUIFromWorking();
  }

  function getActivePart(){
    const parts = (workingStyle && workingStyle.textParts) ? workingStyle.textParts : {};
    if (!activeTextTarget) return null;
    if (!parts[activeTextTarget]) parts[activeTextTarget] = {};
    return parts[activeTextTarget];
  }

  function syncTypoUIFromWorking(){
    const p = getActivePart();
    if (!p) {
      if (fontFamilySel) { try { fontFamilySel.value = ''; } catch {} }
      if (fontSizeSel) { try { fontSizeSel.value = ''; } catch {} }
      return;
    }

    // Fonte
    if (fontFamilySel) {
      try { fontFamilySel.value = String(p.font || ''); } catch {}
    }

    // Tamanho
    if (fontSizeSel) {
      try { fontSizeSel.value = (p.size != null && Number.isFinite(Number(p.size)) && Number(p.size) > 0) ? String(Number(p.size)) : ''; } catch {}
    }

    const isBold = String(p.weight || '').toLowerCase() === 'bold' || String(p.weight || '') === '800' || String(p.weight || '') === '900';
    btnBold && btnBold.classList.toggle('active', !!isBold);
    btnItalic && btnItalic.classList.toggle('active', !!p.italic);
    btnUnderline && btnUnderline.classList.toggle('active', !!p.underline);
    btnStrike && btnStrike.classList.toggle('active', !!p.strike);

    // Alinhamento
    Array.from(modalEl.querySelectorAll('[data-slot-align]')).forEach(b => {
      const a = String(b.getAttribute('data-slot-align') || '');
      const cur = (p && (p.align === 'left' || p.align === 'center' || p.align === 'right')) ? p.align : 'center';
      b.classList.toggle('active', a === String(cur));
    });
  }

  function setActiveSwatch(host, color){
    if (!host) return;
    const c = String(color || '').toLowerCase();
    Array.from(host.querySelectorAll('.wdg-swatch')).forEach(btn => {
      const bc = String(btn.getAttribute('data-color') || '').toLowerCase();
      btn.classList.toggle('is-active', !!c && bc === c);
    });
  }

  function buildPalette(host, kind){
    if (!host) return;
    host.innerHTML = COLORS_36.map(hex => {
      const h = String(hex);
      const labelKind = kind === 'bg' ? 'Cor da forma'
        : kind === 'border' ? 'Cor da borda'
          : kind === 'pillbg' ? 'Cor do fundo do badge'
            : kind === 'pillborder' ? 'Cor da borda do badge'
              : 'Cor da fonte';
      const label = `${labelKind}: ${h}`;
      return `<button type="button" class="wdg-swatch" data-color="${h}" style="background:${h}" aria-label="${label}" title="${h}"></button>`;
    }).join('');

    host.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.wdg-swatch') : null;
      if (!btn) return;
      const color = String(btn.getAttribute('data-color') || '').trim();
      if (!color) return;

      if (kind === 'bg') {
        workingStyle.bgColor = color;
        if (workingStyle.bgAlpha == null || workingStyle.bgAlpha === '') workingStyle.bgAlpha = 100;
        setIndicator(bgIndicator, computeFill(workingStyle.bgColor, workingStyle.bgAlpha));
      } else if (kind === 'border') {
        workingStyle.borderColor = color;
        if (workingStyle.borderAlpha == null || workingStyle.borderAlpha === '') workingStyle.borderAlpha = 100;
        // Se ainda está em "padrão", ao escolher cor habilita uma borda mínima
        if (workingStyle.borderWidth == null) workingStyle.borderWidth = 1;
        if (!workingStyle.borderStyle) workingStyle.borderStyle = 'solid';
        setIndicator(borderIndicator, computeFill(workingStyle.borderColor, workingStyle.borderAlpha));
      } else if (kind === 'pillbg') {
        if (activeTextTarget !== 'pill') setActiveTextTarget('pill');
        const p = getActivePart();
        if (!p) { showPanel('accText'); return; }
        p.bgColor = color;
        setIndicator(pillBgIndicator, String(p.bgColor || '').trim());
      } else if (kind === 'pillborder') {
        if (activeTextTarget !== 'pill') setActiveTextTarget('pill');
        const p = getActivePart();
        if (!p) { showPanel('accText'); return; }
        p.borderColor = color;
        setIndicator(pillBorderIndicator, String(p.borderColor || '').trim());
      } else {
        const p = getActivePart();
        if (!p) {
          showPanel('accText');
          return;
        }
        p.color = color;
        setIndicator(textIndicator, String(p.color || '').trim());
      }

      setActiveSwatch(host, color);
      applyStyleToCard(previewCard, workingStyle);

      // UX: fecha o dropdown após escolher (estilo Office)
      try {
        if (window.bootstrap && window.bootstrap.Dropdown) {
          const dd = btn.closest('.dropdown');
          const toggle = dd ? dd.querySelector('[data-bs-toggle="dropdown"]') : null;
          if (toggle) window.bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
        }
      } catch {}
    });
  }

  function bindFillAndBorderControls(){
    // Transparência do preenchimento
    bgAlphaRange && bgAlphaRange.addEventListener('input', () => {
      const a = clampInt(bgAlphaRange.value, 0, 100);
      workingStyle.bgAlpha = a;
      if (bgAlphaLabel) bgAlphaLabel.textContent = `${a}%`;
      setIndicator(bgIndicator, computeFill(workingStyle.bgColor, workingStyle.bgAlpha));
      applyStyleToCard(previewCard, workingStyle);
    });

    btnBgClear && btnBgClear.addEventListener('click', () => {
      workingStyle.bgColor = '';
      setActiveSwatch(bgHost, '');
      setIndicator(bgIndicator, '');
      applyStyleToCard(previewCard, workingStyle);
    });

    // Borda
    borderWidthSel && borderWidthSel.addEventListener('change', () => {
      const raw = String(borderWidthSel.value || '').trim();
      if (!raw) workingStyle.borderWidth = null;
      else workingStyle.borderWidth = clampInt(raw, 0, 24);
      applyStyleToCard(previewCard, workingStyle);
    });

    borderStyleSel && borderStyleSel.addEventListener('change', () => {
      workingStyle.borderStyle = String(borderStyleSel.value || '').trim();
      enforceBorderStyleCompatibility();
      applyStyleToCard(previewCard, workingStyle);
    });

    borderAlphaRange && borderAlphaRange.addEventListener('input', () => {
      const a = clampInt(borderAlphaRange.value, 0, 100);
      workingStyle.borderAlpha = a;
      if (borderAlphaLabel) borderAlphaLabel.textContent = `${a}%`;
      setIndicator(borderIndicator, computeFill(workingStyle.borderColor, workingStyle.borderAlpha));
      applyStyleToCard(previewCard, workingStyle);
    });

    btnBorderClear && btnBorderClear.addEventListener('click', () => {
      workingStyle.borderWidth = null;
      workingStyle.borderStyle = '';
      workingStyle.borderColor = '';
      workingStyle.borderAlpha = 100;
      if (borderWidthSel) { try { borderWidthSel.value = ''; } catch {} }
      if (borderStyleSel) { try { borderStyleSel.value = ''; } catch {} }
      if (borderAlphaRange) { try { borderAlphaRange.value = '100'; } catch {} }
      if (borderAlphaLabel) borderAlphaLabel.textContent = '100%';
      setActiveSwatch(borderHost, '');
      setIndicator(borderIndicator, '');
      applyStyleToCard(previewCard, workingStyle);
    });

    btnTextClear && btnTextClear.addEventListener('click', () => {
      const p = getActivePart();
      if (!p) {
        showPanel('accText');
        return;
      }
      p.color = '';
      setActiveSwatch(textHost, '');
      setIndicator(textIndicator, '');
      applyStyleToCard(previewCard, workingStyle);
    });

    btnPillBgClear && btnPillBgClear.addEventListener('click', () => {
      if (activeTextTarget !== 'pill') setActiveTextTarget('pill');
      const p = getActivePart();
      if (!p) { showPanel('accText'); return; }
      p.bgColor = '';
      setActiveSwatch(pillBgHost, '');
      setIndicator(pillBgIndicator, '');
      applyStyleToCard(previewCard, workingStyle);
    });

    btnPillBorderClear && btnPillBorderClear.addEventListener('click', () => {
      if (activeTextTarget !== 'pill') setActiveTextTarget('pill');
      const p = getActivePart();
      if (!p) { showPanel('accText'); return; }
      p.borderColor = '';
      setActiveSwatch(pillBorderHost, '');
      setIndicator(pillBorderIndicator, '');
      applyStyleToCard(previewCard, workingStyle);
    });
  }

  function bindShape(){
    const inputs = Array.from(modalEl.querySelectorAll('input[name="slotShape"]'));
    inputs.forEach(inp => {
      inp.addEventListener('change', () => {
        const v = String(inp.value || '').trim();
        if (!inp.checked) return;
        workingStyle.shape = v || 'rect';
        enforceBorderStyleCompatibility();
        applyStyleToCard(previewCard, workingStyle);
      });
    });
  }

  function syncScaleUIFromWorking(){
    try {
      if (cardWidthSel) cardWidthSel.value = (workingStyle.cardWidth == null || workingStyle.cardWidth === '') ? '' : String(workingStyle.cardWidth);
    } catch {}
    try {
      const pct = Math.round((Number(workingStyle.contentScale || 1) || 1) * 100);
      if (contentScaleRange) contentScaleRange.value = String(pct);
      if (contentScaleLabel) contentScaleLabel.textContent = `${pct}%`;
    } catch {}
  }

  function bindScaleControls(){
    cardWidthSel && cardWidthSel.addEventListener('change', () => {
      const raw = String(cardWidthSel.value || '').trim();
      if (!raw) workingStyle.cardWidth = null;
      else {
        const n = Number(raw);
        workingStyle.cardWidth = (Number.isFinite(n) && n >= 200 && n <= 520) ? Math.round(n) : null;
      }
      applyStyleToCard(previewCard, workingStyle);
    });

    const updateScale = () => {
      const pct = Number(contentScaleRange && contentScaleRange.value);
      const p = Number.isFinite(pct) ? Math.max(60, Math.min(110, pct)) : 100;
      workingStyle.contentScale = p / 100;
      if (contentScaleLabel) contentScaleLabel.textContent = `${Math.round(p)}%`;
      applyStyleToCard(previewCard, workingStyle);
    };
    contentScaleRange && contentScaleRange.addEventListener('input', updateScale);
    contentScaleRange && contentScaleRange.addEventListener('change', updateScale);
  }

  function bindTextTargetPick(){
    // Clique no preview: texto seleciona modo texto; clique no card seleciona modo slot
    previewHost && previewHost.addEventListener('click', (ev) => {
      const txt = ev.target && ev.target.closest ? ev.target.closest('.wdg-orgname, .wdg-orgrole, .wdg-orgemail, .wdg-orgpill') : null;
      if (txt) {
        const part = getPartFromElement(txt);
        if (!part) return;
        try { ev.preventDefault(); ev.stopPropagation(); } catch {}
        setActiveTextTarget(part);
        return;
      }

      const card = ev.target && ev.target.closest ? ev.target.closest('.wdg-orgcard') : null;
      if (!card) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      setActiveTextTarget('');
      showPanel('accSlot');
    });
  }

  function bindTypoControls(){
    // Fonte
    fontFamilySel && fontFamilySel.addEventListener('change', () => {
      const p = getActivePart();
      if (!p) return;
      p.font = String(fontFamilySel.value || '').trim();
      applyStyleToCard(previewCard, workingStyle);
    });

    // Tamanho
    fontSizeSel && fontSizeSel.addEventListener('change', () => {
      const p = getActivePart();
      if (!p) return;
      const raw = String(fontSizeSel.value || '').trim();
      if (!raw) {
        p.size = null;
      } else {
        const n = Number(raw);
        p.size = (Number.isFinite(n) && n > 0) ? n : null;
      }
      applyStyleToCard(previewCard, workingStyle);
    });

    // Toggles
    btnBold && btnBold.addEventListener('click', () => {
      const p = getActivePart();
      if (!p) return;
      const isBold = String(p.weight || '').toLowerCase() === 'bold' || String(p.weight || '') === '800' || String(p.weight || '') === '900';
      p.weight = isBold ? '' : 'bold';
      syncTypoUIFromWorking();
      applyStyleToCard(previewCard, workingStyle);
    });
    btnItalic && btnItalic.addEventListener('click', () => {
      const p = getActivePart();
      if (!p) return;
      p.italic = !p.italic;
      syncTypoUIFromWorking();
      applyStyleToCard(previewCard, workingStyle);
    });
    btnUnderline && btnUnderline.addEventListener('click', () => {
      const p = getActivePart();
      if (!p) return;
      p.underline = !p.underline;
      syncTypoUIFromWorking();
      applyStyleToCard(previewCard, workingStyle);
    });
    btnStrike && btnStrike.addEventListener('click', () => {
      const p = getActivePart();
      if (!p) return;
      p.strike = !p.strike;
      syncTypoUIFromWorking();
      applyStyleToCard(previewCard, workingStyle);
    });

    // Alinhamento
    Array.from(modalEl.querySelectorAll('[data-slot-align]')).forEach(b => {
      b.addEventListener('click', () => {
        if (!activeTextTarget) setActiveTextTarget('name');
        const p = getActivePart();
        if (!p) return;
        p.align = String(b.getAttribute('data-slot-align') || 'center');
        syncTypoUIFromWorking();
        applyStyleToCard(previewCard, workingStyle);
      });
    });
  }

  function openForRole(roleId){
    currentRoleId = String(roleId || '').trim();

    const source = findSourceCard(currentRoleId);
    const rawInitialBorderStyle = source ? String(source.dataset.slotBorderStyle || '').trim() : '';
    const rawInitialShape = source ? String(source.dataset.slotShape || 'rect').trim().toLowerCase() : 'rect';
    const parsePart = (raw) => {
      try {
        const obj = raw ? JSON.parse(String(raw)) : null;
        return (obj && typeof obj === 'object') ? obj : {};
      } catch {
        return {};
      }
    };

    const initial = source ? {
      shape: source.dataset.slotShape || 'rect',
      bgColor: source.dataset.slotBgColor || '',
      bgAlpha: (source.dataset.slotBgAlpha || source.dataset.slotBgAlpha === '0') ? Number(source.dataset.slotBgAlpha) : 100,
      borderWidth: (source.dataset.slotBorderWidth || source.dataset.slotBorderWidth === '0') ? Number(source.dataset.slotBorderWidth) : null,
      borderStyle: source.dataset.slotBorderStyle || '',
      borderColor: source.dataset.slotBorderColor || '',
      borderAlpha: (source.dataset.slotBorderAlpha || source.dataset.slotBorderAlpha === '0') ? Number(source.dataset.slotBorderAlpha) : 100,
      cardWidth: (source.dataset.slotCardWidth || source.dataset.slotCardWidth === '0') ? Number(source.dataset.slotCardWidth) : null,
      contentScale: (source.dataset.slotContentScale || source.dataset.slotContentScale === '0') ? Number(source.dataset.slotContentScale) : 1,
      // Back-compat
      bg: source.dataset.slotBg || '',
      text: source.dataset.slotText || '',
      align: source.dataset.slotAlign || 'center',
      textParts: {
        name: parsePart(source.dataset.slotName),
        role: parsePart(source.dataset.slotRole),
        email: parsePart(source.dataset.slotEmail),
        pill: parsePart(source.dataset.slotPill),
      }
    } : {
      shape: 'rect',
      bgColor: '',
      bgAlpha: 100,
      borderWidth: null,
      borderStyle: '',
      borderColor: '',
      borderAlpha: 100,
      cardWidth: null,
      contentScale: 1,
      bg: '',
      text: '',
      align: 'center',
      textParts: { name:{}, role:{}, email:{}, pill:{} }
    };

    workingStyle = normalizeStyle(initial);

    // Estado inicial do modal (alinhamento agora é por item)
    try { modalEl.dataset.hasText = '1'; } catch {}
    setActiveTextTarget('name');

    // Sincroniza UI do preenchimento/borda
    if (bgAlphaRange) {
      const a = (workingStyle.bgAlpha == null || workingStyle.bgAlpha === '') ? 100 : clampInt(workingStyle.bgAlpha, 0, 100);
      try { bgAlphaRange.value = String(a); } catch {}
      if (bgAlphaLabel) bgAlphaLabel.textContent = `${a}%`;
    }
    if (borderAlphaRange) {
      const a = (workingStyle.borderAlpha == null || workingStyle.borderAlpha === '') ? 100 : clampInt(workingStyle.borderAlpha, 0, 100);
      try { borderAlphaRange.value = String(a); } catch {}
      if (borderAlphaLabel) borderAlphaLabel.textContent = `${a}%`;
    }
    if (borderWidthSel) {
      try { borderWidthSel.value = (workingStyle.borderWidth == null && workingStyle.borderWidth !== 0) ? '' : String(workingStyle.borderWidth); } catch {}
    }

    // UI: tamanho/escala
    syncScaleUIFromWorking();
    if (borderStyleSel) {
      try { borderStyleSel.value = String(workingStyle.borderStyle || ''); } catch {}
    }

    setBorderStyleOptionsForShape(workingStyle.shape);
    enforceBorderStyleCompatibility();
    if (isClipShape(rawInitialShape) && UNSUPPORTED_BORDER_STYLES.has(rawInitialBorderStyle)) {
      showBorderHint('Configuração anterior não suportada nesta forma. Aplicamos Sólida automaticamente.');
    }

    if (previewHost) {
      previewHost.innerHTML = '';
      if (source) {
        const clone = source.cloneNode(true);
        // Remove o botão de editar dentro do preview do modal
        try { clone.querySelectorAll('.wdg-slot-editbtn').forEach(el => el.remove()); } catch {}
        previewHost.appendChild(clone);
        previewCard = clone;
        applyStyleToCard(previewCard, workingStyle);
      } else {
        previewCard = null;
        previewHost.innerHTML = '<div class="text-muted small">Slot não encontrado.</div>';
      }
    }

    // Ajustar UI (forma)
    Array.from(modalEl.querySelectorAll('input[name="slotShape"]')).forEach(inp => {
      try { inp.checked = String(inp.value || '') === String(workingStyle.shape || 'rect'); } catch {}
    });

    setActiveSwatch(bgHost, String(workingStyle.bgColor || '').trim());
    setActiveSwatch(borderHost, String(workingStyle.borderColor || '').trim());
    setActiveSwatch(textHost, '');
    setActiveSwatch(pillBgHost, '');
    setActiveSwatch(pillBorderHost, '');

    setIndicator(bgIndicator, computeFill(workingStyle.bgColor, workingStyle.bgAlpha));
    setIndicator(borderIndicator, computeFill(workingStyle.borderColor, workingStyle.borderAlpha));
    setIndicator(textIndicator, '');
    setIndicator(pillBgIndicator, '');
    setIndicator(pillBorderIndicator, '');

    // Se já existe configuração de badge, reflete nos indicadores (mesmo sem estar selecionado)
    try {
      const p = (workingStyle && workingStyle.textParts) ? (workingStyle.textParts.pill || {}) : {};
      setActiveSwatch(pillBgHost, String(p.bgColor || '').trim());
      setIndicator(pillBgIndicator, String(p.bgColor || '').trim());
      setActiveSwatch(pillBorderHost, String(p.borderColor || '').trim());
      setIndicator(pillBorderIndicator, String(p.borderColor || '').trim());
    } catch {}

    syncTypoUIFromWorking();

    const ctl = getModalController();
    try { ctl && ctl.show && ctl.show(); } catch {}
  }

  document.addEventListener('wdg:slot-editor:open', (ev) => {
    const d = ev && ev.detail ? ev.detail : {};
    const roleId = String(d.roleId || '').trim();
    if (!roleId) return;
    openForRole(roleId);
  });

  btnApply && btnApply.addEventListener('click', () => {
    if (!currentRoleId) return;
    document.dispatchEvent(new CustomEvent('wdg:slot-style:apply', {
      detail: { roleId: currentRoleId, applyAll: false, style: workingStyle }
    }));
    const ctl = getModalController();
    try { ctl && ctl.hide && ctl.hide(); } catch {}
  });

  btnApplyAll && btnApplyAll.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('wdg:slot-style:apply', {
      detail: { roleId: currentRoleId, applyAll: true, style: workingStyle }
    }));
    const ctl = getModalController();
    try { ctl && ctl.hide && ctl.hide(); } catch {}
  });

  // Fallback: se não há Bootstrap, data-bs-dismiss não funciona.
  try {
    Array.from(modalEl.querySelectorAll('[data-bs-dismiss="modal"], .btn-close')).forEach(btn => {
      btn.addEventListener('click', (ev) => {
        try { ev.preventDefault(); } catch {}
        const ctl = getModalController();
        try { ctl && ctl.hide && ctl.hide(); } catch {}
      });
    });
  } catch {}

  // Clique fora do dialog (no overlay do .modal) fecha no fallback.
  try {
    modalEl.addEventListener('mousedown', (ev) => {
      if (ev.target !== modalEl) return;
      // Se estiver usando Bootstrap real, deixe ele decidir.
      if (window.bootstrap && window.bootstrap.Modal) return;
      fallbackHide();
    });
  } catch {}

  modalEl.addEventListener('hidden.bs.modal', () => {
    currentRoleId = '';
    workingStyle = {
      shape: 'rect',
      bgColor: '',
      bgAlpha: 100,
      borderWidth: null,
      borderStyle: '',
      borderColor: '',
      borderAlpha: 100,
      cardWidth: null,
      contentScale: 1,
      text: '',
      align: 'center',
      textParts: { name:{}, role:{}, email:{}, pill:{} }
    };
    previewCard = null;
    if (previewHost) previewHost.innerHTML = '';
    setActiveSwatch(bgHost, '');
    setActiveSwatch(borderHost, '');
    setActiveSwatch(textHost, '');
    setActiveSwatch(pillBgHost, '');
    setActiveSwatch(pillBorderHost, '');
    setIndicator(bgIndicator, '');
    setIndicator(borderIndicator, '');
    setIndicator(textIndicator, '');
    setIndicator(pillBgIndicator, '');
    setIndicator(pillBorderIndicator, '');
    activeTextTarget = '';
    try { modalEl.dataset.hasText = '0'; } catch {}
    try { modalEl.dataset.activeText = ''; } catch {}
    try {
      if (cardWidthSel) cardWidthSel.value = '';
      if (contentScaleRange) contentScaleRange.value = '100';
      if (contentScaleLabel) contentScaleLabel.textContent = '100%';
    } catch {}
  });

  // Init
  buildPalette(bgHost, 'bg');
  buildPalette(borderHost, 'border');
  buildPalette(textHost, 'text');
  buildPalette(pillBgHost, 'pillbg');
  buildPalette(pillBorderHost, 'pillborder');
  bindShape();
  bindTextTargetPick();
  bindTypoControls();
  bindFillAndBorderControls();
  bindScaleControls();
})();
