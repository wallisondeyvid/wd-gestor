// Controle dinâmico dos botões de navegação das abas
window.onload = function () {
  const abas = document.querySelectorAll('#tabsFuncionario .nav-link');
  const btnVoltar = document.getElementById('btnVoltar');
  const btnProximo = document.getElementById('btnProximo');
  const btnFinalizar = document.getElementById('btnFinalizar');

  function atualizarBotoes() {
    const idx = Array.from(abas).findIndex(tab => tab.classList.contains('active'));
    btnVoltar.disabled = idx === 0;
    btnVoltar.classList.toggle('d-none', idx === 0);
    btnProximo.classList.toggle('d-none', idx === abas.length - 1);
    btnFinalizar.classList.toggle('d-none', idx !== abas.length - 1);
  }

  // Manipula apenas abas dentro do container .tab-content
  const tabContent = document.querySelector('.tab-content');
  function ativarAba(idx) {
    abas.forEach((tab, i) => {
      if (i === idx) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const target = tab.getAttribute('data-bs-target');
        if (target && tabContent) {
          tabContent.querySelectorAll('.tab-pane').forEach(pane => {
            if (pane.id === target.replace('#', '')) {
              pane.classList.add('show', 'active');
            } else {
              pane.classList.remove('show', 'active');
            }
          });
        }
      } else {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      }
    });
    atualizarBotoes();
  }

  abas.forEach(tab => {
    tab.addEventListener('click', atualizarBotoes);
  });
  atualizarBotoes();

  btnVoltar.addEventListener('click', function () {
    const idx = Array.from(abas).findIndex(tab => tab.classList.contains('active'));
    if (idx > 0) ativarAba(idx - 1);
  });
  btnProximo.addEventListener('click', function () {
    const idx = Array.from(abas).findIndex(tab => tab.classList.contains('active'));
    if (idx < abas.length - 1) ativarAba(idx + 1);
  });
}
});
// ...existing code...
function __wdgNormalizeBase(base) {
  let value = String(base || '').trim();
  if (value === '/') return '';
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

function __wdgGetBasePath() {
  try {
    if (window.WDG_CONTEXT && typeof window.WDG_CONTEXT.basePath !== 'undefined') {
      return __wdgNormalizeBase(window.WDG_CONTEXT.basePath);
    }
  } catch(_){ }
  const bodyBase = document.body?.getAttribute('data-base-path') || '';
  return __wdgNormalizeBase(bodyBase || '/gestor');
}

function __wdgApiUrl(path) {
  let p = String(path || '');
  if (!p.startsWith('/')) p = '/' + p;
  const base = __wdgGetBasePath();
  return base ? (base + p) : p;
}

async function atualizarFuncionarioAba(abaIdx) {
  const form = document.getElementById('formFuncionario');
  const fd = new FormData(form);
  const funcionarioId = document.getElementById('funcionario_id')?.value;

  // Valida os campos da aba atual
  if (!validarAba(abaIdx)) {
    alert('Por favor, preencha todos os campos obrigatórios da aba atual.');
    return false;
  }

  try {
    const base = window.location.origin || '';
    const url = funcionarioId
      ? `${base}/api/funcionarios/${funcionarioId}/incremental`
      : `${base}/api/funcionarios/initial`;
    const method = funcionarioId ? 'PUT' : 'POST';

    // Adiciona apenas os campos relevantes para a aba atual
    const abaCampos = {
      0: ['unidade_id', 'nome', 'rg', 'cpf', 'data_nascimento', 'sexo', 'pis_pasep', 'pcd', 'cid'],
      1: ['endereco', 'email', 'telefone'],
      2: ['funcao_id', 'carteira_trabalho'],
      3: ['biometrico', 'biometrico_face'],
      4: ['extra_dependentes'],
      5: ['vt', 'vr', 'va', 'ps', 'extra_outros_beneficios']

    }

    // Fim do arquivo

    const camposPermitidos = abaCampos[abaIdx] || [];
    const fdFiltrado = new FormData();
    for (let [key, value] of fd.entries()) {
      if (camposPermitidos.includes(key) || key.startsWith('extra_')) {
        fdFiltrado.append(key, value);
      }
    }

    const response = await fetch(url, {
      method: method,
      body: fdFiltrado
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na requisição:', errorText);
      alert(`Erro ao salvar dados da aba ${abaIdx + 1}: ${errorText}`);
      return false;
    }

    const data = await response.json();
    if (method === 'POST' && data.id) {
      document.getElementById('funcionario_id').value = data.id;
    }

    // Avança para a próxima aba
    await proximaAba();
    return true;
  } catch (e) {
    console.error('Erro ao salvar aba:', e);
    alert('Erro de rede ao salvar dados da aba.');
    return false;
  }
}

async function abrirModalBiometria(tipo = 'dedo') {
  console.log('[DEBUG] Iniciando abrirModalBiometria, tipo:', tipo);
  const modalElement = document.getElementById('modalBiometria');
  if (!modalElement) {
    console.error('[DEBUG] Elemento modalBiometria não encontrado!');
    alert('Erro: Modal de biometria não encontrado.');
    return;
  }
  console.log('[DEBUG] Modal encontrado, estado inicial:', {
    classes: modalElement.className,
    style: modalElement.style.cssText
  });

  const selectDispositivos = document.getElementById('dispositivosBiometricos');
  const statusEl = document.getElementById('statusBiometria');
  const campoDestino = tipo === 'dedo' ? document.getElementById('biometrico') : document.getElementById('biometrico_face');

  if (!selectDispositivos || !statusEl || !campoDestino) {
    console.error('[DEBUG] Elementos ausentes:', { selectDispositivos, statusEl, campoDestino });
    alert('Erro: Elementos do modal de biometria não encontrados.');
    return;
  }

  try {
    console.log('[DEBUG] Tentando inicializar modal com Bootstrap...');
    // Remove classes e estilos existentes para forçar reinicialização
    modalElement.className = 'modal fade';
    modalElement.style.display = 'none';
    modalElement.removeAttribute('aria-modal');
    modalElement.removeAttribute('role');
    modalElement.removeAttribute('style');

    const modal = new bootstrap.Modal(modalElement, { keyboard: false });
    console.log('[DEBUG] Modal Bootstrap criado:', modal);
    modal.show();
    console.log('[DEBUG] Modal exibido via modal.show(), classes após show:', modalElement.className, 'estilos inline:', modalElement.style.cssText);

    const modalDialog = modalElement.querySelector('.modal-dialog');
    console.log('[DEBUG] Modal-dialog estilos computados:', window.getComputedStyle(modalDialog).cssText);

    statusEl.textContent = 'Carregando dispositivos...';

    const response = await fetch(__wdgApiUrl('/api/biometria/dispositivos'));
    if (!response.ok) {
      console.error('[DEBUG] Falha ao carregar dispositivos:', response.status, response.statusText);
      throw new Error('Falha ao carregar dispositivos');
    }
    const { devices } = await response.json();
    console.log('[DEBUG] Dispositivos recebidos:', devices);
    selectDispositivos.innerHTML = '<option value="">Selecione um dispositivo</option>';

    if (devices.length === 0) {
      console.log('[DEBUG] Nenhum dispositivo encontrado');
      statusEl.textContent = 'Nenhum dispositivo biométrico encontrado.';
      return;
    }

    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = JSON.stringify({ vendorId: d.vendorId, productId: d.productId, path: d.path });
      opt.textContent = `${d.manufacturer || 'Desconhecido'} - ${d.product || 'Dispositivo'} (VID: ${d.vendorId}, PID: ${d.productId})`;
      selectDispositivos.appendChild(opt);
    });

    statusEl.textContent = 'Selecione um dispositivo para capturar a biometria.';
  } catch (e) {
    console.error('[DEBUG] Erro ao carregar dispositivos biométricos:', e);
    statusEl.textContent = 'Erro ao carregar dispositivos: ' + e.message;
  }
}

