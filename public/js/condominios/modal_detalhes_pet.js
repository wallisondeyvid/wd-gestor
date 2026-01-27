(function(){
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');
  const modalEl = document.getElementById('modalDetalhesPet');
  if(!modalEl){ return; }
  if(typeof bootstrap === 'undefined' || !bootstrap.Modal){ console.warn('[modal_detalhes_pet] Bootstrap Modal indisponivel'); return; }
  const bsModal = new bootstrap.Modal(modalEl, { backdrop: 'static', focus: true });

  const refs = {
    nome: document.getElementById('detPetNome'),
    habInfo: document.getElementById('detPetHabInfo'),
    avatarImg: document.getElementById('detPetFoto'),
    avatarInitial: document.getElementById('detPetFotoInicial'),
    heroImg: document.getElementById('detPetHeroImg'),
    heroInitial: document.getElementById('detPetHeroInitial'),
    heroAuxBadge: document.getElementById('detPetHeroAuxBadge'),
    heroFrame: document.getElementById('detPetHeroFrame'),
    especieLabel: document.getElementById('detPetEspecieLabel'),
    resumo: document.getElementById('detPetResumo'),
    badgeList: document.getElementById('detPetBadgeList'),
    infoGrid: document.getElementById('detPetInfoGrid'),
    habResumo: document.getElementById('detPetHabResumo'),
    propNome: document.getElementById('detPetPropNome'),
    propContato: document.getElementById('detPetPropContato'),
    criado: document.getElementById('detPetCriado'),
    atualizado: document.getElementById('detPetAtualizado'),
    descricao: document.getElementById('detPetDescricao'),
    lastNote: document.getElementById('detPetLastNote'),
    saudeWrap: document.getElementById('detPetSaudeWrap'),
    saudeList: document.getElementById('detPetSaudeList'),
    docsList: document.getElementById('detPetDocsList')
  };

  const ownerCacheById = new Map();
  const ownerCacheByEmail = new Map();
  let ownerListPromise = null;

  if(refs.heroFrame){
    refs.heroFrame.addEventListener('click', () => {
      const url = refs.heroFrame.dataset.photoUrl;
      if(url){
        try { window.open(url, 'petFoto', 'noopener=yes,width=900,height=700'); }
        catch(_e){ window.open(url, '_blank', 'noopener'); }
      }
    });
    refs.heroFrame.addEventListener('keydown', ev => {
      if(ev.key === 'Enter' || ev.key === ' '){
        ev.preventDefault();
        const url = refs.heroFrame.dataset.photoUrl;
        if(url){
          try { window.open(url, 'petFoto', 'noopener=yes,width=900,height=700'); }
          catch(_e){ window.open(url, '_blank', 'noopener'); }
        }
      }
    });
  }

  function text(el, value, fallback){
    if(!el) return;
    const val = value == null || value === '' ? (fallback != null ? fallback : '—') : value;
    el.textContent = val;
  }

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, function(ch){
      switch(ch){
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case '\'': return '&#39;';
        default: return ch;
      }
    });
  }

  function arrayFrom(raw){
    if(!raw) return [];
    if(Array.isArray(raw)) return raw.filter(Boolean).map(v => String(v));
    return [String(raw)].filter(Boolean);
  }

  function toArray(raw){
    if(raw == null) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  async function ensureOwnerList(){
    if(ownerListPromise) return ownerListPromise;
    if(ownerCacheById.size) return ownerCacheById;
    if(typeof fetch !== 'function') return ownerCacheById;
    const url = `${basePath}/api/proprietarios/busca?_ts=${Date.now()}`;
    ownerListPromise = fetch(url, { cache: 'no-store' })
      .then(res => res.ok ? res.json() : [])
      .then(list => {
        if(Array.isArray(list)){
          list.forEach(item => {
            if(!item || typeof item !== 'object') return;
            const idKey = String(item._id || item.id || '').trim();
            if(idKey) ownerCacheById.set(idKey, item);
            const emailKey = String(item.email || item.contato_email || '').trim().toLowerCase();
            if(emailKey) ownerCacheByEmail.set(emailKey, item);
          });
        }
        return ownerCacheById;
      })
      .catch(() => ownerCacheById)
      .finally(() => { ownerListPromise = null; });
    return ownerListPromise;
  }

  async function hydrateOwnerContact(owner){
    if(!owner || typeof owner !== 'object') return owner;
    if(owner.__wdgContactLoaded) return owner;
    if(owner.__wdgContactPromise) return owner.__wdgContactPromise;
    const promise = (async () => {
      const idKey = String(owner._id || owner.id || '').trim();
      const emailKey = String(owner.email || owner.contato_email || (owner.usuario && owner.usuario.email) || (owner.contato && owner.contato.email) || '').trim().toLowerCase();
      if(!idKey && !emailKey){ owner.__wdgContactLoaded = true; return owner; }
      await ensureOwnerList();
      let enriched = null;
      if(idKey && ownerCacheById.has(idKey)) enriched = ownerCacheById.get(idKey);
      if(!enriched && emailKey && ownerCacheByEmail.has(emailKey)) enriched = ownerCacheByEmail.get(emailKey);
      if(enriched && typeof enriched === 'object'){
        Object.assign(owner, enriched);
      }
      owner.__wdgContactLoaded = true;
      return owner;
    })().finally(() => { owner.__wdgContactPromise = null; });
    owner.__wdgContactPromise = promise;
    return promise;
  }

  function parseFoto(raw){
    if(!raw) return null;
    if(typeof raw === 'string'){ return { url: raw, nome: 'Foto do pet' }; }
    if(typeof raw === 'object'){
      const url = raw.url || raw.href || raw.file || '';
      if(!url) return null;
      return {
        url,
        nome: raw.nome || raw.name || 'Foto do pet',
        mime: raw.mime || raw.contentType || raw.type || '',
        tamanho: raw.tamanho || raw.size || null
      };
    }
    return null;
  }

  function normalizeDocs(raw){
    if(!raw) return [];
    const list = Array.isArray(raw) ? raw : Object.keys(raw).map(key => raw[key]);
    return list.map(item => {
      if(!item) return null;
      if(typeof item === 'string') return { url: item, nome: 'Documento' };
      if(typeof item === 'object'){
        const url = item.url || item.href || '';
        if(!url) return null;
        return {
          url,
          nome: item.nome || item.name || 'Documento',
          descricao: item.descricao || item.description || '',
          mime: item.mime || item.type || ''
        };
      }
      return null;
    }).filter(Boolean);
  }

  function toBoolean(value){
    if(value === true) return true;
    if(typeof value === 'string'){ return value.trim().toLowerCase() === 'sim'; }
    return false;
  }

  function normalizePet(raw){
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      nome: data.nome || data.name || '',
      especie: data.especie || data.species || '',
      especie_outro: data.especie_outro || data.speciesOther || '',
      raca: data.raca || data.breed || '',
      cor: data.cor || data.color || '',
      peso: data.peso || data.weight || '',
      porte: data.porte || data.size || data.porte_fisico || '',
      sexo: data.sexo || data.gender || '',
      temperamento: data.temperamento || data.comportamento || data.behavior || '',
      nascimento: data.nascimento || data.data_nascimento || '',
      microchip: data.microchip || data.microchip_id || data.id_microchip || '',
      registro: data.registro || data.rga || data.registro_geral || '',
      aux_needs: toBoolean(data.aux_needs || data.auxNeeds || data.assistencia),
      observacoes: data.observacoes || data.descricao || data.notas || '',
      lastNoteAt: data.lastNoteAt || data.observacoes_atualizado_em || '',
      cuidados: arrayFrom(data.cuidados || data.cuidados_especiais || data.care),
      alergias: arrayFrom(data.alergias || data.allergies),
      restricoes: arrayFrom(data.restricoes || data.restricoes_alimentares || data.dieta || data.dietas),
      vacinas: arrayFrom(data.vacinas || data.vaccines),
      medicacoes: arrayFrom(data.medicacoes || data.medicines || data.medications),
      exames: arrayFrom(data.exames || data.checkups || data.exames_recorrentes),
      foto: parseFoto(data.foto || data.photo || null),
      documentos: normalizeDocs(data.documentos || data.docs || data.documentos_saude),
      createdAt: data.createdAt || data.criado_em || data.data_criacao || '',
      updatedAt: data.updatedAt || data.atualizado_em || data.data_atualizacao || ''
    };
  }

  function parseDateInput(value){
    if(!value) return null;
    if(value instanceof Date && !isNaN(value.getTime())) return value;
    if(typeof value === 'number'){ const d = new Date(value); return isNaN(d.getTime()) ? null : d; }
    const str = String(value).trim();
    if(!str) return null;
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if(iso){
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4]||0), Number(iso[5]||0), Number(iso[6]||0));
    }
    const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s(\d{2}):(\d{2}))?/);
    if(br){
      return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4]||0), Number(br[5]||0));
    }
    const d = new Date(str);
    if(!isNaN(d.getTime())) return d;
    return null;
  }

  function formatDateBr(value, includeTime){
    const date = parseDateInput(value);
    if(!date) return '';
    const dd = String(date.getDate()).padStart(2,'0');
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const yyyy = date.getFullYear();
    if(!includeTime) return `${dd}/${mm}/${yyyy}`;
    const hh = String(date.getHours()).padStart(2,'0');
    const mi = String(date.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }

  function calcAgeLabel(value){
    const date = parseDateInput(value);
    if(!date) return '';
    const now = new Date();
    if(date.getTime() > now.getTime()) return '';
    let years = now.getFullYear() - date.getFullYear();
    let months = now.getMonth() - date.getMonth();
    const daysDiff = now.getDate() - date.getDate();
    if(daysDiff < 0){ months -= 1; }
    if(months < 0){ years -= 1; months += 12; }
    if(years < 0){ years = 0; }
    if(months < 0){ months = 0; }
    const parts = [];
    if(years > 0){ parts.push(`${years} ano${years>1?'s':''}`); }
    if(months > 0){ parts.push(`${months} m${months>1?'e':'ê'}s${months>1?'es':''}`); }
    if(!parts.length) parts.push('menos de 1 mês');
    return parts.join(' e ');
  }

  function formatSexo(value){
    const str = String(value || '').trim().toLowerCase();
    if(!str) return '';
    if(str === 'm' || str === 'macho') return 'Macho';
    if(str === 'f' || str === 'femea' || str === 'fêmea') return 'Fêmea';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function formatPeso(value){
    if(value == null || value === '') return '';
    if(typeof value === 'number' && !isNaN(value)){
      return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
    }
    let str = String(value).trim();
    if(!str) return '';
    str = str.replace(/kg/i, '').trim();
    if(!str) return '';
    str = str.replace('.', ',');
    const parts = str.split(',');
    let inteiro = parts[0].replace(/\D/g,'');
    let decimal = parts[1] ? parts[1].replace(/\D/g,'') : '';
    if(!inteiro) inteiro = '0';
    decimal = (decimal + '00').slice(0, 2);
    return `${parseInt(inteiro,10)}${decimal ? ','+decimal : ',00'} kg`;
  }

  function digitsOnly(val){ return String(val || '').replace(/\D+/g,''); }

  function formatPhone(value){
    const digits = digitsOnly(value);
    if(!digits) return '';
    if(digits.length === 11){
      return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    }
    if(digits.length === 10){
      return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    }
    if(digits.length === 9){ return `${digits.slice(0,5)}-${digits.slice(5)}`; }
    if(digits.length === 8){ return `${digits.slice(0,4)}-${digits.slice(4)}`; }
    return digits;
  }

  function formatHabLabel(hab){
    if(!hab || typeof hab !== 'object') return '';
    const unidade = hab.unidade || {};
    const unidadeRotulo = [unidade.codigo, unidade.nome].filter(Boolean).join(' - ');
    const bloco = hab.bloco && hab.bloco.nome ? `Bloco ${hab.bloco.nome}` : '';
    const andar = hab.andar && hab.andar.nome ? hab.andar.nome : '';
    const numero = hab.numero != null ? String(hab.numero) : '';
    return [unidadeRotulo, bloco, andar, numero].filter(Boolean).join(' · ');
  }

  function normalizeWhatsappFlag(val){
    if(typeof val === 'boolean') return val;
    if(val == null) return null;
    const str = String(val).trim().toLowerCase();
    if(!str) return null;
    if(['1','s','sim','y','yes','true'].includes(str)) return true;
    if(['0','n','nao','não','não','false','nao possui','sem'].includes(str)) return false;
    return null;
  }

  function extractPhoneEntry(raw){
    if(!raw) return null;
    if(typeof raw === 'string' || typeof raw === 'number'){
      const digits = digitsOnly(raw);
      return digits ? { digits, whatsapp: null } : null;
    }
    if(typeof raw === 'object'){
      const num = raw.numero || raw.phone || raw.telefone || raw.celular || raw.value || raw.contato;
      const digits = digitsOnly(num);
      if(!digits) return null;
      return { digits, whatsapp: normalizeWhatsappFlag(raw.whatsapp) };
    }
    return null;
  }

  function buildContatoHtml(proprietario){
    if(!proprietario || typeof proprietario !== 'object') return '';

    const candidateObjs = [
      proprietario,
      proprietario.contato,
      proprietario.usuario,
      proprietario.user,
      proprietario.dados,
      proprietario.info
    ].filter(Boolean);

    const phoneSources = [];
    candidateObjs.forEach(src => {
      phoneSources.push(
        ...toArray(src.telefone),
        ...toArray(src.celular),
        ...toArray(src.contato_telefone),
        ...toArray(src.contato_celular),
        ...toArray(src.phone),
        ...toArray(src.mobile),
        ...toArray(src.fone),
        ...toArray(src.whatsapp_numero),
        ...toArray(src.telefones),
        ...toArray(src.phones)
      );
    });

    const seen = new Set();
    const phones = [];
    phoneSources.forEach(src => {
      const entry = extractPhoneEntry(src);
      if(!entry || !entry.digits || seen.has(entry.digits)) return;
      const formatted = formatPhone(entry.digits);
      if(!formatted) return;
      seen.add(entry.digits);
      phones.push({
        digits: entry.digits,
        formatted,
        whatsapp: entry.whatsapp
      });
    });

    let globalWhatsapp = normalizeWhatsappFlag(proprietario.whatsapp);
    if(globalWhatsapp == null){
      for(let i=0;i<candidateObjs.length;i++){
        const flag = normalizeWhatsappFlag(candidateObjs[i].whatsapp);
        if(flag != null){ globalWhatsapp = flag; break; }
      }
    }
    if(globalWhatsapp != null && phones.length){
      phones.forEach(ph => {
        if(ph.whatsapp == null) ph.whatsapp = globalWhatsapp;
      });
    }

    const primaryPhone = phones.find(p => p.whatsapp === true) || (phones.length ? phones[0] : null);
    const emailValues = [];
    candidateObjs.forEach(src => {
      emailValues.push(
        ...toArray(src.email),
        ...toArray(src.contato_email),
        ...toArray(src.mail),
        ...toArray(src.emails)
      );
    });
    const emails = [];
    emailValues.forEach(val => {
      if(!val) return;
      if(typeof val === 'object'){
        const inner = val.email || val.contato || val.value || val.address || '';
        if(inner) emails.push(escapeHtml(String(inner)));
      } else {
        emails.push(escapeHtml(String(val)));
      }
    });

    const parts = [];
    if(primaryPhone){
      const flag = primaryPhone.whatsapp;
      let whatsappClass = 'text-muted opacity-50';
      let whatsappTitle = 'WhatsApp não informado';
      if(flag === true){ whatsappClass = 'text-success'; whatsappTitle = 'Tem WhatsApp'; }
      else if(flag === false){ whatsappClass = 'text-muted opacity-75'; whatsappTitle = 'Sem WhatsApp'; }
      const whatsappIcon = `<i class="bi bi-whatsapp ${whatsappClass} wdg-pet-wa-icon" aria-hidden="true" title="${escapeHtml(whatsappTitle)}"></i>`;
      parts.push(`${escapeHtml(primaryPhone.formatted)} ${whatsappIcon}`);
    }

    if(emails.length){
      parts.push(`<span class="wdg-pet-mail">${emails[0]}</span>`);
    }

    return parts.join(' / ');
  }

  function setAvatarDisplay(pet){
    const initialBase = (pet.nome || pet.especie || 'P').trim();
    const initial = initialBase ? initialBase.charAt(0).toUpperCase() : 'P';
    if(refs.avatarInitial) refs.avatarInitial.textContent = initial;
    if(refs.heroInitial) refs.heroInitial.textContent = initial;
    const foto = pet.foto && pet.foto.url ? pet.foto : null;
    const fotoUrl = foto && (foto.url.startsWith('http') || foto.url.startsWith('data:') ? foto.url : basePath + foto.url);
    if(foto){
      if(refs.avatarImg){ refs.avatarImg.src = fotoUrl; refs.avatarImg.classList.remove('d-none'); }
      if(refs.avatarInitial){ refs.avatarInitial.classList.add('d-none'); }
      if(refs.heroImg){ refs.heroImg.src = fotoUrl; refs.heroImg.classList.remove('d-none'); }
      if(refs.heroInitial){ refs.heroInitial.classList.add('d-none'); }
      if(refs.heroFrame){ refs.heroFrame.dataset.photoUrl = fotoUrl; refs.heroFrame.classList.add('wdg-pet-hero-frame--has-photo'); }
    } else {
      if(refs.avatarImg){ refs.avatarImg.src = ''; refs.avatarImg.classList.add('d-none'); }
      if(refs.avatarInitial){ refs.avatarInitial.classList.remove('d-none'); }
      if(refs.heroImg){ refs.heroImg.src = ''; refs.heroImg.classList.add('d-none'); }
      if(refs.heroInitial){ refs.heroInitial.classList.remove('d-none'); }
      if(refs.heroFrame){ delete refs.heroFrame.dataset.photoUrl; refs.heroFrame.classList.remove('wdg-pet-hero-frame--has-photo'); }
    }
    if(refs.heroAuxBadge){
      if(pet.aux_needs){ refs.heroAuxBadge.classList.remove('d-none'); }
      else { refs.heroAuxBadge.classList.add('d-none'); }
    }
  }

  function createBadge(icon, textValue){
    if(!textValue) return null;
    const badge = document.createElement('span');
    badge.className = 'wdg-pet-badge';
    if(icon){
      const iconEl = document.createElement('i');
      iconEl.className = icon;
      badge.appendChild(iconEl);
    }
    const span = document.createElement('span');
    span.textContent = textValue;
    badge.appendChild(span);
    return badge;
  }

  function fillBadges(pet){
    if(!refs.badgeList) return;
    refs.badgeList.innerHTML = '';
    const badges = [];
    const especieLabel = pet.especie && pet.especie.toLowerCase() === 'outro' && pet.especie_outro ? pet.especie_outro : pet.especie;
    if(especieLabel) badges.push(createBadge('bi-patch-heart-fill', especieLabel));
    if(pet.raca) badges.push(createBadge('bi-shield-heart', pet.raca));
    if(pet.cor) badges.push(createBadge('bi-palette-fill', pet.cor));
    const pesoFmt = formatPeso(pet.peso);
    if(pesoFmt) badges.push(createBadge('bi-activity', pesoFmt));
    if(pet.porte) badges.push(createBadge('bi-arrows-angle-expand', pet.porte));
    const sexoFmt = formatSexo(pet.sexo);
    if(sexoFmt) badges.push(createBadge('bi-gender-ambiguous', sexoFmt));
    if(pet.temperamento) badges.push(createBadge('bi-stars', pet.temperamento));
    if(pet.microchip) badges.push(createBadge('bi-cpu', `Microchip ${pet.microchip}`));
    if(pet.registro) badges.push(createBadge('bi-clipboard-check', `Registro ${pet.registro}`));
    if(!badges.length){
      const empty = document.createElement('span');
      empty.className = 'text-muted small';
      empty.textContent = 'Sem detalhes adicionais cadastrados.';
      refs.badgeList.appendChild(empty);
      return;
    }
    badges.forEach(badge => { if(badge) refs.badgeList.appendChild(badge); });
  }

  function setInfoGrid(pet){
    if(!refs.infoGrid) return;
    refs.infoGrid.innerHTML = '';
    const especieLabel = pet.especie && pet.especie.toLowerCase() === 'outro' && pet.especie_outro ? pet.especie_outro : pet.especie;
    const infoItems = [
      { label: 'Nome', value: pet.nome },
      { label: 'Espécie', value: especieLabel },
      { label: 'Raça', value: pet.raca },
      { label: 'Cor / pelagem', value: pet.cor },
      { label: 'Peso', value: formatPeso(pet.peso) },
      { label: 'Porte', value: pet.porte },
      { label: 'Sexo', value: formatSexo(pet.sexo) },
      { label: 'Temperamento', value: pet.temperamento },
      { label: 'Auxilia morador com nec. esp.?', value: pet.aux_needs ? 'Sim' : 'Não' },
      { label: 'Nascimento', value: formatDateBr(pet.nascimento, false) },
      { label: 'Idade aproximada', value: calcAgeLabel(pet.nascimento) },
      { label: 'Microchip', value: pet.microchip },
      { label: 'Registro', value: pet.registro }
    ].filter(item => item.value);
    if(!infoItems.length){
      const fallback = document.createElement('div');
      fallback.className = 'text-muted small';
      fallback.textContent = 'Informações ainda não cadastradas.';
      refs.infoGrid.appendChild(fallback);
      return;
    }
    infoItems.forEach(item => {
      const box = document.createElement('div');
      box.className = 'wdg-pet-info-item';
      const lab = document.createElement('span'); lab.className = 'label'; lab.textContent = item.label;
      const val = document.createElement('span'); val.className = 'value'; val.textContent = item.value;
      box.appendChild(lab); box.appendChild(val);
      refs.infoGrid.appendChild(box);
    });
  }

  function setCuidados(pet){
    if(!refs.cuidadosWrap) return;
    refs.cuidadosWrap.innerHTML = '';
    const chips = [];
    pet.alergias.forEach(item => chips.push({ tone: 'alert', text: `Alergia: ${item}` }));
    pet.restricoes.forEach(item => chips.push({ tone: 'info', text: `Restrição: ${item}` }));
    pet.cuidados.forEach(item => chips.push({ tone: 'calm', text: item }));
    if(!chips.length){
      refs.cuidadosWrap.classList.add('d-none');
      return;
    }
    refs.cuidadosWrap.classList.remove('d-none');
    chips.forEach(({ tone, text }) => {
      const span = document.createElement('span');
      span.className = 'wdg-pet-chip';
      if(tone) span.dataset.tone = tone;
      span.textContent = text;
      refs.cuidadosWrap.appendChild(span);
    });
  }

  function renderSaude(pet){
    if(!refs.saudeWrap || !refs.saudeList || !refs.docsList) return;
    refs.saudeList.innerHTML = '';
    refs.docsList.innerHTML = '';
    let sections = 0;
    const buildSection = (title, items) => {
      if(!items || !items.length) return;
      const section = document.createElement('div');
      section.className = 'wdg-pet-saude-section';
      const heading = document.createElement('div');
      heading.className = 'wdg-pet-saude-title';
      heading.textContent = title;
      const list = document.createElement('div');
      list.className = 'wdg-pet-saude-items';
      items.forEach(item => {
        const pill = document.createElement('span');
        pill.className = 'wdg-pet-saude-pill';
        pill.textContent = item;
        list.appendChild(pill);
      });
      section.appendChild(heading);
      section.appendChild(list);
      refs.saudeList.appendChild(section);
      sections += 1;
    };
    buildSection('Vacinas', pet.vacinas);
    buildSection('Medicações', pet.medicacoes);
    buildSection('Exames / Check-ups', pet.exames);

    let docs = normalizeDocs(pet.documentos || []);
    if(pet.foto && pet.foto.url){
      docs = [{ url: pet.foto.url, nome: pet.foto.nome || 'Foto do pet' }, ...docs];
    }
    docs.forEach(doc => {
      const link = document.createElement('a');
      link.href = doc.url.startsWith('http') || doc.url.startsWith('data:') ? doc.url : basePath + doc.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.className = 'wdg-pet-doc-link';
      const icon = document.createElement('i');
      icon.className = 'bi bi-file-earmark-text';
      link.appendChild(icon);
      const label = document.createElement('span');
      label.textContent = doc.nome || 'Documento';
      link.appendChild(label);
      if(doc.descricao){
        link.title = doc.descricao;
      }
      refs.docsList.appendChild(link);
    });

    if(sections === 0 && !refs.docsList.childElementCount){
      refs.saudeWrap.classList.add('d-none');
    } else {
      refs.saudeWrap.classList.remove('d-none');
    }
  }

  function preencher(petRaw, context){
    const pet = normalizePet(petRaw);
    const habitacao = context && context.habitacao ? context.habitacao : null;
    const habLabel = context && context.habLabel ? context.habLabel : formatHabLabel(habitacao);
    const proprietario = habitacao && habitacao.proprietario ? habitacao.proprietario : {};

    text(refs.nome, pet.nome ? `Pet · ${pet.nome}` : 'Detalhes do pet', 'Detalhes do pet');
    text(refs.habInfo, habLabel || '');

    setAvatarDisplay(pet);
    fillBadges(pet);
    setInfoGrid(pet);
    setCuidados(pet);
    renderSaude(pet);

    const especieLabel = pet.especie && pet.especie.toLowerCase() === 'outro' && pet.especie_outro ? pet.especie_outro : pet.especie;
    text(refs.especieLabel, especieLabel || 'Espécie não informada');

    const resumoPartes = [];
    if(pet.nome) resumoPartes.push(pet.nome);
    if(pet.raca) resumoPartes.push(pet.raca);
    const pesoFmt = formatPeso(pet.peso);
    if(pesoFmt) resumoPartes.push(pesoFmt);
    text(refs.resumo, resumoPartes.length ? resumoPartes.join(' · ') : 'Nenhum resumo cadastrado.');

    text(refs.habResumo, habLabel || '—');
    text(refs.propNome, proprietario && (proprietario.nome || proprietario.razao || proprietario.fantasia) ? (proprietario.nome || proprietario.razao || proprietario.fantasia) : '—');
    if(refs.propContato){
      const contatoHtml = buildContatoHtml(proprietario);
      if(contatoHtml){
        refs.propContato.innerHTML = contatoHtml;
      } else if(proprietario && (proprietario._id || proprietario.id || proprietario.email || proprietario.contato_email)){
        refs.propContato.textContent = 'Buscando contato...';
        hydrateOwnerContact(proprietario).then(() => {
          const enrichedHtml = buildContatoHtml(proprietario);
          if(!refs.propContato) return;
          refs.propContato.innerHTML = enrichedHtml || '—';
        }).catch(() => {
          if(refs.propContato) refs.propContato.textContent = '—';
        });
      } else {
        refs.propContato.textContent = '—';
      }
    }

    text(refs.criado, formatDateBr(pet.createdAt, true) || '—');
    text(refs.atualizado, formatDateBr(pet.updatedAt, true) || '—');

    const noteDate = formatDateBr(pet.lastNoteAt || pet.updatedAt, true);
    if(refs.lastNote){
      if(noteDate){
        refs.lastNote.textContent = `Última atualização ${noteDate}`;
        refs.lastNote.classList.remove('d-none');
      } else {
        refs.lastNote.textContent = '';
        refs.lastNote.classList.add('d-none');
      }
    }

    const descricao = (pet.observacoes || '').trim();
    text(refs.descricao, descricao || 'Nenhuma observação registrada para este pet.');
  }

  function abrir(pet, context){
    try { preencher(pet, context || {}); }
    catch(err){ console.error('[modal_detalhes_pet] falha ao preencher', err); }
    bsModal.show();
  }

  window.WDG_PET_DET = { abrir };
})();
