// Modal Tipo de Contrato
(() => {
  'use strict';

  const norm = (s='') => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

  document.addEventListener('DOMContentLoaded', () => {
    const modal        = document.getElementById('modalTipoContrato');
    if (!modal) return;

    const ulTipos      = modal.querySelector('#listaTipoContrato');
    const headerEl     = modal.querySelector('.list-header'); // para compensar a scrollbar
    const inpPesquisa  = modal.querySelector('#tipoContratoPesquisa');
    const btnLimpar    = modal.querySelector('#btnLimparTipoContrato');
    const btnConfirmar = modal.querySelector('#btnConfirmarTipoContrato');
    const campoTipo    = document.getElementById('extra_tipo_contrato');

    let tipos = [];

    function syncHeaderPadding() {
      // mede a largura da scrollbar do UL e injeta na --sbw
      if (!ulTipos || !headerEl) return;
      const sbw = ulTipos.offsetWidth - ulTipos.clientWidth;
      headerEl.style.setProperty('--sbw', sbw + 'px');
    }

    function markSelected(li, input) {
      ulTipos.querySelectorAll('.item-row').forEach(r => r.classList.remove('is-selected'));
      if (input?.checked) li.querySelector('.item-row')?.classList.add('is-selected');
    }

    function renderListaTipos(lista) {
      if (!ulTipos) return;
      ulTipos.innerHTML = '';
      const frag = document.createDocumentFragment();

      (lista || []).forEach((tipo, idx) => {
        const codigo = String(tipo?.codigo||'').trim();
        let desc   = String((tipo && (tipo.descricao ?? tipo.nome ?? '')) || '').trim();
        if(!desc) desc='(sem descrição)';
        const texto  = `${codigo} - ${desc}`;
        const id     = `tipoContratoCheck_${idx}`;

        const li = document.createElement('li');
        li.className = 'list-group-item p-0';
        li.innerHTML = `
          <div class="item-row">
            <div class="col-sel">
              <input type="radio" name="tipoContratoCheck" class="form-check-input" id="${id}" value="${texto}">
            </div>
            <label for="${id}" class="mb-0 col-cod">${codigo}</label>
            <label for="${id}" class="mb-0 col-desc">${desc}</label>
          </div>
        `;

        const radio = li.querySelector('input[type="radio"]');
        radio?.addEventListener('change', () => markSelected(li, radio));
        li.addEventListener('click', (ev) => {
          if (ev.target.tagName !== 'INPUT') {
            radio.checked = true;
            markSelected(li, radio);
          }
        });

        frag.appendChild(li);
      });

      ulTipos.appendChild(frag);
      syncHeaderPadding(); // atualiza após render (pode mudar a presença da barra)
    }

    async function loadTipos() {
      if (tipos.length) return;
      const res = await fetch('/data/tipos_contrato.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      tipos = (Array.isArray(arr)?arr:[]).map(o=>{
        let desc=String(o?.descricao||o?.nome||'').trim();
        if(!desc){
          for(const k of Object.keys(o||{})){
            const lk=k.toLowerCase();
            if(/desc|nome|tipo/.test(lk)){
              const v=String(o[k]??'').trim();
              if(v){ desc=v; break; }
            }
          }
        }
        return { codigo:String(o?.codigo||'').trim(), descricao:desc };
      });
      if(tipos.length) console.debug('[tipo_contrato][public] exemplo pos-heuristica', tipos[0]);
      const vazios = tipos.filter(x=>!x.descricao).length; if(vazios) console.warn('[tipo_contrato][public] sem descricao apos heuristica:', vazios);
    }

    function preselectFromField() {
      const current = (campoTipo?.value || '').trim();
      if (!current) return;

      const code = current.split(' - ')[0]?.trim();
      const radio = Array.from(modal.querySelectorAll('input[name="tipoContratoCheck"]'))
        .find(r => r.value === current || (code && r.value.startsWith(code + ' -')));

      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
        radio.closest('li')?.scrollIntoView({ block: 'nearest' });
      }
    }

    // Abre o modal
    modal.addEventListener('show.bs.modal', async () => {
      try {
        ulTipos.innerHTML = '<li class="list-group-item p-2">Carregando…</li>';
        await loadTipos();
        renderListaTipos(tipos);

        // resets
        inpPesquisa && (inpPesquisa.value = '');
        modal.querySelectorAll('input[name="tipoContratoCheck"]').forEach(c => (c.checked = false));
      } catch (e) {
        console.error('Falha ao carregar tipos de contrato:', e);
        ulTipos.innerHTML = '<li class="list-group-item text-danger">Erro ao carregar tipos de contrato.</li>';
      }
    });

    // Após abrir completamente
    modal.addEventListener('shown.bs.modal', () => {
      inpPesquisa?.focus();
      preselectFromField();
      syncHeaderPadding();
      window.addEventListener('resize', syncHeaderPadding, { passive: true });
    });

    // Ao fechar, remove listener
    modal.addEventListener('hide.bs.modal', () => {
      window.removeEventListener('resize', syncHeaderPadding);
    });

    // Inicializar controles quando a página carrega
    // Aguardar um pouco para garantir que os campos foram criados
    setTimeout(() => {
      if (campoTipo && campoTipo.value) {
        // Simular um radio button checked para aplicar a lógica inicial
        const mockRadio = { value: campoTipo.value };
        controlarCamposPorTipoContrato(mockRadio);
      } else {
        // Se não há tipo selecionado, desabilitar todos os campos
        controlarCamposPorTipoContrato(null);
      }
    }, 100);

    // Também executar quando a aba for ativada (caso os campos sejam criados dinamicamente)
    document.addEventListener('shown.bs.tab', function(event) {
      if (event.target.id === 'tab-aba3') {
        setTimeout(() => {
          if (campoTipo && campoTipo.value) {
            const mockRadio = { value: campoTipo.value };
            controlarCamposPorTipoContrato(mockRadio);
          } else {
            // Se não há tipo selecionado, desabilitar todos os campos
            controlarCamposPorTipoContrato(null);
          }
        }, 100);
      }
    });

    // Filtro/Busca
    inpPesquisa?.addEventListener('input', function () {
      const t = norm(this.value || '');
      const filtrados = !t ? tipos
        : tipos.filter(x => norm(`${x.codigo} ${(x.descricao ?? x.nome ?? '')}`).includes(t));
      renderListaTipos(filtrados);
    });

    // Limpar
    btnLimpar?.addEventListener('click', function () {
      modal.querySelectorAll('input[name=tipoContratoCheck]').forEach(c => (c.checked = false));
      ulTipos.querySelectorAll('.item-row').forEach(r => r.classList.remove('is-selected'));
      if (campoTipo) campoTipo.value = '';
      if (inpPesquisa) inpPesquisa.value = '';
      renderListaTipos(tipos);

      // Desabilitar todos os campos quando limpar
      setTimeout(() => {
        controlarCamposPorTipoContrato(null);
      }, 50);
    });

    // Confirmar
    btnConfirmar?.addEventListener('click', function () {
      const checked = modal.querySelector('input[name=tipoContratoCheck]:checked');
      if (campoTipo) campoTipo.value = checked ? checked.value : '';

      // Aplicar lógica de controle dos campos baseado no tipo de contrato
      // Usar setTimeout para garantir que os campos foram criados
      setTimeout(() => {
        controlarCamposPorTipoContrato(checked);
      }, 50);

      bootstrap.Modal.getOrCreateInstance(modal).hide();
    });

    // Função para controlar campos baseado no tipo de contrato
    function controlarCamposPorTipoContrato(checkedRadio) {
      const dataTermino = document.getElementById('data_termino');
      const objetoDeterminante = document.getElementById('extra_objeto_determinante');
      const clausulaAssecuratoria = document.getElementById('extra_clausula_assecuratoria');

      if (!checkedRadio) {
        // Se nenhum tipo selecionado, desabilitar todos os campos
        desabilitarCampo(dataTermino);
        desabilitarCampo(objetoDeterminante);
        desabilitarCampo(clausulaAssecuratoria);
        return;
      }

      const valorSelecionado = checkedRadio.value;
      const codigo = valorSelecionado.split(' - ')[0]?.trim();

      // Contratos de prazo determinado (ativam data de término)
      const contratosPrazoDeterminado = ['2', '3', '4', '5', '6', '8'];

      // Contratos que têm objeto determinante
      const contratosComObjeto = ['4', '5', '6', '8'];

      // Contratos que podem ter cláusula assecuratória
      const contratosComClausula = ['4', '5', '8'];

      // Controlar Data de Término
      if (contratosPrazoDeterminado.includes(codigo)) {
        habilitarCampo(dataTermino);
      } else {
        desabilitarCampo(dataTermino);
      }

      // Controlar Objeto Determinante
      if (contratosComObjeto.includes(codigo)) {
        habilitarCampo(objetoDeterminante);
      } else {
        desabilitarCampo(objetoDeterminante);
      }

      // Controlar Cláusula Assecuratória
      if (contratosComClausula.includes(codigo)) {
        habilitarCampo(clausulaAssecuratoria);
      } else {
        desabilitarCampo(clausulaAssecuratoria);
      }
    }

    // Funções auxiliares para habilitar/desabilitar campos
    function habilitarCampo(campo) {
      if (campo) {
        campo.disabled = false;
        campo.style.opacity = '1';
        campo.style.pointerEvents = 'auto';
        campo.style.backgroundColor = '#fff';
        // Limpar valor se estava desabilitado
        if (campo.tagName === 'SELECT') {
          campo.value = '';
        } else if (campo.type === 'text' || campo.type === 'date') {
          campo.value = '';
        }
      }
    }

    function desabilitarCampo(campo) {
      if (campo) {
        campo.disabled = true;
        campo.style.opacity = '0.6';
        campo.style.pointerEvents = 'none';
        campo.style.backgroundColor = '#f8f9fa';
        // Limpar valor quando desabilitado
        if (campo.tagName === 'SELECT') {
          campo.value = '';
        } else if (campo.type === 'text' || campo.type === 'date') {
          campo.value = '';
        }
      }
    }
  });
})();