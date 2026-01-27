(function(){
  var modalEl = document.getElementById('modalPesquisarPessoa');
  function ensureInBody(el){ try{ if(el && el.parentElement && el.parentElement.tagName !== 'BODY'){ document.body.appendChild(el); } }catch(_){} }
  function getModal(){
    try {
      if(!modalEl) modalEl = document.getElementById('modalPesquisarPessoa');
      if(!modalEl) return null;
      ensureInBody(modalEl);
      // Lazy resolve to avoid timing issues when bootstrap isn't ready at script load
      return (window.bootstrap && bootstrap.Modal && bootstrap.Modal.getOrCreateInstance)
        ? bootstrap.Modal.getOrCreateInstance(modalEl)
        : (window.bootstrap && bootstrap.Modal ? new bootstrap.Modal(modalEl) : null);
    } catch(_) { return null; }
  }
  var input = document.getElementById('psqPessoaQuery');
  var btn = document.getElementById('psqPessoaBtn');
  var list = document.getElementById('psqPessoaResultados');
  function render(items){ list.innerHTML = (items||[]).map(function(p,idx){ return '<button type="button" class="list-group-item list-group-item-action" data-idx="'+idx+'">'+p.nome+' <small class="text-muted">'+(p.doc||'')+'</small></button>'; }).join(''); }
  var last = [];
  var provider = null;
  function buscar(){
    var q = (input.value||'').trim();
    if (typeof provider === 'function') {
      try { last = provider(q) || []; } catch(_) { last = []; }
      render(last); return;
    }
    if(!q){ render([]); return; }
    // Simulação padrão
    last = [ { id:'1', nome:q }, { id:'2', nome:q+' Silva' }, { id:'3', nome:q+' Souza' } ];
    render(last);
  }
  if(btn) btn.addEventListener('click', buscar);
  if(input) input.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); buscar(); } });
  list && list.addEventListener('click', function(ev){ var t = ev.target.closest('[data-idx]'); if(!t) return; var idx = parseInt(t.getAttribute('data-idx'),10); var sel = last[idx]; if(sel && window.__onPessoaPick){ try { window.__onPessoaPick(sel); } catch(_){} } var m=getModal(); if(m) m.hide(); });
  window.abrirModalPesquisarPessoa = function(cb){ window.__onPessoaPick = function(p){ if(typeof cb==='function') cb(p); window.__onPessoaPick = null; }; var m=getModal(); if(m) m.show(); };
  // Permite injetar dados diretamente
  window.setModalPesquisarPessoaData = function(items){ try{ last = Array.isArray(items)? items : []; render(last); var m=getModal(); if(m) m.show(); }catch(_){} };
  // Permite sobrescrever o provedor de busca (retorna array de pessoas a partir do termo)
  window.overridePesquisarPessoaProvider = function(fn){ provider = (typeof fn==='function') ? fn : null; };
})();
