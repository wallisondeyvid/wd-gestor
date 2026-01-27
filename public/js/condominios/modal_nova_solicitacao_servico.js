(function(){
  const modalEl = document.getElementById('modalNovaSolicitacaoServico');
  if(!modalEl) return;
  if(typeof bootstrap === 'undefined' || !bootstrap.Modal){
    console.warn('[modal_nova_solicitacao_servico] Bootstrap Modal indisponível');
    return;
  }

  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', focus: true });
  const rejectModalEl = document.getElementById('modalRejeitarSolicitacao');
  const bsRejectModal = rejectModalEl && bootstrap.Modal ? new bootstrap.Modal(rejectModalEl) : null;
  const basePath = document.body?.dataset?.basePath || '/condominios';
  const goServicesPath = `${basePath}/servicos/servicos`;
  let currentSolic = null;

  const refs = {
    protocolo: document.getElementById('wdgServSolicProtocolo'),
    novaBadge: document.getElementById('wdgServSolicNovaBadge'),
    subtitle: document.getElementById('wdgServSolicSubtitle'),
    habitacao: document.getElementById('wdgServSolicHabitacao'),
    morador: document.getElementById('wdgServSolicMorador'),
    titulo: document.getElementById('wdgServSolicTitulo'),
    descricao: document.getElementById('wdgServSolicDescricao'),
    criadoEm: document.getElementById('wdgServSolicCriadoEm'),
    status: document.getElementById('wdgServSolicStatus'),
    fotosCount: document.getElementById('wdgServSolicFotosCount'),
    fotosEmpty: document.getElementById('wdgServSolicFotosEmpty'),
    fotosGrid: document.getElementById('wdgServSolicFotosGrid'),
    btnAceitar: document.getElementById('wdgServSolicAceitar'),
    btnRejeitar: document.getElementById('wdgServSolicRejeitar'),
    btnGoServices: document.getElementById('wdgServSolicGoServices'),
    rejeicaoMotivo: document.getElementById('wdgServRejeicaoMotivo'),
    rejeicaoError: document.getElementById('wdgServRejeicaoError'),
    btnConfirmarRejeicao: document.getElementById('wdgServConfirmarRejeicao')
  };

  function text(el, value){
    if(!el) return;
    const v = value == null || value === '' ? '-' : String(value);
    el.textContent = v;
  }

  function formatDateTimeBr(value){
    if(!value) return '';
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return '';
    const dd = String(date.getDate()).padStart(2,'0');
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2,'0');
    const mi = String(date.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function resetFotos(){
    if(refs.fotosGrid) refs.fotosGrid.innerHTML = '';
    if(refs.fotosEmpty) refs.fotosEmpty.style.display = '';
    if(refs.fotosCount) refs.fotosCount.textContent = '0 fotos';
  }

  function buildFotoThumb(url){
    if(!url) return null;
    const col = document.createElement('div');
    col.className = 'col-6 col-md-4';
    col.innerHTML = `
      <a href="${String(url)}" target="_blank" rel="noopener" class="d-block rounded-4 border overflow-hidden" style="background:#fff;">
        <img src="${String(url)}" alt="Foto" style="width:100%;height:140px;object-fit:cover;display:block;">
      </a>
    `;
    return col;
  }

  function preencher(data){
    const d = (data && typeof data === 'object') ? data : {};
    currentSolic = {
      id: d._id || d.id || '',
      unidade_id: d.unidade_id || '',
      habitacao_id: d.habitacao_id || '',
      morador_email: d.morador_email || ''
    };
    text(refs.protocolo, d.protocolo || d._id || '-');
      // Ao abrir a solicitação o backend já marca nova=false; esconda imediatamente.
      if(refs.novaBadge){
        refs.novaBadge.style.display = 'none';
    }

    const created = formatDateTimeBr(d.createdAt);
    text(refs.subtitle, created ? `Criada em ${created}` : '');

    text(refs.habitacao, d.habitacao_label || d.habitacaoLabel || '-');
    text(refs.morador, d.morador_email || d.moradorEmail || '-');
    text(refs.titulo, d.titulo || '-');
    text(refs.descricao, d.descricao || '-');
    text(refs.criadoEm, created || '-');
    text(refs.status, d.status || 'aberto');

    resetFotos();
    const fotos = Array.isArray(d.fotos) ? d.fotos.filter(Boolean) : [];
    if(refs.fotosCount) refs.fotosCount.textContent = `${fotos.length} foto${fotos.length === 1 ? '' : 's'}`;
    if(fotos.length){
      if(refs.fotosEmpty) refs.fotosEmpty.style.display = 'none';
      fotos.forEach(url => {
        const el = buildFotoThumb(url);
        if(el && refs.fotosGrid) refs.fotosGrid.appendChild(el);
      });
    }
  }

  function abrir(data){
    try{ preencher(data); }catch(err){ console.error('[modal_nova_solicitacao_servico] falha ao preencher', err); }
    bsModal.show();
  }

  async function aceitar(){
    if(!currentSolic || !currentSolic.id) return;
    setLoading(true);
    try{
      const res = await fetch(`${basePath}/api/solicitacoes-servico/${encodeURIComponent(currentSolic.id)}/aceitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      dispatchStatusChange('aceita');
      bsModal.hide();
    }catch(err){
      console.error('[modal_nova_solicitacao_servico] aceitar erro', err);
      alert('Não foi possível aceitar a solicitação.');
    }finally{
      setLoading(false);
    }
  }

  function abrirRejeicao(){
    if(!bsRejectModal) return;
    if(refs.rejeicaoMotivo) refs.rejeicaoMotivo.value = '';
    if(refs.rejeicaoError) refs.rejeicaoError.style.display = 'none';
    bsRejectModal.show();
  }

  async function confirmarRejeicao(){
    if(!currentSolic || !currentSolic.id) return;
    const motivo = (refs.rejeicaoMotivo && refs.rejeicaoMotivo.value || '').trim();
    if(!motivo){
      if(refs.rejeicaoError){
        refs.rejeicaoError.textContent = 'Informe a justificativa.';
        refs.rejeicaoError.style.display = '';
      }
      return;
    }
    setLoading(true);
    try{
      const res = await fetch(`${basePath}/api/solicitacoes-servico/${encodeURIComponent(currentSolic.id)}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo })
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      dispatchStatusChange('rejeitada');
      bsRejectModal?.hide();
      bsModal.hide();
    }catch(err){
      console.error('[modal_nova_solicitacao_servico] rejeitar erro', err);
      if(refs.rejeicaoError){
        refs.rejeicaoError.textContent = 'Erro ao rejeitar. Tente novamente.';
        refs.rejeicaoError.style.display = '';
      }
    }finally{
      setLoading(false);
    }
  }

  function setLoading(on){
    const toggle = (el) => { if(el) el.disabled = !!on; };
    toggle(refs.btnAceitar);
    toggle(refs.btnRejeitar);
    toggle(refs.btnConfirmarRejeicao);
  }

  function dispatchStatusChange(status){
    try{
      window.dispatchEvent(new CustomEvent('wdg-servico-status-change', {
        detail: {
          id: currentSolic?.id || '',
          habitacaoId: currentSolic?.habitacao_id || '',
          unidadeId: currentSolic?.unidade_id || '',
          status
        }
      }));
    }catch(err){
      console.warn('dispatchStatusChange erro', err);
    }
  }

  function bindActions(){
    refs.btnAceitar?.addEventListener('click', aceitar);
    refs.btnRejeitar?.addEventListener('click', abrirRejeicao);
    refs.btnConfirmarRejeicao?.addEventListener('click', confirmarRejeicao);
    refs.btnGoServices?.addEventListener('click', () => {
      if(!goServicesPath) return;
      window.location.href = goServicesPath;
    });
  }

  bindActions();

  window.WDG_SOL_SERVICO_DET = { abrir };
})();
