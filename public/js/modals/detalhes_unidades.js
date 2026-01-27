// C:\Projeto3\public\js\modals\detalhes_unidades.js

(function(){
  function formatarCNPJ(valor){
    try{
      const c=String(valor||'').replace(/\D/g,'');
      if(c.length!==14) return valor||'';
      return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
    }catch(_){ return valor||''; }
  }
  function formatarCPF(valor){
    try{
      const c=String(valor||'').replace(/\D/g,'');
      if(c.length!==11) return valor||'';
      return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4');
    }catch(_){ return valor||''; }
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action="abrirDetalhes"]');
    if (!btn) return;
    const id = btn.getAttribute('data-id') || btn.closest('tr')?.getAttribute('data-id');
    const u = Array.isArray(window.unidadesFiltradas) ? window.unidadesFiltradas.find(x => String(x._id) === String(id)) : null;
    if (!u) return;
    const tbody = document.getElementById('detalhesModalTableBody');
    if (tbody) {
      const docLabel = (u.pessoaTipo === 'pf') ? 'CPF' : 'CNPJ';
      const docValue = (u.pessoaTipo === 'pf') ? formatarCPF(u.cpf || '') : formatarCNPJ(u.cnpj || '');
      const linhas = [
        ['Código', u.codigo || ''],
        ['Nome Fantasia', u.nome || ''],
        ['Razão Social', u.razaoSocial || ''],
        ['Tipo', u.subunidade ? 'Filial' : 'Matriz'],
        ['Matriz', u.is_principal ? 'Sim' : 'Não'],
        [docLabel, docValue],
        ['Endereço', u.endereco || ''],
        ['Telefone Fixo', u.telefoneFixo || ''],
        ['Telefone Celular', u.telefoneCelular || ''],
        ['E-mail Principal', u.emailPrincipal || ''],
        ['E-mail Fiscal', u.emailFiscal || ''],
        ['Site', u.site || ''],
        ['Banco', u.banco || ''],
        ['Agência', u.agencia || ''],
        ['C/C', u.contaCorrente || ''],
        ['PIX (tipo)', u.tipoPix || ''],
        ['PIX (chave)', u.pixChave || ''],
      ];
      tbody.innerHTML = linhas.map(([k, v]) => `<tr><th style="width:220px">${k}</th><td>${v || ''}</td></tr>`).join('');
    }
    const el = document.getElementById('detalhesModal');
    if (el) bootstrap.Modal.getOrCreateInstance(el).show();
  });
})();