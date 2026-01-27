(function(){
  function pick(source){
    if(!source) return '';
    for(var i = 1; i < arguments.length; i++){
      var key = arguments[i];
      if(Array.isArray(key)){
        if(key.length === 2 && key[0] && typeof key[0] === 'object'){
          var nested = key[0][key[1]];
          if(nested !== undefined && nested !== null && nested !== '') return nested;
          continue;
        }
      }
      if(typeof key === 'function'){
        var val = key(source);
        if(val !== undefined && val !== null && val !== '') return val;
        continue;
      }
      if(source[key] !== undefined && source[key] !== null && source[key] !== ''){
        return source[key];
      }
    }
    return '';
  }

  function formatDate(value){
    if(!value) return '';
    var str = String(value);
    if(/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(str)){
      return str.slice(8,10)+'/'+str.slice(5,7)+'/'+str.slice(0,4);
    }
    if(/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(str)) return str;
    return str;
  }

  function getVinculos(mat){
    if(mat.vinculos && mat.vinculos.length){
      return mat.vinculos.map(function(v){
        if(v == null) return '';
        if(typeof v === 'string') return v;
        return v.rotulo || v.nome || v.label || '';
      }).filter(Boolean);
    }
    if(mat.vinculo_area && (mat.vinculo_area.area_rotulo || mat.vinculo_area.area_nome || mat.vinculo_area.area || mat.vinculo_area.label)){
      return [mat.vinculo_area.area_rotulo || mat.vinculo_area.area_nome || mat.vinculo_area.area || mat.vinculo_area.label];
    }
    if(mat.areaRotulo || mat.area_rotulo || mat.areaNome || mat.area_nome || mat.area || mat.nome_area){
      return [mat.areaRotulo || mat.area_rotulo || mat.areaNome || mat.area_nome || mat.area || mat.nome_area];
    }
    return [];
  }

  function renderAnexos(mat){
    if(mat.anexoURL){
      return '<a href="'+String(mat.anexoURL)+'" target="_blank" rel="noopener">Abrir PDF</a>';
    }
    if(mat.anexo){
      var label = mat.anexoNome || 'Nota fiscal (PDF)';
      return '<a href="'+String(mat.anexo)+'" target="_blank" rel="noopener">'+label+'</a>';
    }
    if(Array.isArray(mat.anexos) && mat.anexos.length){
      return mat.anexos.map(function(a){ var url = a.url || '#'; var label = a.name || 'Anexo'; return '<a href="'+url+'" target="_blank" rel="noopener">'+label+'</a>'; }).join('<br>');
    }
    return '-';
  }

  window.WDG_MAT_DET = {
    abrir: function(mat){
      var el = document.getElementById('modalDetMateriaisCad'); if(!el) return;
      function set(id, txt){ var span = document.getElementById(id); if(span) span.textContent = (txt && String(txt).trim()) || '-'; }

      set('detMatUnidade', pick(
        mat,
        'unidadeRotulo',
        'unidade_label',
        'unidadeNome',
        'unidade_nome',
        'condominio',
        'condominio_nome',
        'condominioNome',
        'nomeCondominio',
        function(src){ return src && src.unidade ? (src.unidade.nome || src.unidade.codigo) : ''; },
        'unidadeId',
        'unidade_id'
      ));
      set('detMatTipo', pick(mat, 'tipo', function(src){ return src && src.natureza ? src.natureza.tipo : ''; }));
      set('detMatNome', pick(mat, 'nome', function(src){ return src && src.natureza ? src.natureza.nome : ''; }, 'descricao')); // fallback para natureza descrita
      set('detMatSerie', pick(mat, 'serie', 'patrimonio', 'codigo_patrimonio'));
      set('detMatMarca', pick(mat, 'marca'));
      set('detMatModelo', pick(mat, 'modelo'));
      set('detMatNumSerie', pick(mat, 'numSerie', 'num_serie'));
      set('detMatPeso', pick(mat, 'peso'));
      set('detMatCor', pick(mat, 'cor'));
      set('detMatData', formatDate(pick(mat, 'dataAquisicao', 'data_aquisicao')));

      var areasDiv = document.getElementById('detMatAreas');
      if(areasDiv){
        var vinculos = getVinculos(mat);
        areasDiv.innerHTML = vinculos.length ? vinculos.join('<br>') : '-';
      }

      var anexDiv = document.getElementById('detMatAnexos');
      if(anexDiv){
        anexDiv.innerHTML = renderAnexos(mat);
      }

      var descDiv = document.getElementById('detMatDesc');
      if(descDiv){
        var descricao = pick(mat, 'desc', 'descricao', 'descricao_completa');
        descDiv.textContent = descricao ? String(descricao) : '-';
      }

      var foto = document.getElementById('detMatFoto');
      var fotoVazio = document.getElementById('detMatFotoVazio');
      if(foto && fotoVazio){
        var fotoSrc = pick(mat, 'fotoURL', 'foto', 'imagem');
        if(fotoSrc){
          foto.src = fotoSrc;
          foto.classList.remove('d-none');
          fotoVazio.classList.add('d-none');
        } else {
          foto.src = '';
          foto.classList.add('d-none');
          fotoVazio.classList.remove('d-none');
        }
      }

      try{
        var m = bootstrap.Modal.getOrCreateInstance(el);
        m.show();
      }catch(_){ }
    }
  };
})();