async function capturarBiometria() {
  const selectDispositivos = document.getElementById('dispositivosBiometricos');
  const statusEl = document.getElementById('statusBiometria');
  const campoDestino = document.querySelector('input[name="biometrico"]:focus, input[name="biometrico_face"]:focus') || document.getElementById('biometrico');

  if (!selectDispositivos || !statusEl || !campoDestino) {
    alert('Erro: Elementos do modal de biometria não encontrados.');
    return;
  }

  const dispositivo = selectDispositivos.value;
  if (!dispositivo) {
    statusEl.textContent = 'Selecione um dispositivo antes de capturar.';
    return;
  }

  statusEl.textContent = 'Capturando biometria...';

  try {
    const response = await fetch(__wdgApiUrl('/api/biometria/capturar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispositivo: JSON.parse(dispositivo) })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const { dados } = await response.json();
    if (dados) {
      campoDestino.value = dados;
      statusEl.textContent = 'Biometria capturada com sucesso!';
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('modalBiometria')).hide();
      }, 1500);
    } else {
      statusEl.textContent = 'Nenhum dado biométrico capturado.';
    }
  } catch (e) {
    console.error('Erro ao capturar biometria:', e);
    statusEl.textContent = 'Erro ao capturar biometria: ' + e.message;
  }
}
