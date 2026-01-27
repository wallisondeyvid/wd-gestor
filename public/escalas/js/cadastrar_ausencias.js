(function(){
  'use strict';
  const modalId='modalCadastrarAusencia';
  const state={ funcionario:null, autorizador:null, editing:false, editingId:null };
  function $(id){ return document.getElementById(id); }
  function dateBrToISO(d){ if(!d) return ''; const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return ''; const[_,dd,MM,yyyy]=m; return `${yyyy}-${MM}-${dd}`; }
  function abrir(){ const el=$(modalId); if(!el){ alert('Modal não encontrado'); return; } let inst=bootstrap.Modal.getInstance(el); if(!inst) inst=new bootstrap.Modal(el); inst.show(); }
  function habilitarMotivo(){ const sel=$('cadAusenciaTipo'); const ta=$('cadAusenciaMotivo'); if(!sel||!ta) return; if(sel.value==='Outros'){ ta.disabled=false; ta.placeholder='Descreva o motivo'; } else { ta.disabled=true; ta.value=''; ta.placeholder=''; } }
  function bind(){
    $('cadAusenciaTipo')?.addEventListener('change', habilitarMotivo);
    $('btnCadAusenciaBuscar')?.addEventListener('click', ()=>{
      if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){
        WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:(ret)=>{ const f=Array.isArray(ret)?ret[0]:ret; if(!f) return; state.funcionario={ id:f.id, nome:f.nome }; $('cadAusenciaFuncionario').value=f.nome; }});
      } else alert('Modal pesquisar efetivo indisponível');
    });
    $('btnCadAusenciaLimpar')?.addEventListener('click', ()=>{ state.funcionario=null; $('cadAusenciaFuncionario').value=''; });
    $('btnCadAusenciaBuscarAutorizador')?.addEventListener('click', ()=>{
      if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){
        WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:(ret)=>{ const a=Array.isArray(ret)?ret[0]:ret; if(!a) return; state.autorizador={ id:a.id, nome:a.nome }; $('cadAusenciaAutorizador').value=a.nome; }});
      } else alert('Modal pesquisar efetivo indisponível');
    });
    $('btnCadAusenciaLimparAutorizador')?.addEventListener('click', ()=>{ state.autorizador=null; $('cadAusenciaAutorizador').value=''; });
    $('btnSalvarAusencia')?.addEventListener('click', salvar);
    if(window.flatpickr){ const opts={ dateFormat:'d/m/Y', allowInput:true, locale:{ firstDayOfWeek:1, weekdays:{ shorthand:['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], longhand:['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'] }, months:{ shorthand:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], longhand:['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] } } }; window.flatpickr('#cadAusenciaInicio', opts); window.flatpickr('#cadAusenciaFim', opts); }
  }
  function salvar(){
    if(!state.funcionario){ alert('Selecione o funcionário.'); return; }
    const tipo=$('cadAusenciaTipo').value; if(!tipo){ alert('Informe o tipo de ausência.'); return; }
    const inicioBr=$('cadAusenciaInicio').value; const fimBr=$('cadAusenciaFim').value; if(!inicioBr||!fimBr){ alert('Informe as datas.'); return; }
    const inicioISO=dateBrToISO(inicioBr); const fimISO=dateBrToISO(fimBr); if(!inicioISO||!fimISO){ alert('Datas inválidas.'); return; }
    if(fimISO < inicioISO){ alert('Término não pode ser antes do início.'); return; }
    const motivoEl=$('cadAusenciaMotivo'); const motivo = (tipo==='Outros') ? (motivoEl.value||'').trim() : '';
    if(tipo==='Outros' && !motivo){ alert('Descreva o motivo para "Outros".'); return; }
    const registro= state.editing && state.editingId ? {
      id:state.editingId,
      funcionarioId:state.funcionario.id,
      funcionarioNome:state.funcionario.nome,
      tipo,
      inicio:inicioBr,
      fim:fimBr,
      inicioISO,
      fimISO,
      autorizadorId: state.autorizador? state.autorizador.id : undefined,
      autorizadorNome: state.autorizador? state.autorizador.nome : undefined,
      motivo,
      _edited:true
    } : {
      // Criação: backend gerará _id, não gerar UUID local para evitar confusão
      funcionarioId:state.funcionario.id,
      funcionarioNome:state.funcionario.nome,
      tipo,
      inicio:inicioBr,
      fim:fimBr,
      inicioISO,
      fimISO,
      autorizadorId: state.autorizador? state.autorizador.id : undefined,
      autorizadorNome: state.autorizador? state.autorizador.nome : undefined,
      motivo
    };
    if(window.WDG && typeof WDG.onAusenciaSalva==='function'){ window.WDG.onAusenciaSalva(registro, { editing: state.editing }); }
    const el=$(modalId); const inst=bootstrap.Modal.getInstance(el); if(inst) inst.hide(); resetState();
  }
  function expose(){
    window.WDG = window.WDG || {};
    window.WDG.abrirModalCadastrarAusencia = function(cfg){
      resetState();
      if(cfg && typeof cfg.onSave==='function') window.WDG.onAusenciaSalva = (registro,extra)=> cfg.onSave(registro, extra||{});
      if(cfg && cfg.modo==='editar' && cfg.registro){
        state.editing=true; state.editingId=cfg.registro.id;
        state.funcionario={ id:cfg.registro.funcionarioId, nome:cfg.registro.funcionarioNome };
        $('cadAusenciaFuncionario').value=state.funcionario.nome;
        $('cadAusenciaTipo').value=cfg.registro.tipo;
        $('cadAusenciaInicio').value=cfg.registro.inicio;
        $('cadAusenciaFim').value=cfg.registro.fim;
        if(cfg.registro.tipo==='Outros'){ $('cadAusenciaMotivo').disabled=false; $('cadAusenciaMotivo').value=cfg.registro.motivo||''; }
        if(cfg.registro.autorizador){ state.autorizador={ id:cfg.registro.autorizador.id, nome:cfg.registro.autorizador.nome }; $('cadAusenciaAutorizador').value=state.autorizador.nome; }
      }
      habilitarMotivo();
      abrir();
    };
  }
  function resetState(){
    state.funcionario=null; state.autorizador=null; state.editing=false; state.editingId=null;
    ['cadAusenciaFuncionario','cadAusenciaAutorizador','cadAusenciaInicio','cadAusenciaFim','cadAusenciaMotivo'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
    const tipo=$('cadAusenciaTipo'); if(tipo) tipo.value=''; const mot=$('cadAusenciaMotivo'); if(mot){ mot.disabled=true; mot.placeholder=''; }
  }
  document.addEventListener('DOMContentLoaded', ()=>{ bind(); expose(); });
})();