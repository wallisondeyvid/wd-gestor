// Script para a página de pesquisa de escalas
(function(){
  'use strict';

  // Carregar perfil-modular.js se não estiver carregado
  if (!window.abrirModalPerfil) {
    const script = document.createElement('script');
    script.src = '/escalas/js/perfil-modulo.js';
    script.defer = true;
    script.onload = function() {
      console.log('[pesquisar-escala] perfil-modular carregado');
    };
    script.onerror = function() {
      console.warn('[pesquisar-escala] falha ao carregar perfil-modular');
    };
    document.head.appendChild(script);
    // Fallback provisório até o script real ficar disponível
    window.abrirModalPerfil = window.abrirModalPerfil || function(){
      try {
        const el = document.getElementById('modalPerfil');
        if(!el) return;
        const modal = bootstrap.Modal.getOrCreateInstance(el);
        modal.show();
      } catch(_){}
    };
  }

  // Lógica específica da página de pesquisa
  function initPesquisaEscalas() {
    // IDs conforme views/escalas/pesquisar_escala.ejs
    const form = document.getElementById('formPesquisaEscalas') || document.getElementById('formPesquisarEscalas');
    const btn = document.getElementById('btnPesquisarEscalas');
    const tabela = document.getElementById('tabelaEscalas');
    const tbody = tabela && tabela.querySelector ? tabela.querySelector('tbody') : null;

    if (!form || !btn || !tbody) {
      console.warn('[pesquisar-escala] elementos não encontrados', { hasForm: !!form, hasBtn: !!btn, hasTBody: !!tbody });
      return;
    }

    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      const formData = new FormData(form);
      const params = new URLSearchParams();
      for (let [key, value] of formData.entries()) {
        if (value.trim()) params.append(key, value);
      }

      try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Pesquisando...';

        const resp = await fetch(`/escalas/api/escalas?${params.toString()}`, {
          credentials: 'same-origin'
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        renderResultados(data.data || []);

      } catch (err) {
        console.error('[pesquisar-escala] erro pesquisa', err);
        alert('Erro ao pesquisar escalas: ' + (err.message || 'Erro desconhecido'));
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-search"></i> Pesquisar';
      }
    });

    function renderResultados(escalas) {
      tbody.innerHTML = '';
      if (!escalas.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Nenhuma escala encontrada</td></tr>';
        return;
      }

      escalas.forEach(escala => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escala.descricao || 'Sem descrição'}</td>
          <td>${escala.unidade_nome || 'N/A'}</td>
          <td>${formatarPeriodo(escala.inicio, escala.fim)}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="verEscala('${escala._id}')">Ver</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="editarEscala('${escala._id}')">Editar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function formatarPeriodo(inicio, fim) {
      if (!inicio || !fim) return 'N/A';
      const ini = new Date(inicio).toLocaleDateString('pt-BR');
      const f = new Date(fim).toLocaleDateString('pt-BR');
      return `${ini} - ${f}`;
    }

    // Ações
    window.verEscala = function(id) {
      const base = (window.ESCALA_PESQUISA_TIPO||'ordinaria').toLowerCase()==='extraordinaria' ? '/escalas/extraordinaria/nova' : '/escalas/ordinaria/nova';
      window.location.href = base + '?id=' + encodeURIComponent(id);
    };

    window.editarEscala = function(id) {
      const base = (window.ESCALA_PESQUISA_TIPO||'ordinaria').toLowerCase()==='extraordinaria' ? '/escalas/extraordinaria/nova' : '/escalas/ordinaria/nova';
      window.location.href = base + '?id=' + encodeURIComponent(id);
    };

    // Botão "Nova" no topo
    const btnNova = document.getElementById('btnNovaEscala');
    if(btnNova && !btnNova.__bound){
      btnNova.addEventListener('click', function(){
        const base = (window.ESCALA_PESQUISA_TIPO||'ordinaria').toLowerCase()==='extraordinaria' ? '/escalas/extraordinaria/nova' : '/escalas/ordinaria/nova';
        window.location.href = base;
      });
      btnNova.__bound = true;
    }
  }

  // Inicializar quando DOM pronto, com pequenas tentativas de retry
  function tryInit(tries=0){
    initPesquisaEscalas();
    const ok = document.getElementById('btnPesquisarEscalas') && (document.getElementById('formPesquisaEscalas')||document.getElementById('formPesquisarEscalas')) && document.querySelector('#tabelaEscalas tbody');
    if(!ok && tries<4){ setTimeout(()=> tryInit(tries+1), 150); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> tryInit());
  } else {
    tryInit();
  }

})();