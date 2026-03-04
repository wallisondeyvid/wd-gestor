// STUB TEMPORÁRIO unidades: delega para nova versão em gestor
(function loadDelegated(){
  const script = document.createElement('script');
  script.src = '/gestor/js/pages/unidades.js';
  script.defer = true;
  document.head.appendChild(script);
})();
/* (restante removido: funcionalidade agora em gestor/js/pages/unidades.js) */

  (function hookResetForm(){
    const form = byId('cadastroUnidadeForm');
    if (!form) return;
    form.addEventListener('reset', () => {
      // espera o reset nativo e então limpa as options
      setTimeout(() => {
        const modSel = byId('modulosAcessiveis');
        if (modSel) {
          modSel.innerHTML = '';
          modSel.dispatchEvent(new Event('input',  { bubbles: true }));
          modSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 0);
    });
  })();

  // ===================== CNPJ: máscara e validação via utils/masks.js =====================
  const initCNPJMask = () => {
    if (!cnpjEl || !window.WDMasks || !window.WDMasks.formatCNPJ || !window.WDMasks.isValidCNPJ) {
      console.log('[unidades.js] Aguardando carregamento das funções CNPJ...');
      setTimeout(initCNPJMask, 100);
      return;
    }

    cnpjEl.addEventListener('input', () => {
      cnpjEl.value = window.WDMasks.formatCNPJ(cnpjEl.value);
      const digits = cnpjEl.value.replace(/\D/g, '');
      if (digits.length === 14) {
        const ok = window.WDMasks.isValidCNPJ(cnpjEl.value);
        window.WDMasks.setValidity(cnpjEl, ok);
      } else {
        cnpjEl.classList.remove('is-valid', 'is-invalid');
      }
    });
    cnpjEl.addEventListener('blur', () => {
      const digits = cnpjEl.value.replace(/\D/g, '');
      const ok = window.WDMasks.isValidCNPJ(cnpjEl.value);
      window.WDMasks.setValidity(cnpjEl, ok);
      if (!ok && digits.length === 14) alert('CNPJ inválido');
    });
    cnpjEl.value = window.WDMasks.formatCNPJ(cnpjEl.value);
    console.log('[unidades.js] Máscara CNPJ inicializada');
  };

  const cnpjEl = byId('cnpj');
  if (cnpjEl) {
    initCNPJMask();
  }

  // ===================== Matriz × Filial =====================
  function setPrincipalSelect(isMatriz) {
    const sel = byId('unidadePrincipal');
    if (!sel) return;
    console.log('[setPrincipalSelect] Chamado com isMatriz:', isMatriz);
    console.log('[setPrincipalSelect] Valor atual do select antes:', sel.value);
    sel.disabled = !!isMatriz;   // desativa quando Matriz
    sel.required = !isMatriz;    // exige quando Filial
    if (isMatriz) {
      sel.value = ''; // limpa se voltar para Matriz
      console.log('[setPrincipalSelect] Select limpo porque é matriz');
    }
    console.log('[setPrincipalSelect] Valor final do select:', sel.value);
    try { window.DiretorModule?.atualizarVisibilidade?.(); } catch {}
  }

  // ===================== Restrições para Diretores =====================
  function initDiretorRestrictions() {
    // Verificar se o usuário atual é diretor
    const userRole = window.userRole || '<%= user ? user.role : "" %>';
    const isDiretor = userRole === 'diretor';

    if (!isDiretor) return;

    console.log('[DIRETOR RESTRICTIONS] Aplicando restrições para diretor');

    // 1. Garantir que sempre esteja selecionado "Filial"
    const filialRadio = byId('filial');
    const matrizRadio = byId('matriz');
    const unidadePrincipalSelect = byId('unidadePrincipalSelect');
    const unidadePrincipal = byId('unidadePrincipal');

    if (filialRadio && matrizRadio) {
      // Forçar seleção de filial
      filialRadio.checked = true;
      matrizRadio.checked = false;

      // Desabilitar mudança de seleção
      matrizRadio.disabled = true;
      filialRadio.disabled = true;

      console.log('[DIRETOR RESTRICTIONS] Filial selecionada e bloqueada para diretores');
    }

    // 2. Sempre mostrar e tornar obrigatório o select de unidade principal
    if (unidadePrincipalSelect) {
      unidadePrincipalSelect.style.display = 'block';
    }

    if (unidadePrincipal) {
      unidadePrincipal.required = true;
      unidadePrincipal.disabled = false;
      console.log('[DIRETOR RESTRICTIONS] Select de matriz tornado obrigatório');
    }

    // 3. Aplicar estado inicial correto
    setPrincipalSelect(false); // false = filial, então select deve estar habilitado

    // 4. Prevenir qualquer tentativa de mudança via JavaScript
    const preventRadioChange = (ev) => {
      if (ev.target && ev.target.matches('input[name="tipoUnidade"]') && ev.target.value === 'matriz') {
        ev.preventDefault();
        ev.stopPropagation();
        console.log('[DIRETOR RESTRICTIONS] Tentativa de seleção de matriz bloqueada');
        return false;
      }
    };

    document.addEventListener('change', preventRadioChange, true);
    document.addEventListener('click', preventRadioChange, true);
  }

  // Inicializar restrições para diretores
  initDiretorRestrictions();

  // ===================== Pessoa Física × Jurídica =====================
  function togglePessoaFields(isPessoaFisica) {
    const cpfEl = byId('cpf');
    const cnpjEl = byId('cnpj');

    if (isPessoaFisica) {
      // Pessoa Física: CPF ativo, CNPJ desativado
      if (cpfEl) {
        cpfEl.disabled = false;
        cpfEl.required = true;
        cpfEl.value = window.WDMasks ? window.WDMasks.formatCPF(cpfEl.value) : cpfEl.value;
      }
      if (cnpjEl) {
        cnpjEl.disabled = true;
        cnpjEl.required = false;
        cnpjEl.value = '';
      }
    } else {
      // Pessoa Jurídica: CNPJ ativo, CPF desativado
      if (cpfEl) {
        cpfEl.disabled = true;
        cpfEl.required = false;
        cpfEl.value = '';
      }
      if (cnpjEl) {
        cnpjEl.disabled = false;
        cnpjEl.required = true;
        cnpjEl.value = window.WDMasks ? window.WDMasks.formatCNPJ(cnpjEl.value) : cnpjEl.value;
      }
    }
  }

  // Estado inicial: Pessoa Física selecionada
  togglePessoaFields(true);

  // Alternar campos quando mudar seleção PF/PJ
  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.matches('input[name="pessoaTipo"]')) {
      togglePessoaFields(ev.target.value === 'pf');
    }
  });

  // Aplicar máscaras CPF
  const cpfEl = byId('cpf');
  if (cpfEl && window.WDMasks && window.WDMasks.formatCPF) {
    cpfEl.addEventListener('input', () => {
      cpfEl.value = window.WDMasks.formatCPF(cpfEl.value);
      const digits = cpfEl.value.replace(/\D/g, '');
      if (digits.length === 11) {
        const ok = window.WDMasks.isValidCPF(cpfEl.value);
        window.WDMasks.setValidity(cpfEl, ok);
      } else {
        cpfEl.classList.remove('is-valid', 'is-invalid');
      }
    });
    cpfEl.addEventListener('blur', () => {
      const digits = cpfEl.value.replace(/\D/g, '');
      const ok = window.WDMasks.isValidCPF(cpfEl.value);
      window.WDMasks.setValidity(cpfEl, ok);
      if (!ok && digits.length === 11) alert('CPF inválido');
    });
  }

  // ===================== Telefones & E-mails =====================
  // Aguardar carregamento completo do masks.js
  const initMasks = () => {
    const telFixo = byId('telefoneFixo');
    const telCel  = byId('telefoneCelular');
    const emailPrin = byId('emailPrincipal');
    const emailFis  = byId('emailFiscal');

    console.log('[unidades.js] Inicializando máscaras:', {
      telFixo: !!telFixo,
      telCel: !!telCel,
      emailPrin: !!emailPrin,
      emailFis: !!emailFis,
      WDMasks: !!window.WDMasks
    });

    if (telFixo && window.WDMasks && window.WDMasks.applyPhoneMask) {
      telFixo.addEventListener('input', () => {
        window.WDMasks.applyPhoneMask(telFixo);
      });
      console.log('[unidades.js] Máscara telefone fixo aplicada');
    }

    if (telCel && window.WDMasks && window.WDMasks.applyPhoneMask) {
      telCel.addEventListener('input', () => {
        window.WDMasks.applyPhoneMask(telCel);
      });
      console.log('[unidades.js] Máscara telefone celular aplicada');
    }

    if (emailPrin && window.WDMasks && window.WDMasks.validateEmail) {
      emailPrin.addEventListener('blur', () => {
        window.WDMasks.validateEmail(emailPrin);
        console.log('[unidades.js] Validação email principal aplicada');
      });
    }

    if (emailFis && window.WDMasks && window.WDMasks.validateEmail) {
      emailFis.addEventListener('blur', () => {
        window.WDMasks.validateEmail(emailFis);
        console.log('[unidades.js] Validação email fiscal aplicada');
      });
    }

    // ===================== Máscara e validação de URL (Site) =====================
    const siteEl = byId('site');
    if (siteEl && window.WDMasks && window.WDMasks.applyURLMask) {
      window.WDMasks.applyURLMask(siteEl);
      console.log('[unidades.js] Máscara URL (site) aplicada');
    }
  };

  // Ouvir evento de carregamento do masks.js
  document.addEventListener('masksLoaded', (e) => {
    console.log('[unidades.js] Evento masksLoaded recebido');
    initMasks();
  });

  // Tentar inicializar imediatamente caso já esteja carregado
  if (window.WDMasks) {
    initMasks();
  }


  // ===================== PIX: detecção, máscara e validação =====================
  function detectarTipoPix(chave) {
    if (!chave) return '';
    const valor = String(chave).trim();

    // Verificar se é CPF (11 dígitos)
    const cpfDigits = valor.replace(/\D/g, '');
    if (cpfDigits.length === 11 && window.WDMasks?.isValidCPF(cpfDigits)) {
      return 'cpf';
    }

    // Verificar se é CNPJ (14 dígitos)
    if (cpfDigits.length === 14 && window.WDMasks?.isValidCNPJ(cpfDigits)) {
      return 'cnpj';
    }

    // Verificar se é e-mail
    if (window.WDMasks?.isValidEmail(valor)) {
      return 'email';
    }

    // Verificar se é telefone (10-11 dígitos ou formato brasileiro)
    const telefoneDigits = valor.replace(/\D/g, '');
    if (telefoneDigits.length >= 10 && telefoneDigits.length <= 11) {
      return 'telefone';
    }

    // Se não for nenhum dos tipos específicos, é aleatório
    return valor ? 'aleatoria' : '';
  }

  function selecionarTipoPix(tipo) {
    if (!tipo) return;
    const radios = document.querySelectorAll('input[name="tipoPix"]');
    let found = false;
    radios.forEach(r => {
      if (r.value === tipo) {
        r.checked = true;
        found = true;
      } else {
        r.checked = false;
      }
    });
    if (found) {
      const hidden = byId('tipoPixHidden');
      if (hidden) hidden.value = tipo;
    }
    return found;
  }

  function aplicarMascaraPix() {
    const pixEl = byId('pixChave');
    if (!pixEl || !window.WDMasks) return;

    const tipo = document.querySelector('input[name="tipoPix"]:checked')?.value || '';
    const raw = String(pixEl.value || '');

    if (tipo === 'cpf') {
      pixEl.value = window.WDMasks.formatCPF(raw);
    } else if (tipo === 'cnpj') {
      pixEl.value = window.WDMasks.formatCNPJ(raw);
    } else if (tipo === 'telefone') {
      pixEl.value = window.WDMasks.formatTelefone(raw);
    } else if (tipo === 'email') {
      // E-mail não precisa de máscara específica
      pixEl.value = raw;
    } else if (tipo === 'aleatoria') {
      // Campo livre, limita a 120 caracteres
      pixEl.value = raw.slice(0, 120);
    }
  }

  function validarChavePix() {
    const pixEl = byId('pixChave');
    if (!pixEl || !window.WDMasks) return true;

    const tipo = document.querySelector('input[name="tipoPix"]:checked')?.value || '';
    const valor = pixEl.value.trim();

    if (!valor) return true; // Campo vazio é válido

    let isValid = true;
    let errorMessage = '';

    if (tipo === 'cpf') {
      isValid = window.WDMasks.isValidCPF(valor);
      errorMessage = 'CPF inválido';
    } else if (tipo === 'cnpj') {
      isValid = window.WDMasks.isValidCNPJ(valor);
      errorMessage = 'CNPJ inválido';
    } else if (tipo === 'email') {
      isValid = window.WDMasks.isValidEmail(valor);
      errorMessage = 'E-mail inválido';
    } else if (tipo === 'telefone') {
      // Para telefone, apenas verifica se tem dígitos suficientes
      const digits = valor.replace(/\D/g, '');
      isValid = digits.length >= 10 && digits.length <= 11;
      errorMessage = 'Telefone inválido';
    } else if (tipo === 'aleatoria') {
      // Campo livre, sempre válido
      isValid = true;
    }

    if (!isValid) {
      alert(`${errorMessage}. Tipo alterado para "Aleatório".`);
      selecionarTipoPix('aleatoria');
      aplicarMascaraPix();
    }

    return isValid;
  }

  function detectarEAplicarMascaraPix({ forcar = false } = {}) {
    const pixEl = byId('pixChave');
    if (!pixEl) return;

    const atual = pixEl.value;
    const tipoSelecionado = document.querySelector('input[name="tipoPix"]:checked')?.value;
    const tipoDetectado = detectarTipoPix(atual);

    // Se não há tipo selecionado ou forçado, tenta detectar automaticamente
    if (!tipoSelecionado || forcar) {
      if (tipoDetectado) {
        selecionarTipoPix(tipoDetectado);
      }
    }

    aplicarMascaraPix();
  }

  // Listeners PIX
  const radiosPix = document.querySelectorAll('input[name="tipoPix"]');
  radiosPix.forEach(r => r.addEventListener('change', () => {
    const hidden = byId('tipoPixHidden');
    if (hidden) hidden.value = r.value;

    // Se mudou para CPF/CNPJ, tenta preencher com os valores dos campos correspondentes
    if (r.value === 'cpf' && byId('cpf') && byId('pixChave')) {
      const cpfValue = byId('cpf').value;
      if (cpfValue) byId('pixChave').value = cpfValue;
    } else if (r.value === 'cnpj' && cnpjEl && byId('pixChave')) {
      const cnpjValue = cnpjEl.value;
      if (cnpjValue) byId('pixChave').value = cnpjValue;
    }

    detectarEAplicarMascaraPix({ forcar: true });
  }));

  const pixEl = byId('pixChave');
  if (pixEl) {
    pixEl.addEventListener('input', () => detectarEAplicarMascaraPix());
    pixEl.addEventListener('blur', () => {
      detectarEAplicarMascaraPix({ forcar: true });
      validarChavePix();
    });
  }

  // ===================== Agência/Conta: filtros =====================
  (function filtroAgenciaConta() {
    function filtrar(el, regex, upper) {
      if (!el) return;
      el.addEventListener('input', () => {
        let v = el.value; let n = v.replace(regex,''); if (upper) n = n.toUpperCase(); if (n !== v) el.value = n;
      });
    }
    filtrar(byId('agenciaNumero'), /[^0-9]/g, false);
    filtrar(byId('agenciaDV'),     /[^0-9xX]/g, true);
    filtrar(byId('contaNumero'),   /[^0-9]/g, false);
    filtrar(byId('contaDV'),       /[^0-9xX]/g, true);
  })();

  // ===================== Tabela: filiais expand/collapse =====================
  function reclasificarFiliaisOrfas(principalId) {
    try {
      if (!principalId) return;
      const candidatas = Array.from(document.querySelectorAll('tr.unidade-row'))
        .filter(tr => tr.getAttribute('data-id') !== principalId)
        .filter(tr => !tr.classList.contains('filial-row'))
        .filter(tr => tr.getAttribute('data-unidade-principal-id') === principalId);
      candidatas.forEach(tr => { tr.classList.add('filial-row', `filial-of-${principalId}`); tr.style.display = 'none'; });
    } catch(e) { console.warn('Reclass filiais órfãs:', e); }
  }
  function inicializarFiliaisOrfas() {
    const principais = Array.from(document.querySelectorAll('tr.unidade-row[data-principal="true"]'));
    principais.forEach(tr => reclasificarFiliaisOrfas(tr.getAttribute('data-id')));
  }
  function toggleFiliais(principalId, forceState) {
    if (!principalId) return;
    reclasificarFiliaisOrfas(principalId);
    let filialRows = document.querySelectorAll(`.filial-of-${principalId}`);
    if (!filialRows.length) return;
    const btn = document.querySelector(`button.toggle-filiais[data-principal-id="${principalId}"]`);
    let expandir = forceState;
    if (expandir === undefined) {
      const algumVisivel = Array.from(filialRows).some(r => (r.style.display !== 'none') && (getComputedStyle(r).display !== 'none'));
      expandir = !algumVisivel;
    }
    filialRows.forEach(r => {
      if (expandir) { r.classList.remove('filial-hidden'); r.style.display = 'table-row'; }
      else { r.classList.add('filial-hidden'); r.style.display = 'none'; }
    });
    if (btn) {
      btn.innerHTML = expandir ? '&#9662;' : '&#9656;';
      btn.setAttribute('aria-expanded', expandir ? 'true' : 'false');
      btn.setAttribute('data-state',    expandir ? 'expanded' : 'collapsed');
      btn.title = expandir ? 'Recolher filiais' : 'Expandir filiais';
    }
    if (expandir) {
      try {
        const primeiro = filialRows[0];
        if (primeiro) {
          primeiro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          primeiro.classList.add('filial-expanded-highlight');
          setTimeout(()=> primeiro.classList.remove('filial-expanded-highlight'), 2000);
        }
      } catch(_) {}
    }
  }
  inicializarFiliaisOrfas();
  document.addEventListener('click', function(e){
    const origem = e.target.closest('button.toggle-filiais');
    if (!origem) return;
    if (origem.__busyToggle) return;
    origem.__busyToggle = true; setTimeout(()=> origem.__busyToggle = false, 250);
    const principalId = origem.getAttribute('data-principal-id');
    if (principalId) toggleFiliais(principalId);
  });
  document.querySelectorAll('tr.filial-row').forEach(tr => { tr.classList.add('filial-hidden'); tr.style.display = 'none'; });

  // ===================== Edição (preencher formulário) =====================
  function setVal(id, val){ const el = byId(id); if (el != null && val !== undefined && val !== null) el.value = val; }

  function prepararBotoesEdicao(){
    const submitBtn = document.querySelector('#cadastroUnidadeForm button[type="submit"]');
    if (submitBtn) {
      // Texto puro: Salvar
      submitBtn.textContent = 'Salvar';
      submitBtn.classList.remove('btn-outline-secondary');
      submitBtn.classList.add('btn-outline-primary');
      submitBtn.title = 'Salvar';
      submitBtn.setAttribute('aria-label', 'Salvar');

      if (!byId('cancelarEdicaoBtn')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-secondary ms-2';
        btn.id = 'cancelarEdicaoBtn';
        btn.title = 'Cancelar edição';
        btn.setAttribute('aria-label', 'Cancelar edição');
        // Texto puro: Cancelar
        btn.textContent = 'Cancelar';
        btn.onclick = cancelarEdicao;
        submitBtn.after(btn);
      }
    }
  }

  function preencherModulos(u){
    const modSel = byId('modulosAcessiveis');
    if (!modSel) return;
    const ids = (u.modulosAcessiveis || []).map(x => x && (x._id || x).toString());
    const todos = Array.isArray(window.todosModulos) ? window.todosModulos : [];
    const map = new Map(todos.map(m => [String(m._id), m]));
    modSel.innerHTML='';
    ids.forEach(id => {
      const m = map.get(String(id)); if (!m) return;
      const opt=document.createElement('option');
      opt.value=String(m._id); opt.textContent=m.nome + (m.status==='inativo'?' (inativo)':'');
      opt.selected=true; modSel.appendChild(opt);
    });
  }

  function preencherDiretor(u){
    try {
      const hiddenDiretorId = byId('diretor_usuario_id');
      const displayDiretor = byId('diretorUsuarioDisplay');
      const blocoDiretor   = byId('blocoDiretor');
      if (hiddenDiretorId && displayDiretor && blocoDiretor) {
        if (u.is_principal) {
          blocoDiretor.style.display='';
          const idSel = u.diretor_usuario_id ? String(u.diretor_usuario_id) : '';
          hiddenDiretorId.value = idSel;
          if (idSel && window.DiretorModule?.setDiretorById) {
            window.DiretorModule.setDiretorById(idSel);
          } else if (!idSel) {
            displayDiretor.value='';
          }
        } else {
          hiddenDiretorId.value=''; displayDiretor.value=''; blocoDiretor.style.display='none';
        }
      }
    } catch(_){ }
  }

  function dispararChangeMatriz(){ try { const m2=byId('matriz'); if (m2) m2.dispatchEvent(new Event('change',{bubbles:true})); } catch(_){ } }

  window.editar = function editar(id) {
    const cache = (Array.isArray(window.unidadesFiltradas) ? window.unidadesFiltradas : []).find(u => String(u._id) === String(id)) || {};
    // preenchimento rápido
    (function preencherBasico(u){
      const idEl = byId('unidadeId'); if (idEl && u._id) idEl.value = u._id;
      setVal('nomeFantasia', u.nome);
      setVal('razaoSocial', u.razaoSocial);
      setVal('cnpj', Validators.formatarCNPJInput(u.cnpj || ''));
      setVal('cpf', u.cpf || '');
      setVal('endereco', u.endereco);
    })(cache);

    // detalhe completo
    fetch(`/api/unidades/${id}`, {
      credentials: 'same-origin'
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(preencherCompleto)
      .catch(() => preencherCompleto(cache));

    function preencherCompleto(u){
      if (!u) return;
      setVal('unidadeId', u._id);
      setVal('nomeFantasia', u.nome);
      setVal('razaoSocial', u.razaoSocial);
      setVal('cnpj', Validators.formatarCNPJInput(u.cnpj || ''));
      setVal('cpf', u.cpf || '');
      setVal('endereco', u.endereco);
      setVal('inscricaoEstadual', u.inscricaoEstadual);
      try { const ieEl = byId('inscricaoEstadual'); if (ieEl){ ieEl.dispatchEvent(new Event('input',{bubbles:true})); ieEl.dispatchEvent(new Event('blur',{bubbles:true})); } } catch(_){ }
      setVal('inscricaoMunicipal', u.inscricaoMunicipal);
      setVal('cnaePrincipal', u.cnaePrincipal);
      setVal('cnaeSecundarios', u.cnaeSecundarios);
      setVal('regimeTributario', u.regimeTributario);
      setVal('naturezaJuridica', u.naturezaJuridica);
      setVal('dataAbertura', u.dataAbertura ? u.dataAbertura.split('T')[0] : '');
      setVal('telefoneFixo', u.telefoneFixo);
      setVal('telefoneCelular', u.telefoneCelular);
      setVal('emailPrincipal', u.emailPrincipal);
      setVal('emailFiscal', u.emailFiscal);
      setVal('site', u.site);
      setVal('banco', u.banco);

      if (u.agencia) {
        const partsAg = String(u.agencia).split('-');
        setVal('agenciaNumero', partsAg[0] || '');
        setVal('agenciaDV', partsAg[1] || '');
      } else { setVal('agenciaNumero',''); setVal('agenciaDV',''); }
      if (u.contaCorrente) {
        const partsCc = String(u.contaCorrente).split('-');
        setVal('contaNumero', partsCc[0] || '');
        setVal('contaDV', partsCc[1] || '');
      } else { setVal('contaNumero',''); setVal('contaDV',''); }

      setVal('pixChave', u.pixChave);

      // Tipo pix
      (function(){
        const radios = document.querySelectorAll('input[name="tipoPix"]');
        if (!radios.length) return;
        let tipo = (u.tipoPix || '').trim();
        const chave = (u.pixChave || '').trim();
        if (!tipo && chave) {
          const dig = chave.replace(/\D/g,'');
          if (dig.length === 14) tipo = 'cnpj';
          else if (dig.length === 11) tipo = 'cpf';
          else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(chave)) tipo = 'email';
          else if (/^\+?\d{10,15}$/.test(dig)) tipo = 'telefone';
          else if (chave) tipo = 'aleatoria';
        }
        radios.forEach(r => r.checked = (r.value === tipo));
        const hidden = byId('tipoPixHidden'); if (hidden) hidden.value = tipo;
      })();

      // Aplicar máscara e validação PIX após preencher os dados
      setTimeout(() => detectarEAplicarMascaraPix({ forcar: true }), 100);

      // Tipo de unidade
      const matrizInput = byId('matriz');
      const filialInput = byId('filial');
      if (matrizInput && filialInput) {
        console.log('[EDITAR] Definindo radios - is_principal:', u.is_principal);
        matrizInput.checked = !!u.is_principal;
        filialInput.checked  = !u.is_principal;
      }
      // aplica a regra do select conforme o tipo
      setPrincipalSelect(!!u.is_principal);

      // Pequeno delay para garantir que o DOM seja atualizado
      setTimeout(() => {
        if (!u.is_principal) {
          const unidadePrincipalId = u.unidade_principal_id ? String(u.unidade_principal_id) : '';
          setVal('unidadePrincipal', unidadePrincipalId);
          console.log('[EDITAR] Definindo unidade principal:', unidadePrincipalId);
          console.log('[EDITAR] Valor original unidade_principal_id:', u.unidade_principal_id);
          console.log('[EDITAR] Tipo do valor:', typeof u.unidade_principal_id);

          // Disparar evento change para garantir que o select seja atualizado
          const selectEl = byId('unidadePrincipal');
          if (selectEl) {
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[EDITAR] Select unidadePrincipal atualizado');
            console.log('[EDITAR] Valor atual do select:', selectEl.value);
          }
        }
      }, 100);

      prepararBotoesEdicao();
      preencherModulos(u);
      preencherDiretor(u);
      dispararChangeMatriz();

      // Definir tipo de pessoa baseado no campo pessoaTipo do banco
      const pessoaTipoRadios = document.querySelectorAll('input[name="pessoaTipo"]');
      console.log('[EDITAR] pessoaTipo:', u.pessoaTipo, 'CPF:', u.cpf, 'CNPJ:', u.cnpj);

      if (pessoaTipoRadios.length > 0 && u.pessoaTipo) {
        pessoaTipoRadios.forEach(radio => {
          if (radio.value === u.pessoaTipo) radio.checked = true;
        });
      } else {
        // Fallback: inferir baseado nos dados (CPF/CNPJ)
        if (u.cpf) {
          pessoaTipoRadios.forEach(radio => {
            if (radio.value === 'pf') radio.checked = true;
          });
        } else if (u.cnpj) {
          pessoaTipoRadios.forEach(radio => {
            if (radio.value === 'pj') radio.checked = true;
          });
        }
      }

      // Disparar evento change para atualizar campos
      setTimeout(() => {
        const checkedRadio = document.querySelector('input[name="pessoaTipo"]:checked');
        if (checkedRadio) {
          checkedRadio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 100);

      // Aplicar máscara do site se disponível
      const siteEl = byId('site');
      if (siteEl && window.WDMasks && window.WDMasks.applyURLMask) {
        window.WDMasks.applyURLMask(siteEl);
      }
    }
  };

  window.cancelarEdicao = function cancelarEdicao() {
    const form = byId('cadastroUnidadeForm');
    if (!form) return;
    form.reset();
    const unidadeId = byId('unidadeId'); if (unidadeId) unidadeId.value = '';
    const matriz = byId('matriz'); if (matriz) matriz.disabled = false;
    const filial = byId('filial'); if (filial) filial.disabled = false;
    const submitBtn = document.querySelector('#cadastroUnidadeForm button[type="submit"]');
    if (submitBtn) {
      // Texto puro: Cadastrar
      submitBtn.textContent = 'Cadastrar';
      submitBtn.title = 'Cadastrar';
      submitBtn.setAttribute('aria-label', 'Cadastrar');
      submitBtn.classList.remove('btn-outline-secondary');
      submitBtn.classList.add('btn-outline-primary');
    }
    const btn = byId('cancelarEdicaoBtn'); if (btn) btn.remove();
    const modSel = byId('modulosAcessiveis'); if (modSel) modSel.innerHTML = '';
    try { const hid = byId('diretor_usuario_id'); const disp = byId('diretorUsuarioDisplay'); if (hid) hid.value = ''; if (disp) disp.value = ''; } catch(_){ }
    if (window.DiretorModule?.atualizarVisibilidade) window.DiretorModule.atualizarVisibilidade();

    // volta a regra inicial do select (sempre desativado)
    setPrincipalSelect(true);
  };

  // ===================== Delegação de ações na tabela =====================
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    try {
      if (action === 'editar') {
        const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
        if (id) window.editar(id);
      }
      if (action === 'excluir') {
        const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Tem certeza que deseja excluir esta unidade?')) return;
        const res = await fetch(`/api/unidades/${id}`, { 
          method: 'DELETE', 
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin'
        });
        if (res.ok) location.reload();
        else { const data = await res.json().catch(() => ({})); alert(data.error || 'Falha ao excluir a unidade.'); }
      }
      if (action === 'toggleAccess') {
        const checks = Array.from(document.querySelectorAll('.unit-checkbox:checked'));
        if (!checks.length) { alert('Selecione ao menos uma unidade.'); return; }
        const ids = checks.map(ch => ch.getAttribute('data-id'));
        const allActive = checks.every(ch => String(ch.closest('tr')?.getAttribute('data-is-active')) === 'true');
        const activate = !allActive;
        const res = await fetch('/api/unidades/toggle-access', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ unitIds: ids, activate })
        });
        if (res.ok) location.reload();
        else { const data = await res.json().catch(() => ({})); alert(data.error || 'Não foi possível atualizar o acesso.'); }
      }
    } catch (err) {
      console.error('Ação falhou:', action, err);
      alert('Falha na ação: ' + (action || ''));
    }
  });

  // ===================== Submit do formulário =====================
  window.cadastrarUnidade = async function (e) {
    console.log('[FRONTEND] Função cadastrarUnidade chamada');
    try {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();

      // CNPJ
      if (cnpjEl) {
        console.log('[FRONTEND] Validando CNPJ:', cnpjEl.value);
        const ok = validarCNPJValor(cnpjEl.value);
        console.log('[FRONTEND] CNPJ válido:', ok);
        if (!ok) { marcarCNPJInvalido(cnpjEl, true); alert('CNPJ inválido'); return false; }
      }

      // CPF (se pessoa física selecionada)
      const pessoaTipo = document.querySelector('input[name="pessoaTipo"]:checked')?.value;
      console.log('[FRONTEND] pessoaTipo selecionado:', pessoaTipo);
      const cpfEl = byId('cpf');
      if (pessoaTipo === 'pf' && cpfEl) {
        const cpfDigits = cpfEl.value.replace(/\D/g, '');
        if (cpfDigits.length !== 11) {
          cpfEl.classList.add('is-invalid');
          alert('CPF deve ter 11 dígitos');
          return false;
        }
        const ok = window.WDMasks && window.WDMasks.isValidCPF ? window.WDMasks.isValidCPF(cpfEl.value) : false;
        if (!ok) {
          cpfEl.classList.add('is-invalid');
          alert('CPF inválido');
          return false;
        }
      }

      // IE por UF
      const ieEl = byId('inscricaoEstadual');
      const enderecoEl = byId('endereco');
      const ufAtual = extrairUFDoEndereco(enderecoEl ? enderecoEl.value : '');
      const ieOk = validarIEPorUF(ieEl ? ieEl.value : '', ufAtual);
      if (!ieOk) {
        if (ieEl) { ieEl.classList.add('is-invalid'); ieEl.style.borderColor = 'red'; ieEl.title = ufAtual ? `Inscrição Estadual inválida para ${ufAtual}` : 'Inscrição Estadual inválida'; }
        alert(`Inscrição Estadual inválida${ufAtual ? ' para ' + ufAtual : ''}. Verifique o formato.`);
        return false;
      }

      const unidadeId = byId('unidadeId')?.value || '';
      const isEdit = !!unidadeId;
      const isMatriz = !!byId('matriz')?.checked;
      const isFilial = !!byId('filial')?.checked;
      const unidadePrincipal = byId('unidadePrincipal')?.value || '';

      const pixChaveVal = byId('pixChave')?.value?.trim() || '';
      let tipoPixVal = (document.querySelector('input[name="tipoPix"]:checked')?.value) || byId('tipoPixHidden')?.value || '';
      if (!tipoPixVal && pixChaveVal) {
        selecionarTipoPix(detectarTipoPix(pixChaveVal));
        tipoPixVal = (document.querySelector('input[name="tipoPix"]:checked')?.value) || byId('tipoPixHidden')?.value || '';
      }

      const modSel = byId('modulosAcessiveis');
      const modulos = modSel ? Array.from(modSel.options).filter(o => o.selected).map(o => o.value) : [];
      const diretorId = isMatriz ? (byId('diretor_usuario_id')?.value || '') : '';

      const payload = {
        nomeFantasia: byId('nomeFantasia')?.value || '',
        razaoSocial:  byId('razaoSocial')?.value || '',
        cnpj:         byId('cnpj')?.value || '',
        cpf:          byId('cpf')?.value || '',
        pessoaTipo:   document.querySelector('input[name="pessoaTipo"]:checked')?.value || '',
        endereco:     byId('endereco')?.value || '',
        inscricaoEstadual:  byId('inscricaoEstadual')?.value || '',
        inscricaoMunicipal: byId('inscricaoMunicipal')?.value || '',
        cnaePrincipal:      byId('cnaePrincipal')?.value || '',
        cnaeSecundarios:    byId('cnaeSecundarios')?.value || '',
        regimeTributario:   byId('regimeTributario')?.value || '',
        naturezaJuridica:   byId('naturezaJuridica')?.value || '',
        dataAbertura:       byId('dataAbertura')?.value || '',
        telefoneFixo:       byId('telefoneFixo')?.value || '',
        telefoneCelular:    byId('telefoneCelular')?.value || '',
        emailPrincipal:     byId('emailPrincipal')?.value || '',
        emailFiscal:        byId('emailFiscal')?.value || '',
        site:               byId('site')?.value || '',
        banco:              byId('banco')?.value || '',
        agencia: '',
        contaCorrente: '',
        pixChave: pixChaveVal,
        tipoPix:  tipoPixVal,
        modulosAcessiveis: modulos,
        subunidade: String(isFilial),
        unidadePrincipal: isFilial ? (unidadePrincipal || null) : null,
        diretor_usuario_id: diretorId || null
      };
      if (!isEdit) payload.principal = String(isMatriz);

      // agência/conta
      const agenciaNumero = (byId('agenciaNumero')?.value || '').trim();
      const agenciaDV     = (byId('agenciaDV')?.value || '').trim();
      const contaNumero   = (byId('contaNumero')?.value || '').trim();
      const contaDV       = (byId('contaDV')?.value || '').trim();
      function validaAgencia(num, dv){
        if (!num && !dv) return '';
        if (!/^\d{1,5}$/.test(num)) return 'Número da agência inválido (1-5 dígitos).';
        if (dv && !/^[0-9Xx]{1,2}$/.test(dv)) return 'DV da agência inválido.';
        return null;
      }
      function validaConta(num, dv){
        if (!num && !dv) return '';
        if (!/^\d{1,12}$/.test(num)) return 'Número da conta inválido (1-12 dígitos).';
        if (dv && !/^[0-9Xx]{1,2}$/.test(dv)) return 'DV da conta inválido.';
        return null;
      }
      const errAg = validaAgencia(agenciaNumero, agenciaDV);
      if (typeof errAg === 'string' && errAg) { alert(errAg); return false; }
      const errCc = validaConta(contaNumero, contaDV);
      if (typeof errCc === 'string' && errCc) { alert(errCc); return false; }
      payload.agencia = agenciaNumero ? (agenciaDV ? `${agenciaNumero}-${agenciaDV.toUpperCase()}` : agenciaNumero) : '';
      payload.contaCorrente = contaNumero ? (contaDV ? `${contaNumero}-${contaDV.toUpperCase()}` : contaNumero) : '';

      const url = isEdit ? `/api/unidades/${unidadeId}` : '/api/unidades';
      const method = isEdit ? 'PUT' : 'POST';

      console.log('[FRONTEND] Enviando requisição:', { url, method, payload });

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin', // Adicionar credenciais
        body: JSON.stringify(payload)
      });

      console.log('[FRONTEND] Resposta recebida:', { status: res.status, statusText: res.statusText });
      const data = await res.json().catch(() => ({}));
      console.log('[FRONTEND] Dados da resposta:', data);
      if (!res.ok) {
        console.error('[FRONTEND] Erro na resposta:', { status: res.status, data });
        alert(data.error || data.message || 'Falha ao salvar unidade.');
        return false;
      }

      location.reload();
      return false;
    } catch (err) {
      console.error('Falha ao enviar formulário de unidade:', err);
      alert('Erro inesperado ao salvar a unidade.');
      return false;
    }
  };

  // ===================== Inicializações de módulos externos =====================
  try { if (window.BancoModule?.init)           window.BancoModule.init(); } catch(_){}
  try { if (window.DiretorModule?.init)         window.DiretorModule.init(); } catch(_){}
  try { if (window.DiretorModule?.atualizarVisibilidade) window.DiretorModule.atualizarVisibilidade(); } catch(_){}

  // Higiene global de backdrops
  document.addEventListener('hidden.bs.modal', function(){
    setTimeout(()=>{
      const aberto = document.querySelector('.modal.show');
      if (!aberto) {
        document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
      }
    }, 80);
  });

  // ===================== Navegação entre abas (Próximo/Voltar) =====================
  (function navAbas(){
    const ordem=['abaDadosGerais','abaDadosEmpresariais','abaContatos','abaBancarios','abaCredenciais'];
    function ir(idx){ if(idx<0||idx>=ordem.length) return; const trg=document.querySelector(`[data-bs-target="#${ordem[idx]}"]`); if(trg){ new bootstrap.Tab(trg).show(); } }
    function indiceAtual(){ return ordem.findIndex(id=>byId(id)?.classList.contains('active')); }
    document.querySelectorAll('[data-nav="next"]').forEach(btn=>btn.addEventListener('click', e=>{ e.preventDefault(); const i=indiceAtual(); if(i>-1) ir(i+1); }));
    document.querySelectorAll('[data-nav="prev"]').forEach(btn=>btn.addEventListener('click', e=>{ e.preventDefault(); const i=indiceAtual(); if(i>-1) ir(i-1); }));
  })();

  // Esconde linhas não principais no carregamento (reforço)
  (function ocultarNaoPrincipaisInicialmente(){
    const naoPrincipais = document.querySelectorAll('tr.unidade-row:not([data-principal="true"])');
    naoPrincipais.forEach(tr => { tr.style.display = 'none'; });
  })();

  // Exportar funções PIX para uso global
  window.detectarTipoPix = detectarTipoPix;
  window.selecionarTipoPix = selecionarTipoPix;
  window.aplicarMascaraPix = aplicarMascaraPix;
  window.validarChavePix = validarChavePix;
  window.detectarEAplicarMascaraPix = detectarEAplicarMascaraPix;
});