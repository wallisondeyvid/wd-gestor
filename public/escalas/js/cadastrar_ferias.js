(function(){
  'use strict';
  const modalId='modalCadastrarFerias';
  const state={ funcionario:null, editing:false, editingId:null };
  function dateBrToISO(d){
    if(!d) return '';
    const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(!m) return '';
    const [_,dd,MM,yyyy]=m; return `${yyyy}-${MM}-${dd}`;
  }
  function $(id){ return document.getElementById(id); }
  function abrir(){
    const el=document.getElementById(modalId); if(!el){ alert('Modal não encontrado'); return; }
    let inst=bootstrap.Modal.getInstance(el); if(!inst) inst=new bootstrap.Modal(el);
    inst.show();
  }
  function bind(){
    const btnBuscar=$('btnCadFeriasBuscar');
    const inpFunc=$('cadFeriasFuncionario');
    if(btnBuscar){ btnBuscar.onclick=()=>{
      if(window.WDG && typeof WDG.abrirModalPesquisarEfetivo==='function'){
        WDG.abrirModalPesquisarEfetivo({ mode:'single', onSelect:(ret)=>{
          // Pode vir objeto único ou array
          let f = ret;
            if(Array.isArray(ret)) f = ret[0];
            if(!f) return;
            state.funcionario={ id:f.id, nome:f.nome, codigo:f.codigo||f.matricula||f.id };
            inpFunc.value=state.funcionario.nome;
        }});
      } else { alert('Modal pesquisar efetivo indisponível'); }
    }; }
    $('btnSalvarFerias')?.addEventListener('click', ()=>{
      const inicioBr=$('cadFeriasInicio').value; const fimBr=$('cadFeriasFim').value;
      if(!state.funcionario){ alert('Selecione o funcionário.'); return; }
      if(!inicioBr||!fimBr){ alert('Informe início e término.'); return; }
      const inicioISO=dateBrToISO(inicioBr); const fimISO=dateBrToISO(fimBr);
      if(!inicioISO||!fimISO){ alert('Datas inválidas.'); return; }
      if(fimISO < inicioISO){ alert('Término não pode ser antes do início.'); return; }
      let registro;
      if(state.editing && state.editingId){
        registro={ id:state.editingId, funcionarioId:state.funcionario.id, nome:state.funcionario.nome, inicio:inicioBr, fim:fimBr, inicioISO, fimISO, _edited:true };
      } else {
        // No modo criação não geramos id local: backend definirá _id. Mantemos 'id' undefined.
        registro={ funcionarioId:state.funcionario.id, nome:state.funcionario.nome, inicio:inicioBr, fim:fimBr, inicioISO, fimISO };
      }
      if(window.WDG && typeof WDG.onFeriasSalvo==='function'){ window.WDG.onFeriasSalvo(registro, { editing: state.editing }); }
      const el=document.getElementById(modalId); const inst=bootstrap.Modal.getInstance(el); if(inst) inst.hide();
      // Reset parcial
      resetState();
    });
    // Inicializar flatpickr se disponível
    if(window.flatpickr){
      const opts={ dateFormat:'d/m/Y', allowInput:true, locale:{ firstDayOfWeek:1, weekdays:{ shorthand:['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], longhand:['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'] }, months:{ shorthand:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], longhand:['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] } } };
      window.flatpickr('#cadFeriasInicio', opts);
      window.flatpickr('#cadFeriasFim', opts);
    }
  }
  function expose(){
    window.WDG = window.WDG || {};
    window.WDG.abrirModalCadastrarFerias = function(cfg){
      resetState();
      if(cfg && typeof cfg.onSave==='function'){
        window.WDG.onFeriasSalvo = (registro,extra)=>{ cfg.onSave(registro,extra||{}); };
      }
      if(cfg && cfg.modo==='editar' && cfg.registro){
        state.editing=true; state.editingId=cfg.registro.id;
        state.funcionario={ id:cfg.registro.funcionarioId||cfg.registro.id, nome:cfg.registro.nome };
        $('cadFeriasFuncionario').value=state.funcionario.nome;
        $('cadFeriasInicio').value=cfg.registro.inicio;
        $('cadFeriasFim').value=cfg.registro.fim;
      }
      abrir();
    };
  }
  function resetState(){
    state.funcionario=null; state.editing=false; state.editingId=null;
    $('cadFeriasFuncionario').value=''; $('cadFeriasInicio').value=''; $('cadFeriasFim').value='';
  }
  document.addEventListener('DOMContentLoaded', ()=>{ bind(); expose(); });
})();
