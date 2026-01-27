// STUB TEMPORÁRIO funcionarios_selects: delega para nova versão em gestor
(function loadDelegated(){
  const script = document.createElement('script');
  script.src = '/gestor/js/pages/funcionarios_selects.js';
  script.defer = true;
  document.head.appendChild(script);
})();
/* (restante removido: lógica completa agora em gestor/js/pages/funcionarios_selects.js) */

// ========================= UFs e listas básicas =========================
document.addEventListener('DOMContentLoaded', async function () {
  await fillSelect('/data/estados.json', document.getElementById('extra_orgao_prof_uf'), o => ({ value: o.sigla, label: o.nome }));
  await fillSelect('/data/estados.json', document.getElementById('extra_cnh_uf'),          o => ({ value: o.sigla, label: o.nome }));
  await fillSelect('/data/estados.json', document.getElementById('rg_uf'),                 o => ({ value: o.sigla, label: o.nome }));
  await fillSelect('/data/estados.json', document.getElementById('extra_ctps_uf'),        o => ({ value: o.sigla, label: o.nome }));
  await fillSelect('/data/estados.json', document.getElementById('extra_cert_militar_uf'),o => ({ value: o.sigla, label: o.nome }));

  // === Ajustados: aceitam também JSON como objeto (via Object.entries) ===
  await fillSelect('/data/tipos_especial.json',          document.getElementById('extra_tipo_especial'),
    ([codigo, descricao]) => ({ value: codigo, label: `${codigo} - ${descricao}` })
  );
  await fillSelect('/data/regimes_previdenciarios.json', document.getElementById('extra_regime_previdenciario'),
    ([codigo, descricao]) => ({ value: codigo, label: `${codigo} - ${descricao}` })
  );

  await fillSelect('/data/tipos_conta.json',             document.getElementById('extra_tipo_conta'),
    t => ({ value: t.codigo, label: `${t.codigo} - ${t.descricao}` })
  );
  await fillSelect('/data/fgts_opcoes.json',             document.getElementById('extra_fgts_optante'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/regimes_jornada.json',         document.getElementById('extra_regime_jornada'),
    r => ({ value: r.codigo, label: `${r.codigo} - ${r.descricao}` })
  );
  await fillSelect('/data/regimes_contratacao.json',     document.getElementById('extra_regime_contratacao'),
    r => ({ value: r.codigo, label: `${r.codigo} - ${r.descricao}` })
  );
  await fillSelect('/estado_civil.json',                 document.getElementById('estado_civil'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/raca_cor.json',                document.getElementById('raca_cor'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/escolaridades.json',           document.getElementById('escolaridade'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/sexo.json',                    document.getElementById('sexo'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/nacionalidades.json',          document.getElementById('nacionalidade'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/tipos_admissao.json',          document.getElementById('extra_tipo_admissao'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/tipos_salario.json',           document.getElementById('extra_tipo_salario'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );
  await fillSelect('/data/formas_pagamento.json',        document.getElementById('extra_forma_pagamento'),
    o => ({ value: o.codigo, label: `${o.codigo} - ${o.descricao}` })
  );

  // Habilita/Desabilita descrição da forma de pagamento "99 - Outro"
  const formaPagamento = document.getElementById('extra_forma_pagamento');
  const descInput = document.getElementById('extra_forma_pagamento_desc');
  if (formaPagamento && descInput) {
    const sync = () => { descInput.disabled = (formaPagamento.value !== '99'); if (descInput.disabled) descInput.value = ''; };
    formaPagamento.addEventListener('change', sync);
    sync();
  }
});

// ========================= FGTS: habilita data conforme opção =========================
document.addEventListener('DOMContentLoaded', function () {
  const fgtsSelect = document.getElementById('extra_fgts_optante');
  const fgtsData   = document.getElementById('extra_fgts_data');
  if (!fgtsSelect || !fgtsData) return;

  const apply = () => { fgtsData.disabled = (fgtsSelect.value !== '1'); if (fgtsData.disabled) fgtsData.value = ''; };
  fgtsData.disabled = true;
  fgtsSelect.addEventListener('change', apply);
  apply();
});

// ========================= CTPS (Digital/Física) =========================
function initCTPSDigital() {
  const tipoFisico  = document.getElementById('ctpsFisico');
  const tipoDigital = document.getElementById('ctpsDigital');
  const campoNum    = document.getElementById('extra_ctps_numero');
  const campoSerie  = document.getElementById('extra_ctps_serie');
  const campoCPF    = document.getElementById('cpf');
  if (!campoNum || !campoSerie) return;

  function setMaskCTPS(tipo) {
    if (tipo === 'DIGITAL') {
      campoNum.maxLength = 7; campoSerie.maxLength = 3;
      campoNum.readOnly = campoSerie.readOnly = false;
      // autocompleta com CPF se válido
      const cpfVal = (campoCPF?.value || '').replace(/\D/g, '');
      if (cpfVal.length === 11) {
        campoNum.value  = cpfVal.substring(0, 7);
        campoSerie.value = cpfVal.substring(8, 11);
      }
    } else {
      campoNum.maxLength = 7; campoSerie.maxLength = 4;
      campoNum.readOnly = campoSerie.readOnly = false;
    }
  }

  tipoFisico?.addEventListener('change', function(){ if (this.checked) setMaskCTPS('FISICO'); });
  tipoDigital?.addEventListener('change', function(){ if (this.checked) setMaskCTPS('DIGITAL'); });
  campoCPF?.addEventListener('input', function(){ if (tipoDigital?.checked) setMaskCTPS('DIGITAL'); });

  setMaskCTPS(tipoFisico?.checked ? 'FISICO' : 'DIGITAL');
}

// ========================= Nacionalidade: campos dependentes =========================
function initNacionalidadeCampos() {
  const nacionalidade  = document.getElementById('nacionalidade');
  const paisNascimento = document.getElementById('pais_nascimento');
  const btnPais        = document.getElementById('btnPaisNascimento');
  const dataChegada    = document.getElementById('extra_data_chegada_brasil');

  const apply = () => {
    const val = nacionalidade?.value;
    if (!val) {
      setEnabled(paisNascimento, false); setEnabled(btnPais, false); setEnabled(dataChegada, false);
    } else if (val === '2' || val === '3') { // estrangeiro / naturalizado
      setEnabled(paisNascimento, true); setEnabled(btnPais, true); setEnabled(dataChegada, true);
    } else if (val === '1') { // brasileiro
      setEnabled(paisNascimento, true); setEnabled(btnPais, true); setEnabled(dataChegada, false);
      paisNascimento.value = '076 - Brasil';
    } else {
      setEnabled(paisNascimento, false); setEnabled(btnPais, false); setEnabled(dataChegada, false);
    }
  };
  nacionalidade?.addEventListener('change', apply);
  apply();
}

// ========================= PCD: campos dependentes =========================
function initPCDCampos() {
  const pcd     = document.getElementById('extra_pcd');
  const tipoDef = document.getElementById('extra_tipo_deficiencia');
  const cid     = document.getElementById('extra_cid');

  const apply = () => {
    const val = pcd?.value;
    const enable = (val === 'S');
    setEnabled(tipoDef, enable);
    setEnabled(cid,     enable);
  };
  pcd?.addEventListener('change', apply);
  apply();
}

// ========================= CID mask =========================
function maskCID() {
  const cid = document.getElementById('extra_cid');
  if (!cid) return;
  cid.addEventListener('input', function() {
    let v = cid.value.toUpperCase().replace(/[^A-Z0-9.]/g, '');
    v = v.replace(/^([A-Z])([0-9]{0,2})/, '$1$2');
    v = v.replace(/^([A-Z][0-9]{2})([0-9]{0,2})/, '$1.$2');
    v = v.replace(/\.{2,}/g, '.');
    v = v.replace(/^(\w{1,3})\.(\d{1,2}).*/, '$1.$2');
    cid.value = v;
  });
}

// ========================= Inicialização geral =========================
document.addEventListener('DOMContentLoaded', () => {
  initCTPSDigital();
  initNacionalidadeCampos();
  initPCDCampos();
  maskCID();
});

// ========================= Funções por unidade (quando #funcao é <select>) =========================
document.addEventListener('DOMContentLoaded', function() {
  const unidadeSelect = document.getElementById('unidade');
  const funcaoSelect  = document.getElementById('funcao');
  if (!unidadeSelect || !funcaoSelect || funcaoSelect.tagName !== 'SELECT') return;

  async function carregarFuncoes(unidadeId) {
    try {
      const url = unidadeId && unidadeId !== '' ? `/api/funcoes/unidade/${unidadeId}` : '/api/funcoes/unidade/null';
      const response = await fetch(url, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        if (response.status === 401) { console.warn('Sessão expirada ao buscar funções'); return; }
        throw new Error(`HTTP ${response.status}`);
      }
      const funcoes = await response.json();

      const prior =
        funcaoSelect.dataset.currentValue ||
        funcaoSelect.getAttribute('data-current') ||
        funcaoSelect.value ||
        document.getElementById('funcao_id_hidden')?.value ||
        '';

      funcaoSelect.innerHTML = '<option value="">Selecione...</option>';

      if (Array.isArray(funcoes)) {
        funcoes.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f._id;
          // API retorna { _id, descricao, codigo }
          opt.textContent = f.descricao || f.nome || f.codigo || '(sem nome)';
          funcaoSelect.appendChild(opt);
        });
      }

      if (prior) funcaoSelect.value = prior;
    } catch (err) {
      console.error('Erro ao carregar funções:', err);
      funcaoSelect.innerHTML = '<option value="">Erro ao carregar funções</option>';
    }
  }

  unidadeSelect.addEventListener('change', function() { carregarFuncoes(this.value); });
  setTimeout(() => carregarFuncoes(unidadeSelect.value), 600);
});