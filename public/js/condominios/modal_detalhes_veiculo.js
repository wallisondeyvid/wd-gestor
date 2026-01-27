(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  const modalEl = document.getElementById('modalDetalhesVeiculo');
  if(!modalEl) return;
  if(typeof bootstrap === 'undefined' || !bootstrap.Modal){ console.warn('[modal_detalhes_veiculo] Bootstrap Modal indisponível'); return; }
  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', focus: true });

  const refs = {
    titulo: document.getElementById('detVeicTitulo'),
    habInfo: document.getElementById('detVeicHabInfo'),
    placa: document.getElementById('detVeicPlaca'),
    tipo: document.getElementById('detVeicTipo'),
    marcaModelo: document.getElementById('detVeicMarcaModelo'),
    anoModelo: document.getElementById('detVeicAnoModelo'),
    chassi: document.getElementById('detVeicChassi'),
    renavam: document.getElementById('detVeicRenavam'),
    estado: document.getElementById('detVeicEstado'),
    municipio: document.getElementById('detVeicMunicipio'),
    situacao: document.getElementById('detVeicSituacao'),
    ownerTipo: document.getElementById('detVeicOwnerTipo'),
    ownerNome: document.getElementById('detVeicOwnerNome'),
    ownerCpf: document.getElementById('detVeicOwnerCpf'),
    ownerEmail: document.getElementById('detVeicOwnerEmail'),
    ownerNascimento: document.getElementById('detVeicOwnerNascimento'),
    ownerCnh: document.getElementById('detVeicOwnerCnh'),
    ownerDocArea: document.getElementById('detVeicOwnerDocArea'),
    garagem: document.getElementById('detVeicGaragem'),
    criado: document.getElementById('detVeicCriado'),
    atualizado: document.getElementById('detVeicAtualizado'),
    crlvArea: document.getElementById('detVeicCrlvArea'),
    descricao: document.getElementById('detVeicDescricao'),
    docsResumo: document.getElementById('detVeicDocsResumo'),
    fotosWrap: document.getElementById('detVeicFotosWrap'),
    fotosGrid: document.getElementById('detVeicFotosGrid'),
    fotosCount: document.getElementById('detVeicFotosCount'),
    fotosEmpty: document.getElementById('detVeicFotosEmpty')
  };

  function text(el, value){ if(!el) return; el.textContent = value == null || value === '' ? '-' : String(value); }

  function escapeHtml(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  function formatPlate(value){
    const v = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!v) return '';
    if(v.length <= 3) return v;
    return v.slice(0,3) + '-' + v.slice(3);
  }

  function onlyDigits(val){ return String(val || '').replace(/\D+/g,''); }

  function formatCpf(val){
    const digits = onlyDigits(val).slice(0,11);
    if(digits.length !== 11) return digits;
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
  }

  function formatDateBr(dateLike, includeTime){
    if(!dateLike) return '';
    let date;
    if(dateLike instanceof Date && !isNaN(dateLike)) date = dateLike;
    else {
      const isoMatch = String(dateLike).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if(isoMatch){
        date = new Date(Date.UTC(+isoMatch[1], +isoMatch[2]-1, +isoMatch[3], +(isoMatch[4]||'0'), +(isoMatch[5]||'0'), +(isoMatch[6]||'0')));
      } else {
        const parts = String(dateLike).split(/[\/\-]/).map(p => parseInt(p,10));
        if(parts.length === 3){
          if(String(dateLike).includes('/')) date = new Date(parts[2], parts[1]-1, parts[0]);
          else date = new Date(parts[0], parts[1]-1, parts[2]);
        }
      }
    }
    if(!date || isNaN(date)) return '';
    const dd = String(date.getDate()).padStart(2,'0');
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const yyyy = date.getFullYear();
    if(!includeTime) return `${dd}/${mm}/${yyyy}`;
    const hh = String(date.getHours()).padStart(2,'0');
    const mi = String(date.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function normalizeVehicle(raw){
    const data = raw && typeof raw === 'object' ? raw : {};
    const veic = {};
    veic.placa = formatPlate(data.placa || data.licensePlate || '');
    veic.tipo = data.tipo || data.tipo_veiculo || data.vehicleType || '';
    veic.marca = data.marca || data.brand || '';
    veic.marca_extra = data.marca_extra || data.marca_outros || data.brandExtra || '';
    veic.modelo = data.modelo || data.model || '';
    veic.cor = data.cor || data.color || '';
    veic.ano = Number.isFinite(data.ano) ? data.ano : parseInt(data.ano,10) || null;
    veic.ano_modelo = Number.isFinite(data.ano_modelo) ? data.ano_modelo : parseInt(data.ano_modelo,10) || null;
    veic.chassi = (data.chassi || data.chassis || '').toString().toUpperCase();
    veic.renavam = onlyDigits(data.renavam || data.renavam_numero || data.renavamNumero || '');
    veic.estado = (data.estado || data.uf || '').toString().toUpperCase();
    veic.municipio = data.municipio || data.cidade || '';
    veic.descricao = data.descricao || data.observacoes || data.obs || '';
    veic.ativa = data.ativa !== false;
    veic.createdAt = data.createdAt || data.criado_em || data.data_criacao || null;
    veic.updatedAt = data.updatedAt || data.atualizado_em || data.data_atualizacao || null;

    const ownerRaw = (data.proprietario && typeof data.proprietario === 'object') ? data.proprietario : {};
    const ownerTipo = data.proprietario_tipo || ownerRaw.tipo || ownerRaw.type || 'morador';
    const owner = {
      tipo: ownerTipo,
      nome: ownerRaw.nome || ownerRaw.name || data.proprietario_nome || data.ownerName || '',
      email: ownerRaw.email || data.proprietario_email || data.ownerEmail || '',
      cpf: ownerRaw.cpf || data.proprietario_cpf || data.ownerCpf || '',
      nascimento: ownerRaw.data_nascimento || ownerRaw.nascimento || data.proprietario_data_nascimento || '',
      cnh_numero: ownerRaw.cnh_numero || (ownerRaw.cnh && ownerRaw.cnh.numero) || data.proprietario_cnh_numero || '',
      cnh_categoria: ownerRaw.cnh_categoria || (ownerRaw.cnh && ownerRaw.cnh.categoria) || data.proprietario_cnh_categoria || '',
      cnh_doc: null
    };
    const ownerDoc = ownerRaw.cnh_documento || (ownerRaw.cnh && (ownerRaw.cnh.documento || ownerRaw.cnh.arquivo)) || data.proprietario_cnh || data.ownerCnhDoc;
    if(ownerDoc && typeof ownerDoc === 'object'){
      owner.cnh_doc = {
        url: ownerDoc.url || ownerDoc.href || '',
        nome: ownerDoc.nome || ownerDoc.name || 'CNH',
        mime: ownerDoc.mime || ownerDoc.contentType || ownerDoc.type || '',
        tamanho: ownerDoc.tamanho || ownerDoc.size || null
      };
    }
    owner.cpf = formatCpf(owner.cpf);
    owner.nascimento = formatDateBr(owner.nascimento);
    owner.cnh_numero = onlyDigits(owner.cnh_numero);
    veic.owner = owner;

    const crlvRaw = data.crlv || (data.documentos && data.documentos.crlv) || data.crlvDocumento || null;
    veic.crlv = crlvRaw && typeof crlvRaw === 'object'
      ? {
          url: crlvRaw.url || crlvRaw.href || '',
          nome: crlvRaw.nome || crlvRaw.name || 'CRLV',
          mime: crlvRaw.mime || crlvRaw.contentType || crlvRaw.type || '',
          tamanho: crlvRaw.tamanho || crlvRaw.size || null
        }
      : (typeof crlvRaw === 'string' ? { url: crlvRaw } : null);

    veic.garagem = {
      id: data.garagem_id || data.garagem || null,
      nome: data.garagem_nome || data.garagem || '',
      codigo: data.garagem_codigo || ''
    };

    const fotosRaw = Array.isArray(data.fotos) ? data.fotos : [];
    veic.fotos = fotosRaw
      .map(f => {
        if(!f) return null;
        if(typeof f === 'string') return { url: f, nome: 'Foto do veículo' };
        const item = {
          url: f.url || f.href || '',
          nome: f.nome || f.name || 'Foto do veículo',
          mime: f.mime || f.contentType || '',
          tamanho: f.tamanho || f.size || null
        };
        if(!item.url && typeof f.file === 'string' && f.file.startsWith('data:')) item.url = f.file;
        return item.url ? item : null;
      })
      .filter(Boolean);

    return veic;
  }

  function formatHabLabel(hab){
    if(!hab || typeof hab !== 'object') return '';
    const unidade = hab.unidade || {};
    const unidadeRotulo = [unidade.codigo, unidade.nome].filter(Boolean).join(' - ');
    const bloco = hab.bloco && hab.bloco.nome ? `Bloco ${hab.bloco.nome}` : '';
    const andar = hab.andar && hab.andar.nome ? hab.andar.nome : '';
    const numero = hab.numero ? `Hab. ${hab.numero}` : '';
    return [unidadeRotulo, bloco, andar, numero].filter(Boolean).join(' · ');
  }

  function buildDocLink(doc, labelFallback){
    if(!doc) return null;
    const url = doc.url || '';
    if(!url || !(url.startsWith('http') || url.startsWith('data:'))) return null;
    const label = doc.nome || labelFallback || 'Documento';
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = `<i class="bi bi-file-earmark-text"></i> ${escapeHtml(label)}`;
    return a;
  }

  function buildFotoCard(foto){
    const col = document.createElement('div');
    col.className = 'col-sm-6 col-lg-4';
    const card = document.createElement('div');
    card.className = 'wdg-foto-card';
    const img = document.createElement('img');
    img.src = foto.url;
    img.alt = foto.nome || 'Foto do veículo';
    card.appendChild(img);
    const link = document.createElement('a');
    link.href = foto.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Abrir foto';
    card.appendChild(link);
    col.appendChild(card);
    return col;
  }

  function preencher(vehicle, context){
    const veic = normalizeVehicle(vehicle);
    const habitacao = context && context.habitacao ? context.habitacao : null;
    const habLabel = context && context.habLabel ? context.habLabel : formatHabLabel(habitacao);

    text(refs.titulo, veic.placa ? `Veículo · ${veic.placa}` : 'Detalhes do veículo');
    text(refs.habInfo, habLabel || '');

    text(refs.placa, veic.placa || '—');
    text(refs.tipo, veic.tipo || '—');
    const marcaRotulo = (veic.marca && veic.marca.toLowerCase() === 'outro') ? (veic.marca_extra || 'Outro') : veic.marca;
    text(refs.marcaModelo, [marcaRotulo, veic.modelo].filter(Boolean).join(' / ') || '—');
    text(refs.anoModelo, veic.ano ? `${veic.ano}/${veic.ano_modelo || '----'}` : '—');
    text(refs.chassi, veic.chassi || '—');
    text(refs.renavam, veic.renavam || '—');
    text(refs.estado, veic.estado || '—');
    text(refs.municipio, veic.municipio || '—');
    text(refs.situacao, veic.ativa ? 'Ativo' : 'Inativo');

    const owner = veic.owner || {};
    const ownerTipoLabel = owner.tipo === 'externo' ? 'Proprietário externo' : 'Morador cadastrado';
    text(refs.ownerTipo, ownerTipoLabel);
    text(refs.ownerNome, owner.nome || '—');
    text(refs.ownerCpf, owner.cpf || '—');
    text(refs.ownerEmail, owner.email || '—');
    text(refs.ownerNascimento, owner.nascimento || '—');
    const cnhRotulo = owner.cnh_numero ? `${owner.cnh_numero}${owner.cnh_categoria ? ' · Cat. ' + owner.cnh_categoria : ''}` : (owner.cnh_categoria ? `Cat. ${owner.cnh_categoria}` : '—');
    text(refs.ownerCnh, cnhRotulo || '—');

    refs.ownerDocArea.innerHTML = '';
    const ownerDocLink = buildDocLink(owner.cnh_doc, 'CNH anexada');
    if(ownerDocLink){ refs.ownerDocArea.appendChild(ownerDocLink); }

    const garagemLabel = veic.garagem && (veic.garagem.nome || veic.garagem.codigo) ? [veic.garagem.nome, veic.garagem.codigo].filter(Boolean).join(' · ') : 'Não vinculado';
    text(refs.garagem, garagemLabel);
    text(refs.criado, formatDateBr(veic.createdAt, true) || '—');
    text(refs.atualizado, formatDateBr(veic.updatedAt, true) || '—');

    refs.crlvArea.innerHTML = '';
    const crlvLink = buildDocLink(veic.crlv, 'CRLV');
    if(crlvLink){ refs.crlvArea.appendChild(crlvLink); }

    const descricao = (veic.descricao || '').toString().trim();
    refs.descricao.textContent = descricao || 'Nenhuma descrição informada.';

    const totalDocs = (ownerDocLink ? 1 : 0) + (crlvLink ? 1 : 0);
    const totalFotos = veic.fotos ? veic.fotos.length : 0;
    if(refs.docsResumo){
      if(totalDocs === 0 && totalFotos === 0) refs.docsResumo.textContent = 'Sem anexos';
      else {
        const partes = [];
        if(totalDocs) partes.push(`${totalDocs} documento${totalDocs>1?'s':''}`);
        if(totalFotos) partes.push(`${totalFotos} foto${totalFotos>1?'s':''}`);
        refs.docsResumo.textContent = partes.join(' · ');
      }
    }

    refs.fotosGrid.innerHTML = '';
    if(totalFotos){
      refs.fotosEmpty.classList.add('d-none');
      refs.fotosCount.textContent = `${totalFotos} foto${totalFotos>1?'s':''}`;
      veic.fotos.forEach(f => {
        const card = buildFotoCard(f);
        if(card) refs.fotosGrid.appendChild(card);
      });
    } else {
      refs.fotosCount.textContent = '0 fotos';
      refs.fotosEmpty.classList.remove('d-none');
    }
  }

  function abrir(vehicle, context){
    try{ preencher(vehicle, context || {}); }catch(err){ console.error('[modal_detalhes_veiculo] falha ao preencher', err); }
    bsModal.show();
  }

  window.WDG_VEIC_DET = {
    abrir
  };
})();
