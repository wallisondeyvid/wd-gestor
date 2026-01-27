(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  const modalEl = document.getElementById('modalEditHabVeiculo');
  if(!modalEl) return;
  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static' });

  const elHab = document.getElementById('veicHabLabel');
  const elProp = document.getElementById('veicPropLabel');
  const form = document.getElementById('formVeiculo');
  const inpPlaca = document.getElementById('veicPlaca');
  const inpChassi = document.getElementById('veicChassi');
  const inpRenavam = document.getElementById('veicRenavam');
  const selEstado = document.getElementById('veicEstado');
  const selMunicipio = document.getElementById('veicMunicipio');
  const selTipo = document.getElementById('veicTipo');
  const selMarca = document.getElementById('veicMarca');
  const wrapMarcaExtra = document.getElementById('veicMarcaExtraWrap');
  const inpMarcaExtra = document.getElementById('veicMarcaExtra');
  const inpModelo = document.getElementById('veicModelo');
  const inpCor = document.getElementById('veicCor');
  const inpAnoModelo = document.getElementById('veicAnoModelo');
  const inpCrlv = document.getElementById('veicCrlv');
  const previewCrlvWrap = document.getElementById('veicCrlvPreview');
  const previewCrlvLabel = document.getElementById('veicCrlvPreviewLabel');
  const previewCrlvLink = document.getElementById('veicCrlvPreviewLink');
  const previewCrlvSize = document.getElementById('veicCrlvPreviewSize');
  const btnCrlvRemover = document.getElementById('btnVeicCrlvRemover');
  const inpFotos = document.getElementById('veicFotos');
  const fotosPreview = document.getElementById('veicFotosPreview');

  const radOwnerMorador = document.getElementById('veicOwnerMorador');
  const radOwnerExterno = document.getElementById('veicOwnerExterno');
  const ownerMoradorFields = document.getElementById('veicOwnerMoradorFields');
  const inpOwnerEmail = document.getElementById('veicOwnerEmail');
  const btnOwnerBuscar = document.getElementById('btnVeicOwnerBuscar');
  const btnOwnerLimpar = document.getElementById('btnVeicOwnerLimpar');
  const ownerMoradorInfo = document.getElementById('veicOwnerMoradorInfo');
  const inpOwnerNome = document.getElementById('veicOwnerNome');
  const inpOwnerCpf = document.getElementById('veicOwnerCpf');
  const inpOwnerNascimento = document.getElementById('veicOwnerNascimento');
  const btnOwnerNascimentoPicker = document.getElementById('btnVeicOwnerNascimentoPicker');
  const inpOwnerCnh = document.getElementById('veicOwnerCnh');
  const selOwnerCateg = document.getElementById('veicOwnerCateg');
  const inpOwnerCnhFile = document.getElementById('veicOwnerCnhFile');
  const previewCnhWrap = document.getElementById('veicOwnerCnhPreview');
  const previewCnhLabel = document.getElementById('veicOwnerCnhPreviewLabel');
  const previewCnhLink = document.getElementById('veicOwnerCnhPreviewLink');
  const previewCnhSize = document.getElementById('veicOwnerCnhPreviewSize');
  const btnCnhRemover = document.getElementById('btnVeicOwnerCnhRemover');

  const selGaragemVinculo = document.getElementById('veicGaragemVinculo');
  const selGaragem = document.getElementById('veicGaragemSelect');
  const garagemInfo = document.getElementById('veicGaragemInfo');

  const btnFormLimpar = document.getElementById('btnVeicLimpar');
  const btnFormCancelar = document.getElementById('btnVeicCancelarEdicao');
  const btnFormInserir = document.getElementById('btnVeicInserir');
  const btnSalvar = document.getElementById('btnVeiculosSalvar');
  const btnFechar = document.getElementById('btnVeiculosFechar');

  const listaBody = document.getElementById('veicListaBody');
  const pageSizeSel = document.getElementById('veicPageSize');
  const pager = document.getElementById('veicPager');

  const TIPOS_VEICULOS = [
    'Carro','Motocicleta','Caminhonete','Utilitário','Caminhão','Ônibus','Van','SUV','Pick-up','Trator','Quadriciclo','Bicicleta','Patinete','Reboque','Semirreboque','Embarcação','Outro'
  ];
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const MAX_FOTO_SIZE = 5 * 1024 * 1024;
  const MAX_FOTO_FILES = 3;

  const state = {
    hab: null,
    proprietario: null,
    moradores: [],
    garagens: [],
    veiculos: [],
    original: [],
    editingIndex: null,
    page: 0
  };

  const aux = {
    estados: null,
    municipios: null,
    marcas: null
  };

  const formState = {
    owner: null,
    existingCrlv: null,
    existingCnh: null,
    pendingCrlvFile: null,
    pendingCnhFile: null,
    removeCrlv: false,
    removeCnh: false,
    fotos: []
  };

  function escapeHtml(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  function onlyDigits(v){ return String(v||'').replace(/\D+/g,''); }

  function formatCpf(value){
    const digits = onlyDigits(value).slice(0,11);
    if(digits.length !== 11) return digits;
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
  }

  function formatBytes(bytes){
    if(!bytes) return '';
    const units = ['B','KB','MB'];
    let val = bytes;
    let idx = 0;
    while(val >= 1024 && idx < units.length - 1){ val /= 1024; idx++; }
    return (val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)) + ' ' + units[idx];
  }

  async function fetchJson(url){
    try{
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    }catch(err){
      console.warn('[modal_edit_hab_veiculo] fetch falhou', url, err);
      return null;
    }
  }

  async function fetchUsuariosLista(term){
    const query = term ? ('?term=' + encodeURIComponent(term)) : '';
    let data = await fetchJson(basePath + '/api/usuarios/busca.v2' + query);
    if(!Array.isArray(data) || !data.length){
      data = await fetchJson(basePath + '/api/usuarios/busca' + query);
    }
    return Array.isArray(data) ? data : [];
  }

  function showToast(message, type){
    const text = Array.isArray(message) ? message.filter(Boolean).join('\n') : String(message || '');
    if(!text) return;
    let container = document.getElementById('toastContainerVeiculo');
    if(!container){
      container = document.createElement('div');
      container.id = 'toastContainerVeiculo';
      container.style.position = 'fixed';
      container.style.top = '1rem';
      container.style.right = '1rem';
      container.style.zIndex = '1060';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '.5rem';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-bg-' + (type || 'secondary') + ' border-0 show shadow';
    toast.style.minWidth = '260px';
    toast.setAttribute('role','alert');
    toast.setAttribute('aria-live','assertive');
    toast.setAttribute('aria-atomic','true');
    toast.innerHTML = '<div class="d-flex"><div class="toast-body">' + escapeHtml(text).replace(/\n/g,'<br>') + '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Fechar"></button></div>';
    container.appendChild(toast);
    const remover = () => { try { toast.remove(); } catch(_){} };
    const closeBtn = toast.querySelector('.btn-close');
    if(closeBtn) closeBtn.addEventListener('click', remover);
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(remover, 320);
    }, 4000);
  }

  function formatHabLabel(item){
    if(!item) return '';
    const unidade = item.unidade || {};
    const unidadeStr = [unidade.codigo, unidade.nome].filter(Boolean).join(' - ');
    const bloco = item.bloco && item.bloco.nome ? 'Bloco ' + item.bloco.nome : '';
    const andar = item.andar && item.andar.nome ? item.andar.nome : '';
    const tipoNum = [item.tipo, item.numero].filter(Boolean).join(' ');
    return [unidadeStr, bloco, andar, tipoNum].filter(Boolean).join(' - ');
  }

  function formatProprietarioLabel(prop){
    if(!prop) return '—';
    const nome = prop.nome || prop.razao || prop.fantasia || '';
    if(!nome) return '—';
    return nome;
  }

  function formatPlate(value){
    const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7);
    if(!raw) return '';
    if(raw.length <= 3) return raw;
    return raw.slice(0,3) + '-' + raw.slice(3);
  }

  function normalizeMunicipioName(name){
    return String(name || '').trim();
  }

  function parseAnoModelo(value){
    const cleaned = String(value || '').replace(/\s+/g,'');
    const parts = cleaned.split('/');
    if(parts.length !== 2) return null;
    const ano = parseInt(parts[0],10);
    const anoModelo = parseInt(parts[1],10);
    if(!ano || !anoModelo || String(ano).length !== 4 || String(anoModelo).length !== 4) return null;
    if(ano < 1900 || ano > 2100) return null;
    if(anoModelo < ano || anoModelo > ano + 1) return null;
    return { ano, ano_modelo: anoModelo };
  }

  function parseDateBRorISO(value){
    if(!value) return null;
    if(value instanceof Date && !isNaN(value.getTime())) return value;
    const str = String(value).trim();
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m){
      const d = new Date(+m[3], +m[2]-1, +m[1]);
      return isNaN(d.getTime()) ? null : d;
    }
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso){
      const dIso = new Date(+iso[1], +iso[2]-1, +iso[3]);
      return isNaN(dIso.getTime()) ? null : dIso;
    }
    const d2 = new Date(str);
    return isNaN(d2.getTime()) ? null : d2;
  }

  function formatDateISO(date){
    if(!(date instanceof Date) || isNaN(date)) return null;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const dd = String(date.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function normalizeOwnerRecord(raw){
    if(!raw || typeof raw !== 'object') return null;
    const result = { ...raw };
    result.nome = raw.nome || raw.name || raw.fullname || raw.razao || '';
    result.email = raw.email || raw.mail || raw.login || '';
    result.cpf = onlyDigits(raw.cpf || raw.cpfNumero || raw.documento || (raw.dados && raw.dados.cpf) || (raw.pessoa && raw.pessoa.cpf) || '');
    const nascRaw = raw.data_nascimento || raw.dataNascimento || raw.nascimento || (raw.dados && (raw.dados.data_nascimento || raw.dados.dataNascimento)) || (raw.pessoa && (raw.pessoa.data_nascimento || raw.pessoa.dataNascimento)) || null;
    const nascDate = nascRaw ? parseDateBRorISO(nascRaw) : null;
    result.dataNascimentoIso = nascDate ? formatDateISO(nascDate) : (typeof nascRaw === 'string' ? nascRaw : null);
    result.dataNascimentoDisplay = nascDate ? formatBrDate(nascDate) : (typeof nascRaw === 'string' ? nascRaw : '');
    const cnhNumeroRaw = raw.cnh_numero || raw.cnhNumero || (raw.cnh && (raw.cnh.numero || raw.cnh.numero_cnh)) || (raw.documentos && raw.documentos.cnh && raw.documentos.cnh.numero) || (raw.cnh && raw.cnh.numeroCnh) || '';
    result.cnhNumero = onlyDigits(cnhNumeroRaw);
    const cnhCategoriaRaw = raw.cnh_categoria || raw.cnhCategoria || (raw.cnh && raw.cnh.categoria) || (raw.documentos && raw.documentos.cnh && raw.documentos.cnh.categoria) || '';
    result.cnhCategoria = cnhCategoriaRaw ? String(cnhCategoriaRaw).toUpperCase() : '';
    const cnhDoc = (raw.cnh && (raw.cnh.arquivo || raw.cnh.documento || raw.cnh.file)) || (raw.documentos && raw.documentos.cnh && (raw.documentos.cnh.arquivo || raw.documentos.cnh.documento)) || raw.cnh_documento || null;
    if(cnhDoc && typeof cnhDoc === 'object'){
      result.cnhDocumento = {
        url: cnhDoc.url || '',
        nome: cnhDoc.nome || cnhDoc.name || '',
        mime: cnhDoc.mime || cnhDoc.tipo || cnhDoc.contentType || '',
        tamanho: cnhDoc.tamanho || cnhDoc.size || null
      };
    } else {
      result.cnhDocumento = null;
    }
    result.moradorId = raw.moradorId || raw.morador_id || (raw.morador && (raw.morador._id || raw.morador.id)) || null;
    result.condUsuarioId = raw.condUsuarioId || raw.cond_usuario_id || raw.usuario_id || raw._id || raw.id || null;
    if(raw.habitacaoLabel) result.habitacaoLabel = raw.habitacaoLabel;
    else if(raw.habitacao && raw.habitacao.label) result.habitacaoLabel = raw.habitacao.label;
    else result.habitacaoLabel = result.habitacaoLabel || '';
    return result;
  }

  function cloneObj(obj){
    return obj ? JSON.parse(JSON.stringify(obj)) : null;
  }

  async function ensureEstados(){
    if(aux.estados) return aux.estados;
    const data = await fetchJson(basePath + '/data/estados.json');
    aux.estados = Array.isArray(data) ? data : [];
    return aux.estados;
  }

  async function ensureMunicipios(){
    if(aux.municipios) return aux.municipios;
    const data = await fetchJson(basePath + '/data/municipios_por_uf.json');
    aux.municipios = data && typeof data === 'object' ? data : {};
    return aux.municipios;
  }

  function stripDiacritics(str){
    if(!str) return '';
    const value = String(str);
    if(typeof value.normalize === 'function'){
      return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return value;
  }

  async function ensureMarcas(){
    if(aux.marcas) return aux.marcas;
    let data = await fetchJson(basePath + '/data/marcas_veiculos_por_tipo.json');
    if(data && typeof data === 'object' && !Array.isArray(data)){
      aux.marcas = data;
    } else {
      const lista = await fetchJson(basePath + '/data/marcas_veiculos.json');
      aux.marcas = { _default: Array.isArray(lista) ? lista : [] };
    }
    const normalized = {};
    Object.keys(aux.marcas).forEach(key => {
      const list = Array.isArray(aux.marcas[key]) ? aux.marcas[key].map(item => String(item || '').trim()).filter(Boolean) : null;
      if(!list) return;
      normalized[key] = list;
      const strippedKey = stripDiacritics(key).trim();
      if(strippedKey && !normalized[strippedKey]) normalized[strippedKey] = list;
      const lower = strippedKey.toLowerCase();
      if(lower && !normalized[lower]) normalized[lower] = list;
      const alnum = strippedKey.replace(/[^a-z0-9]/gi, '');
      if(alnum && !normalized[alnum]) normalized[alnum] = list;
    });
    if(!Array.isArray(normalized._default)){
      const firstKey = Object.keys(normalized).find(k => Array.isArray(normalized[k]));
      normalized._default = firstKey ? normalized[firstKey] : [];
    }
    aux.marcas = normalized;
    return normalized;
  }

  function resolveMarcaListaPorTipo(map, tipo){
    if(!map) return [];
    if(!tipo) return Array.isArray(map._default) ? map._default : [];
    const base = String(tipo).trim();
    const variants = [];
    if(base) variants.push(base);
    const stripped = stripDiacritics(base);
    if(stripped && stripped !== base) variants.push(stripped);
    variants.push(base.toLowerCase());
    if(stripped) variants.push(stripped.toLowerCase());
    if(stripped) variants.push(stripped.replace(/[^a-z0-9]/gi,''));
    if(stripped) variants.push(stripped.replace(/[^a-z0-9]/gi,'').toLowerCase());
    for(const variant of variants){
      if(!variant) continue;
      if(Array.isArray(map[variant])) return map[variant];
      const capitalized = variant.charAt(0).toUpperCase() + variant.slice(1);
      if(Array.isArray(map[capitalized])) return map[capitalized];
    }
    return Array.isArray(map._default) ? map._default : [];
  }

  async function ensureTipoOptions(){
    if(selTipo.options.length > 1) return;
    TIPOS_VEICULOS.forEach(tipo => {
      const opt = document.createElement('option');
      opt.value = tipo;
      opt.textContent = tipo;
      selTipo.appendChild(opt);
    });
  }

  async function populateEstados(){
    const estados = await ensureEstados();
    if(!estados || !estados.length) return;
    if(selEstado.options.length > 1) return;
    estados.forEach(est => {
      const opt = document.createElement('option');
      opt.value = est.sigla;
      opt.textContent = `${est.sigla} - ${est.nome}`;
      selEstado.appendChild(opt);
    });
  }

  async function populateMarcas(tipo, presetValue){
    const mapa = await ensureMarcas();
    const listaBase = resolveMarcaListaPorTipo(mapa, tipo);
    const unique = [];
    const seen = new Set();
    (Array.isArray(listaBase) ? listaBase : []).forEach(nome => {
      const label = String(nome || '').trim();
      if(!label) return;
      const key = label.toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      unique.push(label);
    });
    if(!seen.has('outro')) unique.push('Outro');

    selMarca.innerHTML = '<option value="">Selecione...</option>';
    unique.forEach(nome => {
      const option = document.createElement('option');
      const isOutro = nome.toLowerCase() === 'outro';
      option.value = isOutro ? '__outros__' : nome;
      option.textContent = nome;
      selMarca.appendChild(option);
    });

    let targetValue = presetValue != null ? String(presetValue) : '';
    if(targetValue.toLowerCase() === 'outro') targetValue = '__outros__';
    const hasTargetOption = targetValue ? Array.from(selMarca.options).some(opt => opt.value === targetValue) : false;
    if(targetValue && !hasTargetOption){
      const customOpt = document.createElement('option');
      customOpt.value = targetValue;
      customOpt.textContent = targetValue === '__outros__' ? 'Outro' : targetValue;
      selMarca.appendChild(customOpt);
    }
    selMarca.value = targetValue || '';
    toggleMarcaExtra();
  }

  async function updateMunicipiosByEstado(){
    const uf = selEstado.value;
    if(!uf){
      selMunicipio.innerHTML = '<option value="">Selecione...</option>';
      selMunicipio.disabled = true;
      return;
    }
    const municipios = await ensureMunicipios();
    const list = Array.isArray(municipios[uf]) ? municipios[uf] : [];
    selMunicipio.disabled = !list.length;
    let html = '<option value="">Selecione...</option>';
    html += list.map(nome => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`).join('');
    selMunicipio.innerHTML = html;
  }

  function toggleMarcaExtra(){
    const isOutros = selMarca.value === '__outros__';
    wrapMarcaExtra.classList.toggle('d-none', !isOutros);
    if(!isOutros) inpMarcaExtra.value = '';
  }

  function applyOwnerFieldState(){
    const isMorador = radOwnerMorador.checked;
    [inpOwnerNome, inpOwnerCpf, inpOwnerNascimento].forEach(el => {
      if(!el) return;
      if(isMorador) el.setAttribute('disabled', 'disabled');
      else el.removeAttribute('disabled');
    });
    if(btnOwnerNascimentoPicker){
      if(isMorador) btnOwnerNascimentoPicker.setAttribute('disabled', 'disabled');
      else btnOwnerNascimentoPicker.removeAttribute('disabled');
    }
  }

  function toggleOwnerFields(){
    const isMorador = radOwnerMorador.checked;
    ownerMoradorFields.classList.toggle('d-none', !isMorador);
    if(!isMorador){
      formState.owner = null;
      ownerMoradorInfo.textContent = '';
      inpOwnerEmail.value = '';
    } else if(formState.owner && formState.owner.email){
      inpOwnerEmail.value = formState.owner.email;
    }
    applyOwnerFieldState();
  }

  function setupOwnerNascimentoPicker(){
    if(!inpOwnerNascimento) return;

    const canShowPicker = () => !inpOwnerNascimento.disabled && typeof inpOwnerNascimento.showPicker === 'function';

    const invokePicker = () => {
      if(!canShowPicker()) return false;
      try {
        inpOwnerNascimento.showPicker();
        return true;
      } catch(_err){
        return false;
      }
    };

    inpOwnerNascimento.addEventListener('pointerdown', () => {
      if(canShowPicker()) invokePicker();
    });

    inpOwnerNascimento.addEventListener('keydown', (ev) => {
      if(!canShowPicker()) return;
      if(ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' '){
        if(invokePicker()) ev.preventDefault();
      }
    });

    if(btnOwnerNascimentoPicker){
      btnOwnerNascimentoPicker.addEventListener('click', (ev) => {
        ev.preventDefault();
        if(invokePicker()) return;
        inpOwnerNascimento.focus();
      });
      btnOwnerNascimentoPicker.addEventListener('keydown', (ev) => {
        if(ev.key === 'Enter' || ev.key === ' '){
          ev.preventDefault();
          if(invokePicker()) return;
          inpOwnerNascimento.focus();
        }
      });
    }
  }

  function updateGaragemSelect(presetId){
    const vincular = !!selGaragemVinculo.checked;
    selGaragem.innerHTML = '<option value="">Selecione...</option>';
    const list = Array.isArray(state.garagens) ? state.garagens : [];
    garagemInfo.textContent = '';
    if(list.length){
      list.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g._id || g.id || '';
        opt.textContent = g.nome || g.identificacao || 'Garagem';
        if(g.codigo) opt.setAttribute('data-codigo', g.codigo);
        selGaragem.appendChild(opt);
      });
    }
    if(presetId){
      selGaragem.value = presetId;
      if(selGaragem.value !== presetId){
        const opt = document.createElement('option');
        opt.value = presetId;
        opt.textContent = 'Garagem vinculada não listada';
        selGaragem.appendChild(opt);
        selGaragem.value = presetId;
      }
    }
    selGaragem.disabled = !vincular;
    if(!vincular){
      selGaragem.value = '';
    }
  }

  function setOwnerResult(owner, options){
    const opts = options || {};
    const processed = owner ? normalizeOwnerRecord(owner) : null;
    formState.owner = processed;
    if(processed){
      const emailPart = processed.email ? ` — ${processed.email}` : '';
      const habPart = processed.habitacaoLabel ? ` · ${processed.habitacaoLabel}` : '';
      ownerMoradorInfo.textContent = `${processed.nome || 'Usuário'}${emailPart}${habPart}`;
      if(processed.email) inpOwnerEmail.value = processed.email;
      if(opts.fillFields !== false && (radOwnerMorador.checked || opts.forceFillFields)){
        inpOwnerNome.value = processed.nome || '';
        inpOwnerCpf.value = processed.cpf ? formatCpf(processed.cpf) : '';
        let nascIso = processed.dataNascimentoIso || '';
        if(!nascIso && processed.dataNascimentoDisplay){
          const nascParsed = parseDateBRorISO(processed.dataNascimentoDisplay);
          nascIso = nascParsed ? formatDateISO(nascParsed) : '';
        }
        inpOwnerNascimento.value = nascIso;
      }
      inpOwnerCnhFile.value = '';
      if(!opts.skipCnh){
        if(processed.cnhNumero && (opts.forceFillCnh || !inpOwnerCnh.value)) inpOwnerCnh.value = processed.cnhNumero;
        if(processed.cnhCategoria && (opts.forceFillCnh || !selOwnerCateg.value)) selOwnerCateg.value = processed.cnhCategoria;
        if(processed.cnhDocumento && !opts.skipCnhPreview){
          formState.existingCnh = { ...processed.cnhDocumento };
          formState.pendingCnhFile = null;
          formState.removeCnh = false;
          updateCnhPreview(formState.existingCnh);
        }
      }
    } else {
      ownerMoradorInfo.textContent = '';
      if(opts.forceClearFields || radOwnerMorador.checked){
        inpOwnerNome.value = '';
        inpOwnerCpf.value = '';
        inpOwnerNascimento.value = '';
      }
      if(opts.resetCnh){
        inpOwnerCnh.value = '';
        selOwnerCateg.value = '';
        formState.existingCnh = null;
        formState.pendingCnhFile = null;
        formState.removeCnh = false;
        updateCnhPreview(null);
      }
    }
    applyOwnerFieldState();
  }

  function clearOwnerSelection(){
    setOwnerResult(null, { forceClearFields: true, resetCnh: true });
    inpOwnerEmail.value = '';
    inpOwnerCnhFile.value = '';
  }

  function resetForm(){
    form.reset();
    inpPlaca.value = '';
    inpChassi.value = '';
    inpRenavam.value = '';
    selEstado.value = '';
    selMunicipio.innerHTML = '<option value="">Selecione...</option>';
    selMunicipio.disabled = true;
    selTipo.value = '';
    selMarca.value = '';
    inpMarcaExtra.value = '';
    wrapMarcaExtra.classList.add('d-none');
    inpModelo.value = '';
    inpCor.value = '';
    inpAnoModelo.value = '';
    inpCrlv.value = '';
    if(inpFotos) inpFotos.value = '';
    updateCrlvPreview(null);
    radOwnerMorador.checked = true;
    toggleOwnerFields();
    clearOwnerSelection();
    inpOwnerNome.value = '';
    inpOwnerCpf.value = '';
    inpOwnerNascimento.value = '';
    inpOwnerCnh.value = '';
    selOwnerCateg.value = '';
    inpOwnerCnhFile.value = '';
    updateCnhPreview(null);
    selGaragemVinculo.checked = false;
    updateGaragemSelect();
    formState.existingCrlv = null;
    formState.existingCnh = null;
    formState.pendingCrlvFile = null;
    formState.pendingCnhFile = null;
    formState.removeCrlv = false;
    formState.removeCnh = false;
    formState.fotos = [];
    state.editingIndex = null;
    btnFormCancelar.classList.add('d-none');
    btnFormInserir.textContent = 'Inserir';
    populateMarcas(selTipo.value || '', '');
    updateFotosPreview();
  }

  function updateCrlvPreview(data){
    const info = data && typeof data === 'object' ? data : null;
    if(!info || (!info.url && !info.nome && !info.file)){ previewCrlvWrap.classList.add('d-none'); previewCrlvLabel.textContent=''; previewCrlvLink.classList.add('d-none'); previewCrlvLink.removeAttribute('href'); previewCrlvSize.textContent=''; return; }
    previewCrlvWrap.classList.remove('d-none');
    const label = info.nome || 'Arquivo selecionado';
    previewCrlvLabel.textContent = label;
    if(info.url){
      previewCrlvLink.classList.remove('d-none');
      previewCrlvLink.href = info.url;
    } else {
      previewCrlvLink.classList.add('d-none');
      previewCrlvLink.removeAttribute('href');
    }
    const sizeVal = info.tamanho || (info.file ? Math.round((info.file.length * 3) / 4) : null);
    previewCrlvSize.textContent = sizeVal ? formatBytes(sizeVal) : '';
  }

  function updateCnhPreview(data){
    const info = data && typeof data === 'object' ? data : null;
    if(!info || (!info.url && !info.nome && !info.file)){ previewCnhWrap.classList.add('d-none'); previewCnhLabel.textContent=''; previewCnhLink.classList.add('d-none'); previewCnhLink.removeAttribute('href'); previewCnhSize.textContent=''; return; }
    previewCnhWrap.classList.remove('d-none');
    previewCnhLabel.textContent = info.nome || 'Arquivo selecionado';
    if(info.url){
      previewCnhLink.classList.remove('d-none');
      previewCnhLink.href = info.url;
    } else {
      previewCnhLink.classList.add('d-none');
      previewCnhLink.removeAttribute('href');
    }
    const sizeVal = info.tamanho || (info.file ? Math.round((info.file.length * 3) / 4) : null);
    previewCnhSize.textContent = sizeVal ? formatBytes(sizeVal) : '';
  }

  function removeFotoAt(index){
    if(!Array.isArray(formState.fotos)) return;
    if(index < 0 || index >= formState.fotos.length) return;
    formState.fotos.splice(index, 1);
    formState.fotos = formState.fotos.slice(0, MAX_FOTO_FILES);
    if(inpFotos) inpFotos.value = '';
    updateFotosPreview();
  }

  function createFotoPreviewItem(entry, index){
    const src = entry && (entry.file || entry.url) ? (entry.file || entry.url) : '';
    if(!src) return null;
    const container = document.createElement('div');
    container.className = 'wdg-foto-thumb-item';
    container.title = 'Abrir imagem em nova guia';
    const img = document.createElement('img');
    img.src = src;
    img.alt = entry && entry.nome ? entry.nome : 'Foto do veículo';
    img.loading = 'lazy';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'wdg-foto-thumb-remove';
    removeBtn.innerText = '×';
    removeBtn.title = 'Remover foto';
    removeBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      removeFotoAt(index);
    });
    container.appendChild(img);
    container.appendChild(removeBtn);
    container.addEventListener('click', () => {
      if(src.startsWith('http')){
        window.open(src, '_blank', 'noopener');
      }
    });
    return container;
  }

  function updateFotosPreview(){
    if(!fotosPreview) return;
    fotosPreview.innerHTML = '';
    const list = Array.isArray(formState.fotos) ? formState.fotos.slice(0, MAX_FOTO_FILES) : [];
    if(!list.length){
      fotosPreview.classList.add('d-none');
      return;
    }
    fotosPreview.classList.remove('d-none');
    list.forEach((entry, idx) => {
      const node = createFotoPreviewItem(entry, idx);
      if(node) fotosPreview.appendChild(node);
    });
  }

  function normalizeVehicleFromServer(raw){
    if(!raw || typeof raw !== 'object') return null;
    const obj = cloneObj(raw) || {};
    obj._id = obj._id || obj.id || null;
    obj.placa = formatPlate(obj.placa);
    obj.chassi = String(obj.chassi || '').toUpperCase();
    obj.renavam = onlyDigits(obj.renavam || '').slice(0,11);
    obj.estado = (obj.estado || '').toUpperCase();
    obj.municipio = normalizeMunicipioName(obj.municipio);
    obj.tipo = obj.tipo || '';
    obj.marca = obj.marca || '';
    obj.marca_extra = obj.marca_extra || obj.marca_outros || '';
    obj.modelo = String(obj.modelo || '').toUpperCase();
    obj.cor = String(obj.cor || '').toUpperCase();
    obj.ano = obj.ano != null ? Number(obj.ano) : null;
    obj.ano_modelo = obj.ano_modelo != null ? Number(obj.ano_modelo) : null;
    obj.proprietario_tipo = obj.proprietario_tipo || 'morador';
    obj.proprietario_nome = obj.proprietario_nome || '';
    obj.proprietario_email = obj.proprietario_email || '';
    obj.proprietario_cpf = onlyDigits(obj.proprietario_cpf || '').slice(0,11);
    obj.proprietario_cnh_numero = onlyDigits(obj.proprietario_cnh_numero || '').slice(0,11);
    obj.proprietario_cnh_categoria = obj.proprietario_cnh_categoria || '';
    obj.proprietario_cond_usuario_id = obj.proprietario_cond_usuario_id || null;
    obj.proprietario_morador_id = obj.proprietario_morador_id || null;
    obj.proprietario_data_nascimento = obj.proprietario_data_nascimento || null;
    obj.crlv = obj.crlv && typeof obj.crlv === 'object' ? obj.crlv : { url:'', nome:'', mime:'', tamanho:null };
    obj.proprietario_cnh = obj.proprietario_cnh && typeof obj.proprietario_cnh === 'object' ? obj.proprietario_cnh : { url:'', nome:'', mime:'', tamanho:null };
    obj.garagem_id = obj.garagem_id || obj.garagem || null;
    obj.garagem_nome = obj.garagem_nome || obj.garagemIdentificacao || '';
    obj.garagem_codigo = obj.garagem_codigo || '';
    obj.fotos = Array.isArray(obj.fotos)
      ? obj.fotos.map(f => {
          if(!f || typeof f !== 'object') return null;
          const foto = {
            _id: f._id || f.id || null,
            url: typeof f.url === 'string' ? f.url : '',
            nome: typeof f.nome === 'string' ? f.nome : '',
            mime: typeof f.mime === 'string' ? f.mime : '',
            tamanho: Number.isFinite(Number(f.tamanho)) ? Number(f.tamanho) : null
          };
          if(typeof f.file === 'string' && f.file.startsWith('data:')){
            foto.file = f.file;
          }
          return (foto.url || foto.file) ? foto : null;
        })
        .filter(Boolean)
        .slice(0, MAX_FOTO_FILES)
      : [];
    return obj;
  }

  function formatOwnerLabel(vehicle){
    if(!vehicle) return '—';
    if(vehicle.proprietario_tipo === 'externo'){
      return vehicle.proprietario_nome || vehicle.proprietario_cpf || 'Proprietário externo';
    }
    return vehicle.proprietario_nome || vehicle.proprietario_email || 'Morador';
  }

  function formatMarca(vehicle){
    if(!vehicle) return '—';
    if(vehicle.marca === '__outros__' || vehicle.marca === 'Outro'){ return vehicle.marca_extra || 'Outro'; }
    return vehicle.marca || '—';
  }

  function formatAnoModeloLabel(vehicle){
    if(!vehicle) return '—';
    if(!vehicle.ano && !vehicle.ano_modelo) return '—';
    return `${vehicle.ano || '----'}/${vehicle.ano_modelo || '----'}`;
  }

  function prepareVehicleForSend(vehicle){
    const obj = cloneObj(vehicle) || {};
    if(obj.marca === '__outros__') obj.marca = 'Outro';
    if(obj.marca === 'Outro' && !obj.marca_extra) obj.marca_extra = '';
    if(Array.isArray(obj.fotos)){
      obj.fotos = obj.fotos
        .map(f => {
          const copy = cloneObj(f) || {};
          if(!copy.file && !copy.url) return null;
          if(copy.tamanho != null && !Number.isFinite(Number(copy.tamanho))) delete copy.tamanho;
          return copy;
        })
        .filter(Boolean)
        .slice(0, MAX_FOTO_FILES);
    } else {
      obj.fotos = [];
    }
    return obj;
  }

  function createDocumentLink(label, href){
    if(!href || typeof href !== 'string') return null;
    const trimmed = href.trim();
    if(!trimmed) return null;
    if(!(trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:'))){
      return null;
    }
    const link = document.createElement('a');
    link.href = trimmed;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    link.className = 'wdg-doc-link';
    return link;
  }

  function buildDocsCell(vehicle){
    const td = document.createElement('td');
    const links = [];
    if(vehicle && vehicle.crlv){
      const href = vehicle.crlv.url || vehicle.crlv.file || '';
      const link = createDocumentLink('CRLV', href);
      if(link){
        link.title = 'Abrir CRLV';
        if(vehicle.crlv.nome){ link.download = vehicle.crlv.nome; }
        links.push(link);
      }
    }
    if(vehicle && vehicle.proprietario_cnh){
      const href = vehicle.proprietario_cnh.url || vehicle.proprietario_cnh.file || '';
      const link = createDocumentLink('CNH', href);
      if(link){
        link.title = 'Abrir CNH do proprietário';
        if(vehicle.proprietario_cnh.nome){ link.download = vehicle.proprietario_cnh.nome; }
        links.push(link);
      }
    }
    if(links.length){
      const wrap = document.createElement('div');
      wrap.className = 'd-flex flex-column align-items-center gap-1';
      links.forEach(link => wrap.appendChild(link));
      td.appendChild(wrap);
    } else {
      td.textContent = '—';
    }
    return td;
  }

  function renderLista(){
    listaBody.innerHTML = '';
    const size = getPageSize();
    const total = state.veiculos.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    if(state.page >= totalPages) state.page = totalPages - 1;
    if(state.page < 0) state.page = 0;
    const start = state.page * size;
    const slice = state.veiculos.slice(start, start + size);
    if(!slice.length){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 10;
      td.textContent = 'Nenhum veículo cadastrado.';
      tr.appendChild(td);
      listaBody.appendChild(tr);
    } else {
      slice.forEach(vehicle => {
        const tr = document.createElement('tr');
        const cells = [
          vehicle.placa || '—',
          vehicle.tipo || '—',
          formatMarca(vehicle),
          vehicle.modelo || '—',
          vehicle.cor || '—',
          formatAnoModeloLabel(vehicle),
          formatOwnerLabel(vehicle),
          vehicle.garagem_nome || '—'
        ];
        cells.forEach(text => {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        });
        tr.appendChild(buildDocsCell(vehicle));
        const tdAcao = document.createElement('td');
        const actionWrap = document.createElement('div');
        actionWrap.className = 'd-flex gap-2 justify-content-center';

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'wdg-icon-btn';
        btnEdit.dataset.role = 'edit';
        btnEdit.title = 'Editar';
        btnEdit.setAttribute('aria-label', 'Editar');
        const imgEdit = document.createElement('img');
        imgEdit.src = basePath + '/images/editar.png';
        imgEdit.alt = 'Editar';
        btnEdit.appendChild(imgEdit);

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'wdg-icon-btn';
        btnDel.dataset.role = 'delete';
        btnDel.title = 'Excluir';
        btnDel.setAttribute('aria-label', 'Excluir');
        const imgDel = document.createElement('img');
        imgDel.src = basePath + '/images/excluir.png';
        imgDel.alt = 'Excluir';
        btnDel.appendChild(imgDel);

        actionWrap.appendChild(btnEdit);
        actionWrap.appendChild(btnDel);
        tdAcao.appendChild(actionWrap);
        const idx = state.veiculos.indexOf(vehicle);
        tdAcao.dataset.index = idx;
        tr.appendChild(tdAcao);
        listaBody.appendChild(tr);
      });
    }
    renderPager(totalPages);
  }

  function getPageSize(){
    const val = parseInt(pageSizeSel.value, 10);
    return (!isNaN(val) && val > 0) ? val : 25;
  }

  function renderPager(totalPagesParam){
    pager.innerHTML = '';
    const size = getPageSize();
    const total = state.veiculos.length;
    const totalPages = totalPagesParam || Math.max(1, Math.ceil(total / size));
    if(state.page >= totalPages) state.page = totalPages - 1;
    if(totalPages <= 1) return;
    const frag = document.createDocumentFragment();
    const buildBtn = (label, page, disabled, active) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wdg-pager-btn';
      btn.textContent = label;
      if(disabled) btn.disabled = true;
      if(active) btn.classList.add('active');
      btn.addEventListener('click', () => { state.page = page; renderLista(); });
      return btn;
    };
    frag.appendChild(buildBtn('«', 0, state.page === 0, false));
    frag.appendChild(buildBtn('‹', Math.max(0, state.page - 1), state.page === 0, false));
    const windowSize = 7;
    let start = Math.max(0, state.page - Math.floor(windowSize/2));
    let end = Math.min(totalPages - 1, start + windowSize - 1);
    if(end - start + 1 < windowSize) start = Math.max(0, end - windowSize + 1);
    for(let p = start; p <= end; p++) frag.appendChild(buildBtn(String(p+1), p, false, p === state.page));
    frag.appendChild(buildBtn('›', Math.min(totalPages - 1, state.page + 1), state.page >= totalPages - 1, false));
    frag.appendChild(buildBtn('»', totalPages - 1, state.page >= totalPages - 1, false));
    pager.appendChild(frag);
  }

  async function setEditing(index){
    const vehicle = state.veiculos[index];
    if(!vehicle) return;
    state.editingIndex = index;
    inpPlaca.value = vehicle.placa || '';
    inpChassi.value = vehicle.chassi || '';
    inpRenavam.value = vehicle.renavam || '';
    selEstado.value = vehicle.estado || '';
    await updateMunicipiosByEstado();
    selMunicipio.value = vehicle.municipio || '';
    if(!selMunicipio.value && vehicle.municipio){
      const opt = document.createElement('option');
      opt.value = vehicle.municipio;
      opt.textContent = vehicle.municipio;
      selMunicipio.appendChild(opt);
      selMunicipio.value = vehicle.municipio;
    }
    selTipo.value = vehicle.tipo || '';
    const presetMarca = vehicle.marca === '__outros__' ? '__outros__' : vehicle.marca || '';
    await populateMarcas(selTipo.value || '', presetMarca);
    inpMarcaExtra.value = vehicle.marca_extra || '';
    inpModelo.value = vehicle.modelo || '';
    inpCor.value = vehicle.cor || '';
    inpAnoModelo.value = vehicle.ano && vehicle.ano_modelo ? `${vehicle.ano}/${vehicle.ano_modelo}` : '';
    formState.existingCrlv = cloneObj(vehicle.crlv);
    formState.pendingCrlvFile = null;
    formState.removeCrlv = false;
    updateCrlvPreview(vehicle.crlv);
    formState.fotos = Array.isArray(vehicle.fotos) ? vehicle.fotos.map(cloneObj).filter(Boolean).slice(0, MAX_FOTO_FILES) : [];
    if(inpFotos) inpFotos.value = '';
    updateFotosPreview();
    if(vehicle.proprietario_tipo === 'externo'){
      radOwnerExterno.checked = true;
      inpOwnerNome.value = vehicle.proprietario_nome || '';
      inpOwnerCpf.value = formatCpf(vehicle.proprietario_cpf || '');
      if(vehicle.proprietario_data_nascimento){
        const nascParsed = parseDateBRorISO(vehicle.proprietario_data_nascimento);
        inpOwnerNascimento.value = nascParsed ? formatDateISO(nascParsed) : '';
      } else {
        inpOwnerNascimento.value = '';
      }
      inpOwnerCnh.value = onlyDigits(vehicle.proprietario_cnh_numero || '').slice(0,11);
      selOwnerCateg.value = vehicle.proprietario_cnh_categoria || '';
      formState.existingCnh = cloneObj(vehicle.proprietario_cnh);
      formState.pendingCnhFile = null;
      formState.removeCnh = false;
      updateCnhPreview(vehicle.proprietario_cnh);
      setOwnerResult(null);
    } else {
      radOwnerMorador.checked = true;
      setOwnerResult({
        condUsuarioId: vehicle.proprietario_cond_usuario_id || null,
        moradorId: vehicle.proprietario_morador_id || null,
        email: vehicle.proprietario_email || '',
        nome: vehicle.proprietario_nome || '',
        cpf: vehicle.proprietario_cpf || '',
        data_nascimento: vehicle.proprietario_data_nascimento || '',
        cnhNumero: vehicle.proprietario_cnh_numero || '',
        cnhCategoria: vehicle.proprietario_cnh_categoria || ''
      }, { forceFillFields: true, skipCnh: true, skipCnhPreview: true });
      inpOwnerEmail.value = vehicle.proprietario_email || '';
      formState.existingCnh = cloneObj(vehicle.proprietario_cnh);
      formState.pendingCnhFile = null;
      formState.removeCnh = false;
      updateCnhPreview(vehicle.proprietario_cnh);
      inpOwnerCnh.value = onlyDigits(vehicle.proprietario_cnh_numero || '').slice(0,11);
      selOwnerCateg.value = vehicle.proprietario_cnh_categoria || '';
    }
    toggleOwnerFields();
    selGaragemVinculo.checked = !!vehicle.garagem_id;
    updateGaragemSelect(vehicle.garagem_id ? String(vehicle.garagem_id) : '');
    btnFormCancelar.classList.remove('d-none');
    btnFormInserir.textContent = 'Salvar edição';
  }

  function formatBrDate(dateLike){
    const d = parseDateBRorISO(dateLike);
    if(!d) return '';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  async function readFileAsDataUrl(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  }

  async function collectFormData(editingVehicle){
    const errors = [];
    const placa = formatPlate(inpPlaca.value);
    if(!placa || placa.replace(/[^A-Z0-9]/g,'').length !== 7){ errors.push('Informe uma placa válida (formato Mercosul ou convencional).'); }

    const chassi = String(inpChassi.value || '').toUpperCase();
    const renavam = onlyDigits(inpRenavam.value).slice(0,11);

    const estado = selEstado.value || '';
    if(!estado){ errors.push('Selecione o estado de emplacamento.'); }
    const municipio = selMunicipio.disabled ? '' : normalizeMunicipioName(selMunicipio.value);
    if(selMunicipio && !selMunicipio.disabled && !municipio){ errors.push('Selecione o município de emplacamento.'); }

    const tipo = selTipo.value || '';
    if(!tipo){ errors.push('Selecione o tipo de veículo.'); }

    const marca = selMarca.value || '';
    if(!marca){ errors.push('Selecione a marca do veículo.'); }
    const marcaExtra = marca === '__outros__' ? String(inpMarcaExtra.value || '').toUpperCase() : '';
    if(marca === '__outros__' && !marcaExtra){ errors.push('Informe a marca do veículo.'); }

    const modelo = String(inpModelo.value || '').toUpperCase();
    if(!modelo){ errors.push('Informe o modelo do veículo.'); }
    const cor = String(inpCor.value || '').toUpperCase();
    if(!cor){ errors.push('Informe a cor do veículo.'); }

    const anoModelo = parseAnoModelo(inpAnoModelo.value);
    if(!anoModelo){ errors.push('Informe o ano/modelo no formato AAAA/AAAA (ano modelo igual ou até 1 ano superior).'); }

    const proprietarioTipo = radOwnerExterno.checked ? 'externo' : 'morador';
    let proprietarioNascimento = null;
    let proprietarioCnhCategoria = '';
    let proprietarioCnhNum = '';
    let proprietarioCpf = '';
    let proprietarioNome = '';
    let proprietarioEmail = '';
    let proprietarioCondUsuarioId = null;
    let proprietarioMoradorId = null;

    if(proprietarioTipo === 'morador'){
      if(!formState.owner){ errors.push('Busque e selecione o morador proprietário do veículo.'); }
      else {
        const ownerData = formState.owner;
        proprietarioNome = ownerData.nome || String(inpOwnerNome.value || '').trim();
        proprietarioEmail = ownerData.email || '';
        proprietarioCondUsuarioId = ownerData.condUsuarioId || ownerData._id || null;
        proprietarioMoradorId = ownerData.moradorId || ownerData.relMoradorId || null;
        const cpfFromInput = onlyDigits(inpOwnerCpf.value);
        const cpfFromOwner = ownerData.cpf ? onlyDigits(ownerData.cpf) : '';
        proprietarioCpf = cpfFromInput || cpfFromOwner;
        if(proprietarioCpf && proprietarioCpf.length !== 11){ errors.push('CPF do morador deve conter 11 dígitos.'); }
        const nascInput = inpOwnerNascimento.value;
        let nascimentoDate = nascInput ? parseDateBRorISO(nascInput) : null;
        if(!nascimentoDate && ownerData.dataNascimentoIso){ nascimentoDate = parseDateBRorISO(ownerData.dataNascimentoIso); }
        if(nascInput && !nascimentoDate){ errors.push('Data de nascimento do morador inválida.'); }
        proprietarioNascimento = nascimentoDate ? formatDateISO(nascimentoDate) : (ownerData.dataNascimentoIso || null);
        const cnhInput = onlyDigits(inpOwnerCnh.value).slice(0,11);
        const cnhOwner = ownerData.cnhNumero ? onlyDigits(ownerData.cnhNumero).slice(0,11) : '';
        proprietarioCnhNum = cnhInput || cnhOwner;
        proprietarioCnhCategoria = selOwnerCateg.value || ownerData.cnhCategoria || '';
      }
    } else {
      proprietarioNome = String(inpOwnerNome.value || '').trim();
      if(!proprietarioNome) errors.push('Informe o nome do proprietário.');
      proprietarioCpf = onlyDigits(inpOwnerCpf.value);
      if(proprietarioCpf && proprietarioCpf.length !== 11){ errors.push('CPF do proprietário deve conter 11 dígitos.'); }
      const dt = parseDateBRorISO(inpOwnerNascimento.value);
      if(inpOwnerNascimento.value && !dt){ errors.push('Data de nascimento do proprietário inválida.'); }
      proprietarioNascimento = dt ? formatDateISO(dt) : null;
      proprietarioCnhNum = onlyDigits(inpOwnerCnh.value).slice(0,11);
      proprietarioCnhCategoria = selOwnerCateg.value || '';
    }

    const vincularGaragem = !!selGaragemVinculo.checked;
    let garagemId = null;
    let garagemNome = '';
    let garagemCodigo = '';
    if(vincularGaragem){
      garagemId = selGaragem.value || '';
      if(!garagemId){ errors.push('Selecione a garagem a ser vinculada.'); }
      const opt = selGaragem.selectedOptions && selGaragem.selectedOptions[0];
      garagemNome = opt ? opt.textContent : '';
      garagemCodigo = opt ? opt.getAttribute('data-codigo') || '' : '';
    }

    if(errors.length){
      showToast(errors, 'warning');
      return null;
    }

    const vehicle = editingVehicle ? cloneObj(editingVehicle) : {};
    vehicle._id = vehicle._id || null;
    vehicle.placa = placa;
    vehicle.chassi = chassi;
    vehicle.renavam = renavam;
    vehicle.estado = estado;
    vehicle.municipio = municipio;
    vehicle.tipo = tipo;
    vehicle.marca = marca === '__outros__' ? 'Outro' : marca;
    vehicle.marca_extra = marca === '__outros__' ? marcaExtra : '';
    vehicle.modelo = modelo;
    vehicle.cor = cor;
    vehicle.ano = anoModelo ? anoModelo.ano : null;
    vehicle.ano_modelo = anoModelo ? anoModelo.ano_modelo : null;

    if(proprietarioTipo === 'externo'){
      vehicle.proprietario_tipo = 'externo';
      vehicle.proprietario_nome = proprietarioNome;
      vehicle.proprietario_email = '';
      vehicle.proprietario_cpf = proprietarioCpf;
      vehicle.proprietario_data_nascimento = proprietarioNascimento;
      vehicle.proprietario_cnh_numero = proprietarioCnhNum;
      vehicle.proprietario_cnh_categoria = proprietarioCnhCategoria;
      vehicle.proprietario_cond_usuario_id = null;
      vehicle.proprietario_morador_id = null;
    } else {
      vehicle.proprietario_tipo = 'morador';
      vehicle.proprietario_nome = proprietarioNome;
      vehicle.proprietario_email = proprietarioEmail;
      vehicle.proprietario_cpf = proprietarioCpf;
      vehicle.proprietario_data_nascimento = proprietarioNascimento;
      vehicle.proprietario_cnh_numero = proprietarioCnhNum;
      vehicle.proprietario_cnh_categoria = proprietarioCnhCategoria;
      vehicle.proprietario_cond_usuario_id = proprietarioCondUsuarioId;
      vehicle.proprietario_morador_id = proprietarioMoradorId;
    }

    vehicle.garagem_id = vincularGaragem ? garagemId : null;
    vehicle.garagem_nome = vincularGaragem ? garagemNome : '';
    vehicle.garagem_codigo = vincularGaragem ? garagemCodigo : '';

    // CRLV
    if(formState.removeCrlv){
      vehicle.crlv = { url:'', nome:'', mime:'', tamanho:null };
    } else if(formState.pendingCrlvFile){
      const file = formState.pendingCrlvFile;
      const fileData = await readFileAsDataUrl(file);
      vehicle.crlv = {
        nome: file.name,
        mime: file.type || '',
        tamanho: file.size || null,
        file: fileData
      };
    } else if(formState.existingCrlv){
      vehicle.crlv = cloneObj(formState.existingCrlv);
    } else {
      vehicle.crlv = vehicle.crlv || { url:'', nome:'', mime:'', tamanho:null };
    }

    // CNH
    if(formState.removeCnh){
      vehicle.proprietario_cnh = { url:'', nome:'', mime:'', tamanho:null };
    } else if(formState.pendingCnhFile){
      const file = formState.pendingCnhFile;
      const fileData = await readFileAsDataUrl(file);
      vehicle.proprietario_cnh = {
        nome: file.name,
        mime: file.type || '',
        tamanho: file.size || null,
        file: fileData
      };
    } else if(formState.existingCnh){
      vehicle.proprietario_cnh = cloneObj(formState.existingCnh);
    } else {
      vehicle.proprietario_cnh = vehicle.proprietario_cnh || { url:'', nome:'', mime:'', tamanho:null };
    }

    const fotosValidas = Array.isArray(formState.fotos) ? formState.fotos : [];
    vehicle.fotos = fotosValidas
      .map(entry => {
        const cloned = cloneObj(entry) || {};
        if(!cloned) return null;
        if(!cloned.file && !cloned.url) return null;
        return cloned;
      })
      .filter(Boolean)
      .slice(0, MAX_FOTO_FILES);

    return vehicle;
  }

  async function buscarProprietario(){
    const email = (inpOwnerEmail.value || '').trim().toLowerCase();
    if(!email){ showToast('Informe o e-mail do morador para buscar.', 'warning'); return; }
    const data = await fetchUsuariosLista(email);
    if(!Array.isArray(data) || !data.length){ showToast('Não foi possível localizar usuário com esse e-mail.', 'warning'); return; }
    const normalized = data.find(u => (u.email || '').toLowerCase() === email) || data[0];
    if(!normalized){ showToast('Usuário não encontrado.', 'warning'); return; }
    const vinculo = Array.isArray(normalized.vinculos) ? normalized.vinculos.find(v => String(v.habitacao_id || '') === String(state.hab?._id || '')) : null;
    const dadosGestor = normalized.dados || normalized.perfil || normalized.gestor || {};
    setOwnerResult({
      condUsuarioId: normalized._id || null,
      moradorId: vinculo && (vinculo.morador_id || vinculo.moradorId) ? (vinculo.morador_id || vinculo.moradorId) : null,
      email: normalized.email || email,
      nome: normalized.nome || '',
      cpf: normalized.cpf || dadosGestor.cpf || '',
      data_nascimento: normalized.data_nascimento || normalized.dataNascimento || dadosGestor.data_nascimento || dadosGestor.dataNascimento || '',
      cnhNumero: (dadosGestor.cnh && (dadosGestor.cnh.numero || dadosGestor.cnh.numero_cnh)) || dadosGestor.cnhNumero || '',
      cnhCategoria: (dadosGestor.cnh && dadosGestor.cnh.categoria) || dadosGestor.cnhCategoria || '',
      cnh_documento: (dadosGestor.cnh && (dadosGestor.cnh.arquivo || dadosGestor.cnh.documento)) || dadosGestor.cnh_documento || null,
      habitacaoLabel: vinculo && vinculo.hab_label ? vinculo.hab_label : ''
    }, { forceFillFields: true, forceFillCnh: true });
    if(!vinculo){
      showToast('Usuário localizado, mas não está vinculado a esta habitação. Confirme se o vínculo está correto.', 'info');
    }
  }

  async function handleInsert(){
    const editingVehicle = state.editingIndex != null ? state.veiculos[state.editingIndex] : null;
    const vehicle = await collectFormData(editingVehicle);
    if(!vehicle) return;
    if(!vehicle._id){ vehicle._id = editingVehicle && editingVehicle._id ? editingVehicle._id : null; }
    if(state.editingIndex != null){
      state.veiculos[state.editingIndex] = vehicle;
      showToast('Veículo atualizado na lista. Lembre-se de salvar as alterações.', 'success');
    } else {
      state.veiculos.push(vehicle);
      showToast('Veículo adicionado à lista. Lembre-se de salvar as alterações.', 'success');
    }
    renderLista();
    resetForm();
  }

  async function salvarVeiculos(){
    if(!state.hab || !state.hab._id){ showToast('Habitação inválida.', 'danger'); return; }
    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Salvando...';
    try{
      const payload = state.veiculos.map(prepareVehicleForSend);
      const res = await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(state.hab._id)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ veiculos: payload })
      });
      let data = null;
      try { data = await res.json(); } catch(_e){ data = null; }
      if(!res.ok || (data && data.error)){
        const errMsg = (data && data.error) ? data.error : 'Falha ao salvar veículos.';
        throw new Error(errMsg);
      }
      if(data && data.veiculos){
        state.veiculos = Array.isArray(data.veiculos) ? data.veiculos.map(normalizeVehicleFromServer).filter(Boolean) : [];
        state.hab = { ...state.hab, ...data };
        resetForm();
        renderLista();
      }
      showToast('Veículos salvos com sucesso.', 'success');
      try{ document.dispatchEvent(new CustomEvent('habitacao:lista:refresh')); }catch(_evt){}
    }catch(err){
      showToast(err && err.message ? err.message : 'Falha ao salvar veículos.', 'danger');
    }finally{
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Salvar alterações';
    }
  }

  async function loadGaragensForHab(habitacao){
    if(!habitacao) return;
    const unidadeId = habitacao.unidade && habitacao.unidade._id ? habitacao.unidade._id : habitacao.unidade_id || null;
    if(!unidadeId){ state.garagens = []; updateGaragemSelect(); return; }
    const data = await fetchJson(basePath + '/api/garagens/busca?unidade=' + encodeURIComponent(String(unidadeId)));
    const list = Array.isArray(data) ? data.filter(g => String(g.link_id || '') === String(habitacao._id || '')) : [];
    state.garagens = list.map(g => ({
      _id: g._id || g.id || null,
      nome: g.nome || 'Garagem',
      codigo: g.codigo || g.identificacao || ''
    }));
    updateGaragemSelect();
  }

  function populate(habitacao){
    state.hab = habitacao;
    state.proprietario = habitacao ? habitacao.proprietario || null : null;
    state.moradores = Array.isArray(habitacao && habitacao.moradores) ? habitacao.moradores : [];
    state.veiculos = Array.isArray(habitacao && habitacao.veiculos) ? habitacao.veiculos.map(normalizeVehicleFromServer).filter(Boolean) : [];
    state.original = state.veiculos.map(cloneObj);
    state.page = 0;
    if(elHab) elHab.textContent = formatHabLabel(habitacao);
    if(elProp) elProp.textContent = formatProprietarioLabel(state.proprietario);
    renderLista();
    resetForm();
    loadGaragensForHab(habitacao);
  }

  async function openModal(item){
    populate(item);
    await Promise.all([populateEstados(), ensureTipoOptions()]);
    await populateMarcas(selTipo.value || '', selMarca.value || '');
    // Refrescar dados do servidor
    (async function refreshFromServer(){
      try{
        const res = await fetch(basePath + '/api/habitacoes/' + encodeURIComponent(String(item._id)), { cache:'no-store' });
        if(!res.ok) return;
        const data = await res.json();
        if(data && data._id){
          populate(data);
        }
      }catch(_e){}
    })();
    bsModal.show();
  }

  // ===================== Eventos =====================
  selEstado.addEventListener('change', updateMunicipiosByEstado);
  selTipo.addEventListener('change', () => {
    populateMarcas(selTipo.value || '', '');
    inpMarcaExtra.value = '';
  });
  selMarca.addEventListener('change', toggleMarcaExtra);
  Array.from(document.querySelectorAll('input[name="veicOwnerTipo"]')).forEach(r => r.addEventListener('change', toggleOwnerFields));
  selGaragemVinculo.addEventListener('change', () => updateGaragemSelect(selGaragemVinculo.checked ? selGaragem.value : ''));

  inpPlaca.addEventListener('input', () => { inpPlaca.value = formatPlate(inpPlaca.value); });
  inpChassi.addEventListener('input', () => { inpChassi.value = String(inpChassi.value || '').toUpperCase().replace(/[^A-Z0-9]/g,''); });
  inpRenavam.addEventListener('input', () => { inpRenavam.value = onlyDigits(inpRenavam.value).slice(0,11); });
  inpModelo.addEventListener('input', () => { inpModelo.value = String(inpModelo.value || '').toUpperCase(); });
  inpCor.addEventListener('input', () => { inpCor.value = String(inpCor.value || '').toUpperCase(); });
  inpMarcaExtra.addEventListener('input', () => { inpMarcaExtra.value = String(inpMarcaExtra.value || '').toUpperCase(); });
  inpOwnerCpf.addEventListener('input', () => {
    const digits = onlyDigits(inpOwnerCpf.value).slice(0,11);
    let formatted = digits;
    if(digits.length > 3 && digits.length <= 6) formatted = `${digits.slice(0,3)}.${digits.slice(3)}`;
    else if(digits.length > 6 && digits.length <= 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`;
    else if(digits.length > 9) formatted = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
    inpOwnerCpf.value = formatted;
  });
  inpOwnerCnh.addEventListener('input', () => { inpOwnerCnh.value = onlyDigits(inpOwnerCnh.value).slice(0,11); });
  setupOwnerNascimentoPicker();

  btnOwnerBuscar.addEventListener('click', buscarProprietario);
  btnOwnerLimpar.addEventListener('click', () => { clearOwnerSelection(); });

  function handleFileChange(kind, inputEl){
    const file = inputEl.files && inputEl.files[0] ? inputEl.files[0] : null;
    if(!file){
      if(kind === 'crlv'){ formState.pendingCrlvFile = null; formState.removeCrlv = false; updateCrlvPreview(formState.existingCrlv); }
      else { formState.pendingCnhFile = null; formState.removeCnh = false; updateCnhPreview(formState.existingCnh); }
      return;
    }
    if(file.size > MAX_FILE_SIZE){
      showToast('Arquivo excede o limite de ~2MB.', 'warning');
      inputEl.value = '';
      if(kind === 'crlv'){ formState.pendingCrlvFile = null; updateCrlvPreview(formState.existingCrlv); }
      else { formState.pendingCnhFile = null; updateCnhPreview(formState.existingCnh); }
      return;
    }
    if(kind === 'crlv'){
      formState.pendingCrlvFile = file;
      formState.removeCrlv = false;
      updateCrlvPreview({ nome: file.name, tamanho: file.size });
    } else {
      formState.pendingCnhFile = file;
      formState.removeCnh = false;
      updateCnhPreview({ nome: file.name, tamanho: file.size });
    }
  }

  async function handleFotosInputChange(){
    if(!inpFotos) return;
    const files = Array.from(inpFotos.files || []);
    if(!files.length) return;
    if(!Array.isArray(formState.fotos)) formState.fotos = [];
    if(formState.fotos.length >= MAX_FOTO_FILES){
      showToast(`Já existem ${MAX_FOTO_FILES} fotos anexadas.`, 'info');
      inpFotos.value = '';
      return;
    }
    let reachedLimit = false;
    for(const file of files){
      if(formState.fotos.length >= MAX_FOTO_FILES){ reachedLimit = true; break; }
      if(file.size > MAX_FOTO_SIZE){
        showToast(`Arquivo ${file.name} excede o limite de 5MB.`, 'warning');
        continue;
      }
      const mime = (file.type || '').toLowerCase();
      if(mime && !mime.startsWith('image/')){
        showToast(`Arquivo ${file.name} não é uma imagem suportada.`, 'warning');
        continue;
      }
      try{
        const data = await readFileAsDataUrl(file);
        formState.fotos.push({
          nome: file.name,
          mime: file.type || '',
          tamanho: file.size || null,
          file: data
        });
        if(formState.fotos.length >= MAX_FOTO_FILES){
          reachedLimit = true;
        }
      }catch(err){
        console.warn('[modal_edit_hab_veiculo] falha ao ler foto', err);
        showToast(`Não foi possível ler o arquivo ${file.name}.`, 'danger');
      }
    }
    formState.fotos = formState.fotos.slice(0, MAX_FOTO_FILES);
    updateFotosPreview();
    inpFotos.value = '';
    if(reachedLimit){
      showToast(`Limite de ${MAX_FOTO_FILES} fotos atingido.`, 'info');
    }
  }

  inpCrlv.addEventListener('change', () => handleFileChange('crlv', inpCrlv));
  inpOwnerCnhFile.addEventListener('change', () => handleFileChange('cnh', inpOwnerCnhFile));
  if(inpFotos){
    inpFotos.addEventListener('change', () => { handleFotosInputChange(); });
  }

  btnCrlvRemover.addEventListener('click', () => {
    formState.removeCrlv = true;
    formState.pendingCrlvFile = null;
    formState.existingCrlv = null;
    inpCrlv.value = '';
    updateCrlvPreview(null);
  });
  btnCnhRemover.addEventListener('click', () => {
    formState.removeCnh = true;
    formState.pendingCnhFile = null;
    formState.existingCnh = null;
    inpOwnerCnhFile.value = '';
    updateCnhPreview(null);
  });

  btnFormLimpar.addEventListener('click', resetForm);
  btnFormCancelar.addEventListener('click', resetForm);
  btnFormInserir.addEventListener('click', handleInsert);
  btnSalvar.addEventListener('click', salvarVeiculos);
  btnFechar.addEventListener('click', () => { bsModal.hide(); });

  pageSizeSel.addEventListener('change', () => { state.page = 0; renderLista(); });
  listaBody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-role]');
    if(!btn) return;
    const idx = parseInt(btn.parentElement.parentElement.dataset.index || '-1', 10);
    if(isNaN(idx) || idx < 0) return;
    if(btn.dataset.role === 'edit'){
      setEditing(idx);
    } else if(btn.dataset.role === 'delete'){
      if(confirm('Deseja remover este veículo da lista?')){
        if(state.editingIndex === idx) resetForm();
        state.veiculos.splice(idx,1);
        renderLista();
      }
    }
  });

  document.addEventListener('habitacao:acao', function(ev){
    const detail = ev && ev.detail || {};
    if(detail.tipo !== 'veiculos') return;
    const item = detail.item || null;
    if(!item) return;
    openModal(item);
  });

  applyOwnerFieldState();
})();
