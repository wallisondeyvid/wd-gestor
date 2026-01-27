(function(w){
  'use strict';
  var ns = w.WDG_HAB = w.WDG_HAB || {};
  function labelById(arr,id){ if(!arr||!arr.length) return ''; var x = arr.find(function(o){ return o && o.id===id; }); return x? String(x.nome||'') : ''; }
  /**
   * Monta rótulo legível de uma habitação.
   * @param {Object} h - Habitação { tipo, blocoId, andarId, numero }
   * @param {Array} blocos - Cache de blocos [{id,nome}]
   * @param {Array} andares - Cache de andares [{id,nome}]
   * @param {Object} [opts]
   * @param {boolean} [opts.incluirTipo=true]
   * @returns {string}
   */
  ns.label = function(h, blocos, andares, opts){
    if(!h) return '';
    opts = opts || {};
    var incluirTipo = (opts.incluirTipo!==false);
    var partes = [];
    if(incluirTipo && h.tipo){ partes.push(String(h.tipo)); }
    var bloco = labelById(blocos, h.blocoId);
    var andar = labelById(andares, h.andarId);
    if(bloco) partes.push(bloco);
    if(andar) partes.push(andar);
    if(h.numero) partes.push(String(h.numero));
    return partes.join(' / ');
  };
})(window);
