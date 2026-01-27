// diretor-module.js - Seleção de Diretor para unidade matriz
(function(){
  console.debug('[diretor-module] script carregado');
  if (window.__DiretorModuleBound) { console.debug('[diretor-module] já inicializado (script), evitando rebind imediato'); return; }
  function atualizarVisibilidade(){ const bloco=document.getElementById('blocoDiretor'); const checkMatriz=document.getElementById('matriz'); const hidden=document.getElementById('diretor_usuario_id'); const display=document.getElementById('diretorUsuarioDisplay'); const isMatriz=!!(checkMatriz&&checkMatriz.checked); if(bloco) bloco.style.display=isMatriz?'':'none'; if(!isMatriz){ if(hidden) hidden.value=''; if(display) display.value=''; } }
  function normalizarNome(u){
    let nome = u.nome || (u.funcionario_id && u.funcionario_id.nome) || u.name || u.fullName || '';
    if(!nome){
      const base = (u.email||'').split('@')[0].replace(/[._-]+/g,' ').trim();
      if(base) nome = base.replace(/\b\w/g,m=>m.toUpperCase());
    }
    return nome || '-';
  }
  function renderLista(filtro=''){
    const ul=document.getElementById('listaDiretores'); if(!ul) return; ul.innerHTML='';
    const todos=Array.isArray(window.usuariosDiretor)?window.usuariosDiretor:[];
    const f=String(filtro||'').toLowerCase();
    const arr=f?todos.filter(u=> (u.email||'').toLowerCase().includes(f) || (u.role||'').toLowerCase().includes(f) || normalizarNome(u).toLowerCase().includes(f)):todos;
    arr.forEach(u=>{
      const li=document.createElement('li');
      li.className='list-group-item list-group-item-action';
      const nome=normalizarNome(u);
      const email=u.email||'';
      const nivel=u.role||'';
      li.textContent=`${nome}, ${email} (${nivel}).`;
      li.dataset.id=u._id;
      li.onclick=()=>{ ul.querySelectorAll('.active').forEach(el=>el.classList.remove('active')); li.classList.add('active'); };
      ul.appendChild(li);
    });
  }
  function bind(){
    if (window.__DiretorModuleBound){ console.debug('[diretor-module] bind chamado mas flag já verdadeira'); return; }
    const btn=document.getElementById('btnSelecionarDiretor');
    const busca=document.getElementById('buscaDiretor');
    const btnSel=document.getElementById('btnSelecionarDiretorModal');
    const hidden=document.getElementById('diretor_usuario_id');
    const display=document.getElementById('diretorUsuarioDisplay');
    const checkMatriz=document.getElementById('matriz');
    const form=document.getElementById('cadastroUnidadeForm');
    console.debug('[diretor-module] window.usuariosDiretor=', Array.isArray(window.usuariosDiretor)? window.usuariosDiretor.map(u=>({id:u._id,nome:u.nome,email:u.email})) : 'indefinido');
    function ensureModal(){
      let el=document.getElementById('modalDiretor');
      if(!el){
        console.debug('[diretor-module] modalDiretor ausente - injetando fallback');
        const wrap=document.createElement('div');
        wrap.innerHTML=`<div class="modal fade" id="modalDiretor" tabindex="-1" aria-labelledby="modalDiretorLabel" aria-hidden="true">\n  <div class="modal-dialog">\n    <div class="modal-content">\n      <div class="modal-header">\n        <h5 class="modal-title" id="modalDiretorLabel">Selecionar Diretor</h5>\n        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>\n      </div>\n      <div class="modal-body">\n        <input type="text" id="buscaDiretor" class="form-control mb-2" placeholder="Buscar usuário...">\n        <ul class="list-group" id="listaDiretores" style="max-height:300px; overflow-y:auto;"></ul>\n      </div>\n      <div class="modal-footer">\n        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>\n        <button type="button" class="btn btn-primary" id="btnSelecionarDiretorModal">Selecionar</button>\n      </div>\n    </div>\n  </div>\n</div>`;
        document.body.appendChild(wrap.firstElementChild);
        el=document.getElementById('modalDiretor');
      }
      return el;
    }
    window.openModalDiretor = function(){
      const el=ensureModal();
      if(!el){ console.warn('[diretor-module] não conseguiu criar modalDiretor'); return; }
      renderLista('');
      let inst=bootstrap.Modal.getInstance(el); if(!inst) inst=new bootstrap.Modal(el); inst.show();

    }

    // Fim do arquivo
    if(checkMatriz) checkMatriz.addEventListener('change', atualizarVisibilidade);
    atualizarVisibilidade();
    if(form) form.addEventListener('reset', ()=> setTimeout(atualizarVisibilidade,0));
    if(btn && typeof bootstrap!=='undefined'){
      btn.addEventListener('click',()=>{
        console.debug('[diretor-module] click btnSelecionarDiretor');
        const el=ensureModal();
        if(!el){ console.warn('[diretor-module] modalDiretor não disponível após ensureModal'); return; }
        // re-captura elementos que podem ter sido criados agora
        const buscaEl=document.getElementById('buscaDiretor');
        const btnSelEl=document.getElementById('btnSelecionarDiretorModal');
        renderLista('');
        if(buscaEl) buscaEl.value='';
        if(buscaEl && !buscaEl.__boundInput){ buscaEl.addEventListener('input', function(){ renderLista(this.value); }); buscaEl.__boundInput=true; }
        if(btnSelEl && !btnSelEl.__boundSelect){ btnSelEl.addEventListener('click', ()=>{ const ativo=document.querySelector('#listaDiretores .active'); if(!ativo){ alert('Selecione um usuário.'); return; } if(hidden) hidden.value=ativo.dataset.id; if(display) display.value=ativo.textContent; console.debug('[diretor-module] selecionado id=', ativo.dataset.id, 'valor=', ativo.textContent); const modal=bootstrap.Modal.getInstance(document.getElementById('modalDiretor')); if(modal) modal.hide(); }); btnSelEl.__boundSelect=true; }
        let inst=bootstrap.Modal.getInstance(el); if(!inst) inst=new bootstrap.Modal(el); inst.show();
      });
    }
    // Delegação global de segurança caso listener direto não tenha sido anexado
    document.addEventListener('click', function(ev){
  const trg = ev.target && ev.target.closest && (ev.target.closest('#btnSelecionarDiretor') || ev.target.closest('[data-open="modal-diretor"]'));
      if(!trg) return;
      if (trg.__handled) return; // evita dupla execução com listener direto
      trg.__handled = true; setTimeout(()=>trg.__handled=false, 300);
      if (typeof bootstrap === 'undefined') {
        console.debug('[diretor-module] bootstrap indisponível no clique, agendando retry');
        let tentativas = 0;
        const retry = () => {
          if (typeof bootstrap !== 'undefined') { window.openModalDiretor(); return; }
          if (++tentativas < 10) setTimeout(retry, 100);
          else console.warn('[diretor-module] abortado retry bootstrap');
        };
        retry();
        return;
      }
      window.openModalDiretor && window.openModalDiretor();
    });
    if(busca) busca.addEventListener('input', function(){ renderLista(this.value); });
    if(btnSel){
      btnSel.addEventListener('click', ()=>{
        const ativo=document.querySelector('#listaDiretores .active');
        if(!ativo){ alert('Selecione um usuário.'); return; }
        if(hidden) hidden.value=ativo.dataset.id;
        if(display) display.value=ativo.textContent;
        console.debug('[diretor-module] selecionado id=', ativo.dataset.id, 'valor=', ativo.textContent);
        const modal=bootstrap.Modal.getInstance(document.getElementById('modalDiretor'));
        if(modal) modal.hide();
      });
    }
    const modalEl=document.getElementById('modalDiretor');
    if (modalEl) modalEl.addEventListener('hidden.bs.modal', function(){ setTimeout(()=>{ if(!document.querySelector('.modal.show')){ document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove()); document.body.classList.remove('modal-open'); document.body.style.removeProperty('padding-right'); } }, 50); });
    window.__DiretorModuleBound = true;
    console.debug('[diretor-module] bind concluído');
  }
  document.addEventListener('DOMContentLoaded', function(){ console.debug('[diretor-module] DOMContentLoaded'); bind(); });
  if (document.readyState !== 'loading'){ console.debug('[diretor-module] document já pronto, bind imediato'); setTimeout(bind,0); }
  window.DiretorModule = { atualizarVisibilidade, bind, open: function(){ window.openModalDiretor && window.openModalDiretor(); } };
  console.debug('[diretor-module] objeto DiretorModule exposto');
})();
