(function(){
  let modalEl, bsModal, btnBuscar, btnConfirmar, inpNome, inpId, inpAtr;
  let onOk = null;
  let ctxAtual = null;

  function enableConfirm(){
    const ok = (inpId.value && inpId.value.trim().length>0) && (inpAtr.value && inpAtr.value.trim().length>0);
    btnConfirmar.disabled = !ok;
  }

  function open(ctx, cb){
    ctxAtual = ctx || {};
    onOk = typeof cb==='function'? cb : null;
    inpNome.value = '';
    inpId.value = '';
    inpAtr.value = '';
    enableConfirm();
    if(!bsModal) bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  }

  function close(){ if(bsModal) bsModal.hide(); }

  function bind(){
    modalEl = document.getElementById('modalEfetivoRecursoDia');
    if(!modalEl) return;
    btnBuscar = modalEl.querySelector('#erd_btn_buscar');
    btnConfirmar = modalEl.querySelector('#erd_btn_confirmar');
    inpNome = modalEl.querySelector('#erd_func_nome');
    inpId = modalEl.querySelector('#erd_func_id');
    inpAtr = modalEl.querySelector('#erd_atribuicao');

    inpAtr.addEventListener('input', enableConfirm);

    btnBuscar.addEventListener('click', ()=>{
      if(!(window.WDG && typeof window.WDG.abrirModalPesquisarEfetivo==='function')){
        alert('Modal de pesquisa de efetivo não disponível.');
        return;
      }
      window.WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect: (ret)=>{
        const f = Array.isArray(ret)? ret[0] : ret;
        if(!f || !f.id){ return; }
        inpId.value = String(f.id);
        inpNome.value = String(f.nome || f.id);
        enableConfirm();
      }});
    });

    btnConfirmar.addEventListener('click', ()=>{
      if(btnConfirmar.disabled) return;
      const payload = {
        funcionarioId: inpId.value.trim(),
        funcionarioNome: inpNome.value.trim(),
        atribuicao: inpAtr.value.trim(),
        ctx: ctxAtual
      };
      if(onOk) onOk(payload);
      close();
    });
  }

  window.modalEfetivoRecursoDia = { open, close };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
