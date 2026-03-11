/* ======================================================================
 * funcionarios_index.js
 * Camada unificada (versão mínima estável) para:
 *  - Carregar funcionário para edição e preencher formulário
 *  - Serializar dependentes / benefícios / anexos
 *  - Aplicar validações semânticas (CPF, PIS, Telefones, Email, Datas, CEP, Salário)
 *  - Normalizar campos (datas BR -> ISO, moeda digit-cent -> número, remoção de máscaras)
 *  - Prevenir dupla submissão e fornecer feedback inline (is-valid / is-invalid)
 *  - Atualizar linha na tabela após salvar e resetar para modo criação
 * NOTA: Máscaras visuais (telefone, email, moeda, cpf) são centralizadas em WDMasks + masks-global.
 * ====================================================================== */
// Garantir buildFotoUrl disponível o mais cedo possível para outros scripts (ex: modal de detalhes)
window.buildFotoUrl = window.buildFotoUrl || function(caminho){
  if(!caminho) return '';
  const base = (window.__basePath || window.__WD_BASE_PATH || '/gestor').replace(/\/$/, '');
  let clean = String(caminho).trim();
  clean = clean.replace(/^https?:\/\/[^/]+/, ''); // remove domínio se vier completo
  clean = clean.replace(/^\/+/, '');
  clean = clean.replace(/^public\//,'');
  return base + '/' + clean;
};
const basePath = (function(){
  try {
    const attr = document?.body?.getAttribute('data-base-path');
    if (attr && attr !== '/') return attr.replace(/\/$/, '');
    if (window.__WD_BASE_PATH && window.__WD_BASE_PATH !== '/') return String(window.__WD_BASE_PATH).replace(/\/$/, '');
  } catch(e) {}
  return '/gestor';
})();

// --------------------- UTIL BÁSICO ---------------------
function _setFormValue(form, name, value){
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value ?? '';
}

async function carregarFuncionarioParaEdicao(id, btn){
  try {
    if(btn){ btn.disabled=true; btn.dataset._old=btn.innerHTML; btn.innerHTML='<span class="spinner-border spinner-border-sm"></span>'; }
    const resp = await fetch(`${basePath}/api/funcionarios/${id}`, { headers:{'Accept':'application/json'} });
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const json = await resp.json();
    const f = json.funcionario || json.data || json;
    if(!f || !f._id) throw new Error('Formato inválido');
    const form = document.getElementById('formFuncionario');
    if(!form) return;
    _setFormValue(form,'nome', f.nome);
    _setFormValue(form,'cpf', f.cpf);
    _setFormValue(form,'pis', f.pis);
    if(f.unidade_id && f.unidade_id._id) _setFormValue(form,'unidade_id', f.unidade_id._id);
    if(f.funcao_id && f.funcao_id._id) _setFormValue(form,'funcao_id', f.funcao_id._id);
    let hid = form.querySelector('input[name="_id"]');
    if(!hid){ hid=document.createElement('input'); hid.type='hidden'; hid.name='_id'; form.appendChild(hid);} hid.value=f._id;
    const titulo = document.getElementById('tituloFormFuncionario'); if(titulo) titulo.textContent='Editar Funcionário';
    document.getElementById('btnFinalizar')?.classList.remove('d-none');
    document.getElementById('btnCancelarEdicao')?.classList.remove('d-none');
    window.scrollTo({top:0,behavior:'smooth'});
  } catch(err){ console.error('[LEGACY_FUNC] Erro carregar para edição', err); alert('Falha ao abrir para edição'); }
  finally { if(btn){ btn.disabled=false; btn.innerHTML=btn.dataset._old || 'Editar'; delete btn.dataset._old; } }
}

// --------------------- EVENTOS ---------------------
document.addEventListener('click', function(ev){
  const btnEdit = ev.target.closest('.btn-edit-func');
  if(btnEdit){
    ev.preventDefault();
    const tr = btnEdit.closest('tr');
    const id = tr?.dataset.funcId || tr?.getAttribute('data-func-id') || btnEdit.dataset.id;
    if(!id){ console.warn('[FUNC][EDIT] ID não encontrado para edição'); return; }
    // Aqui deveria disparar fluxo de carregar para edição (já existe função moderna mais abaixo)
    if(typeof window.carregarFuncionarioPorId === 'function'){
      window.carregarFuncionarioPorId(id, btnEdit);
    } else if(typeof window.__carregarFuncionarioCompleto === 'function') {
      window.__carregarFuncionarioCompleto(id, btnEdit);
    } else {
      // fallback legacy se ainda existir
      try { carregarFuncionarioParaEdicao(id, btnEdit); } catch(err){ console.warn('[FUNC][EDIT] Falha no fallback carregarFuncionarioParaEdicao', err); }
    }
  }
});

document.addEventListener('submit', async function(ev){
  const form = ev.target.closest('form');
  if(!form) return;
  const action = form.getAttribute('action')||'';
  const matchDelete = action.match(/\/api\/funcionarios\/([^/]+)\/delete$/);
  if(!matchDelete) return; // não é formulário de exclusão
  ev.preventDefault();

  function normalizeText(v){
    return String(v ?? '').replace(/\s+/g, ' ').trim();
  }

  function askDeleteFuncionarioConfirm(nome){
    const modalEl = document.getElementById('fDeleteConfirmModal');
    const nameEl = document.getElementById('fDeleteConfirmName');
    const yesBtn = document.getElementById('fDeleteConfirmYes');
    const label = normalizeText(nome) || 'selecionado';

    // fallback: caso a página não tenha modal/Bootstrap
    if (!modalEl || !yesBtn || !(window.bootstrap && window.bootstrap.Modal)) {
      return Promise.resolve(window.confirm(`Deseja excluir o funcionário ${label}? Esta exclusão é definitiva e não pode ser desfeita.`));
    }

    if (nameEl) nameEl.textContent = label;

    return new Promise((resolve) => {
      let resolved = false;
      const bs = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: true, keyboard: true, focus: true });

      const onHidden = () => {
        if (resolved) return;
        resolved = true;
        resolve(false);
      };

      const onYes = (e) => {
        try { e?.preventDefault?.(); } catch { /* noop */ }
        if (resolved) return;
        resolved = true;
        resolve(true);
        try { bs.hide(); } catch { /* noop */ }
      };

      modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
      yesBtn.addEventListener('click', onYes, { once: true });
      bs.show();
    });
  }

  const tr = form.closest('tr');
  const nome = tr?.querySelector('.col-nome')?.textContent || tr?.querySelector('td')?.textContent || '';

  // Confirmação (modal quando disponível)
  const ok = await askDeleteFuncionarioConfirm(nome);
  if(!ok) return;

  let deleted=false; let lastStatus=0; let lastBody='';
  try {
    // 1) Tenta DELETE direto (/api/funcionarios/:id)
    const delUrl = action.replace(/\/delete$/, '');
    let resp = await fetch(delUrl, { method:'DELETE', headers:{ 'Accept':'application/json' } });
    lastStatus = resp.status;
    if(resp.status === 404){
      deleted = true; // já removido
    } else if(resp.ok){
      try { const jd = await resp.json(); if(jd.success || jd.data?.deleted) deleted=true; else lastBody = JSON.stringify(jd); } catch(e){ lastBody='(DELETE parse fail)'; }
    } else {
      try { lastBody = await resp.text(); } catch{}
    }
    // 2) Fallback POST /:id/delete
    if(!deleted){
      resp = await fetch(action, { method:'POST', headers:{ 'Accept':'application/json' } });
      lastStatus = resp.status;
      if(resp.status === 404){
        deleted = true;
      } else if(resp.ok){
        try { const jd = await resp.json(); if(jd.success || jd.data?.deleted) deleted=true; else lastBody = JSON.stringify(jd); } catch(e){ lastBody='(POST parse fail)'; }
      } else {
        try { lastBody = await resp.text(); } catch{}
      }
    }
  } catch(err){
    console.error('[FUNC][EXCLUIR] Erro durante requisições', err);
    alert('Erro ao excluir. Veja console.');
    return;
  }
  if(deleted){
    if(tr) tr.remove();
    const msg = lastStatus===404 ? 'Funcionário já removido.' : 'Funcionário excluído.';
    if(window.showToast) showToast(msg,'info'); else console.log('[FUNC][EXCLUIR]', msg);
  } else {
    console.error('[FUNC][EXCLUIR] Falhou', { status:lastStatus, body:lastBody });
    alert('Não foi possível excluir (status '+lastStatus+').');
  }
});

// --------------------- ENDEREÇO (fallback leve) ---------------------
function parseResumoEnderecoToParts(resumo){
  const out={cep:'',tipo:'',logradouro:'',numero:'',complemento:'',bairro:'',cidade:'',uf:'',ibge:''};
  if(!resumo) return out;
  const mCep = resumo.match(/\b\d{5}-?\d{3}\b/); if(mCep) out.cep=mCep[0].replace(/\D/g,'');
  const mIbge = resumo.match(/(IBGE|Código IBGE):?\s*(\d{7})/i); if(mIbge) out.ibge=mIbge[2];
  return out;
}
window.parseResumoEnderecoToParts = window.parseResumoEnderecoToParts || parseResumoEnderecoToParts;

console.log('[LEGACY_FUNC] Versão mínima carregada');

function syncHiddenEnderecoFromResumo() {
  const resumoEl = document.getElementById('endereco_resumo') || document.getElementById('endereco');
  if (!resumoEl) return;
  const resumo = resumoEl.value || '';
  const cepEl = document.getElementById('end_cep');
  if (cepEl && cepEl.value) return; // já preenchido por popup
  const p = parseResumoEnderecoToParts(resumo);
  const set = (id,v) => { const el = document.getElementById(id); if (el && !el.value) el.value = v || ''; };
  set('end_cep',    p.cep);
  set('end_tipo',   p.tipo);
  set('end_logr',   p.logradouro);
  set('end_num',    p.numero);
  set('end_comp',   p.complemento);
  set('end_bairro', p.bairro);
  set('end_uf',     p.uf);
  set('end_cidade', p.cidade);
  set('end_ibge',   p.ibge);
  // Fallback: sincroniza hiddens a partir do resumo ao carregar
  setTimeout(syncHiddenEnderecoFromResumo, 1000);
}

// Função global para sincronizar endereço (movida do DOMContentLoaded)
function syncEndereco() {
  const formFuncionario = document.getElementById('formFuncionario');
  const endDisplay = document.getElementById('endereco'); // input visível (geralmente name="endereco_str")
  if (!formFuncionario || !endDisplay) return;
  const parsed = _parseEnderecoStrSafe(endDisplay.value);
  _writeEnderecoHiddenSafe(formFuncionario, parsed);
}

// Funções auxiliares globais para processamento de endereço
function _parseEnderecoStrSafe(s) {
  if (typeof parseEnderecoString === 'function') return parseEnderecoString(s);
  // fallback simples
  const out = { cep:'', tipo_logradouro:'', logradouro:'', numero:'', complemento:'', bairro:'', estado:'', cidade:'', codigo_ibge:'' };
  s = String(s || '');
  const mCep = s.match(/(\d{2}\.?\d{3}-\d{3}|\d{5}-\d{3}|\b\d{8}\b)/);
  if (mCep) out.cep = mCep[1];
  const mCidUf = s.match(/([^,]+?)\s*-\s*([A-Z]{2})/);
  if (mCidUf) { out.cidade = mCidUf[1].trim(); out.estado = mCidUf[2].trim(); }
  const ateCidade = s.split(/,\s*(?:[^,]+?\s*-\s*[A-Z]{2})/)[0] || s;
  const partes = ateCidade.split(',').map(p=>p.trim()).filter(Boolean);
  const pri = partes[0] || '';
  const mTL = pri.match(/^(Alameda|Área|Acesso|Avenida|Av\.?|Beco|Boulevard|Caminho|Conjunto|Condomínio|Estrada|Esplanada|Jardim|Ladeira|Largo|Loteamento|Morro|Parque|Passagem|Praça|Praca|Quadra|Recanto|Rodovia|Rua|R\.?|Servidão|Setor|Sítio|Travessa|Trv\.?|Trevo|Vila|Viela|Via)\s+(.*)$/i);
  if (mTL) {
    let tipo = mTL[1];
    if (/^av/i.test(tipo)) tipo = 'Avenida';
    if (/^r\.?$/i.test(tipo)) tipo = 'Rua';
    if (/^trv/i.test(tipo)) tipo = 'Travessa';
    if (/^praca$/i.test(tipo)) tipo = 'Praça';
    out.tipo_logradouro = tipo;
    out.logradouro = mTL[2];
  } else out.logradouro = pri;
  if (partes.length >= 2) out.numero = /^\d+/.test(partes[1]) ? partes[1] : '';
  if (partes.length >= 3) out.bairro = partes[partes.length - 1];
  const mIbge = s.match(/IBGE:\s*(\d{7})|Código IBGE:\s*(\d{7})/i);
  if (mIbge) out.codigo_ibge = (mIbge[1] || mIbge[2] || '').trim();
  return out;
}

function _writeEnderecoHiddenSafe(form, addr) {
  const set = (id, v) => { const el = form.querySelector('#' + id); if (el) el.value = v || ''; };
  set('end_cep',    addr.cep);
  set('end_tipo',   addr.tipo_logradouro);
  set('end_logr',   addr.logradouro);
  set('end_num',    addr.numero);
  set('end_comp',   addr.complemento);
  set('end_bairro', addr.bairro);
  set('end_uf',     addr.estado);
  set('end_cidade', addr.cidade);
  set('end_ibge',   addr.codigo_ibge);
}

function onlyDigits(v) {
  return (v || '').toString().replace(/\D+/g, '');
}
function parseMoedaToNumber(v) {
  if (!v) return '';
  const norm = v.toString().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n.toString() : '';
}
function dateBrToISO(v) {
  if (!v) return '';
  // ISO direto
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // Aceita dd/mm/aaaa (preferencial) – NÃO tentar adivinhar mm/dd (evita inversões silenciosas)
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if(!m) return '';
  const dd = parseInt(m[1],10);
  const mm = parseInt(m[2],10);
  const yyyy = parseInt(m[3],10);
  // Faixas e existência
  if(mm < 1 || mm > 12) return '';
  if(dd < 1 || dd > 31) return '';
  if(yyyy < 1900 || yyyy > 2100) return '';
  const dt = new Date(yyyy, mm-1, dd);
  if(dt.getFullYear()!==yyyy || dt.getMonth()!==mm-1 || dt.getDate()!==dd) return '';
  const iso = `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  if(window.DEBUG_DATES_CLIENT){ console.log('[DATE][BR->ISO] in=', v,'->', iso); }
  return iso;
}
function dateISOToBr(v) {
  if (!v) return '';
  // Aceita formatos: yyyy-mm-dd, yyyy-mm-ddTHH:MM:SS(.ms)?Z?, Date ISO completa
  // Evita usar new Date para não sofrer ajuste de timezone que altera o dia/ano.
  const iso = String(v).trim();
  // Extrai somente parte de data (ignora tempo/fuso) sem criar objeto Date
  let m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if(!m){
    // Já pode estar no formato BR
    if(/^(\d{2})\/(\d{2})\/(\d{4})$/.test(iso)) return iso;
    return '';
  }
  const yyyy = +m[1];
  const mm = +m[2];
  const dd = +m[3];
  if(yyyy < 1900 || yyyy > 2100) return '';
  if(mm < 1 || mm > 12) return '';
  if(dd < 1 || dd > 31) return '';
  // Validação de existência de dia (sem usar Date para evitar timezone):
  const diasMes = [31, (yyyy%4===0 && yyyy%100!==0) || (yyyy%400===0) ? 29 : 28, 31,30,31,30,31,31,30,31,30,31];
  if(dd > diasMes[mm-1]) return '';
  return String(dd).padStart(2,'0') + '/' + String(mm).padStart(2,'0') + '/' + String(yyyy);
}

// Aplica valor BR em input sem permitir "volta" de ano diferente
function applyDateToInputSafe(inputId, valorIso){
  const el = document.getElementById(inputId);
  if(!el) return;
  const br = dateISOToBr(valorIso);
  if(!br) return; // não sobrescreve com inválido
  // Se já existe valor e só difere o ano (possível regressão), mantemos o atual e logamos
  if(el.value){
    const anoAtual = (el.value.match(/\/(\d{4})$/)||[])[1];
    const anoNovo = (br.match(/\/(\d{4})$/)||[])[1];
    if(anoAtual && anoNovo && anoAtual !== anoNovo){
      console.warn('[DATE][SAFE_APPLY] Ano divergente prevenido', { campo: inputId, existente: el.value, recebido: br });
      return;
    }
  }
  try {
    // Se flatpickr já está ligado, setar na instância também
    if (el._flatpickr && typeof el._flatpickr.setDate === 'function') {
      el._flatpickr.setDate(br, false, 'd/m/Y');
    }
  } catch(_) {}
  el.value = br;
  // Persistir como atributo e dataset para reidratação futura
  try { el.setAttribute('value', br); } catch(_){}
  try { el.dataset.filledValue = br; } catch(_){}
}
function textTrim(el) {
  return (el?.textContent || '').trim();
}
function setValueDelayed(sel, value, tries = 20, delay = 150) {
  const el = document.querySelector(sel);
  if (!el) return;
  // Persistimos a intenção no dataset/atributo para que preenchimentos assíncronos
  // (como fillSelect em funcionarios_selects.js) respeitem o valor desejado.
  if (value != null && value !== '') {
    try { el.dataset.currentValue = String(value); } catch {}
    try { el.setAttribute('data-current', String(value)); } catch {}
  }
  const attempt = () => {
    if (value == null || value === '') return;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let count = 0;
  const t = setInterval(() => {
    attempt();
    count++;
    if (el.value == value || count >= tries) clearInterval(t);
  }, delay);
}

// ================== VALIDAÇÃO DINÂMICA DE DATAS (PREVENIR REGRESSÃO) ==================
// Regras:
//  - Aceitar somente dd/mm/aaaa com ano 1900-2100
//  - Bloquear mês >12 e dia >31 imediatamente (classe is-invalid)
//  - Rejeitar digitação de formato yyyy-mm-dd (converte on-the-fly para dd/mm/aaaa)
//  - Rejeitar números colados (ex: 20250903) tentando converter para dd/mm/aaaa se plausível (03/09/2025)
//  - Restaurar último valor válido se usuário sair (blur) com valor inválido
const DATE_INPUT_SELECTORS = [
  '#data_nascimento','#extra_rg_data_expedicao','#data_admissao','#data_termino',
  '#extra_fgts_data','#extra_cert_militar_data','#extra_cnh_validade','#extra_data_chegada_brasil'
];
function tryNormalizeLooseDate(raw){
  if(!raw) return '';
  const s = raw.trim();
  // yyyy-mm-dd -> dd/mm/yyyy
  let m = s.match(/^([0-9]{4})-([01][0-9])-([0-3][0-9])$/);
  if(m){ return `${m[3]}/${m[2]}/${m[1]}`; }
  // yyyymmdd -> dd/mm/yyyy
  m = s.match(/^([0-9]{4})([01][0-9])([0-3][0-9])$/);
  if(m){ return `${m[3]}/${m[2]}/${m[1]}`; }
  return s;
}
function isValidBrDate(str){
  const m = /^([0-3][0-9])\/([01][0-9])\/(\d{4})$/.exec(str);
  if(!m) return false;
  const dd = +m[1], mm=+m[2], yyyy=+m[3];
  if(mm<1||mm>12) return false; if(dd<1||dd>31) return false; if(yyyy<1900||yyyy>2100) return false;
  const diasMes=[31,(yyyy%4===0&&yyyy%100!==0)||(yyyy%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  if(dd>diasMes[mm-1]) return false;
  return true;
}
function attachLiveDateValidation(){
  DATE_INPUT_SELECTORS.forEach(sel=>{
    const el=document.querySelector(sel);
    if(!el) return;
    if(el.dataset.liveDateBound==='1') return;
    el.dataset.liveDateBound='1';
    el.dataset.lastValid='';
    el.addEventListener('input', ()=>{
      const norm = tryNormalizeLooseDate(el.value);
      if(norm !== el.value) el.value = norm;
      if(isValidBrDate(el.value)){
        el.classList.remove('is-invalid');
        el.dataset.lastValid = el.value;
      } else {
        // marca inválido apenas quando formato parece completo mas inválido
        if(/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(el.value)){
          el.classList.add('is-invalid');
        } else {
          el.classList.remove('is-invalid');
        }
      }
    });
    el.addEventListener('blur', ()=>{
      if(isValidBrDate(el.value)) return;
      if(el.dataset.lastValid){
        el.value = el.dataset.lastValid;
        el.classList.remove('is-invalid');
      } else if(!/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(el.value)){
        // vazio ou parcial -> permitir limpar
        if(!el.value.trim()) el.classList.remove('is-invalid');
      }
    });
  });
}
document.addEventListener('DOMContentLoaded', attachLiveDateValidation);
// fallback caso script carregue depois
setTimeout(attachLiveDateValidation, 1500);

// ================== SANEAMENTO INICIAL DE DATAS CORROMPIDAS ==================
// Objetivo: Ao carregar a página (antes de qualquer edição), tentar corrigir valores
// que vieram do backend já em formato dd/mm/aaaa porém impossíveis (ex: mês > 12)
// reconstruindo a partir de possíveis padrões numéricos (ddmmyyyy, yyyymmdd, mmddyyyy).
// Regras de reconstrução:
//  1. Se já é válido (isValidBrDate) -> mantém.
//  2. Se corresponde a dd/mm/aaaa mas inválido -> tenta extrair somente dígitos (8 dígitos).
//  3. Tenta as combinações, nesta ordem de confiança: ddmmyyyy, yyyymmdd, mmddyyyy.
//  4. Validação rigorosa (faixa ano 1900-2100 e existência do dia no mês) reutilizando isValidBrDate.
//  5. Se conseguir reconstruir, substitui e marca dataset.dateSanitized='1'. Caso contrário, deixa como está
//     para que a validação dinâmica impeça submissão silenciosa.
function sanitizeInitialDates(){
  const sels = DATE_INPUT_SELECTORS.slice();
  // Inclui outros potenciais campos de data se existirem no DOM (defensivo)
  const extraCandidates = ['#beneficio_data_inicio'];
  extraCandidates.forEach(s=>{ if(!sels.includes(s)) sels.push(s); });
  sels.forEach(sel => {
    const el = document.querySelector(sel);
    if(!el || !el.value || el.dataset.dateSanitized==='1') return;
    const raw = el.value.trim();
    if(!raw) return;
    if(isValidBrDate(raw)) return; // já ok
    // Só tenta se parece com dd/mm/aaaa (dois '/' e 10 chars) ou se tem 8 dígitos totais
    const looksBrPattern = /^\d{2}\/\d{2}\/\d{4}$/.test(raw);
    if(!looksBrPattern) return; // evitar manipular outros formatos aqui (já tratados por live validation)
    const digits = raw.replace(/\D/g,'');
    if(digits.length !== 8) return;
    let candidates = [];
    // ddmmyyyy
    candidates.push(digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4));
    // yyyymmdd
    candidates.push(digits.slice(6,8)+'/'+digits.slice(4,6)+'/'+digits.slice(0,4));
    // mmddyyyy -> convertendo para dd/mm/yyyy
    candidates.push(digits.slice(2,4)+'/'+digits.slice(0,2)+'/'+digits.slice(4));
    for(const cand of candidates){
      if(isValidBrDate(cand)){
        el.value = cand;
        el.dataset.dateSanitized='1';
        el.classList.remove('is-invalid');
        if(window.DEBUG_DATES_CLIENT){ console.log('[DATE][SANITIZE] Campo', sel, 'raw=', raw, '->', cand); }
        return;
      }
    }
    // Se chegou aqui não conseguiu reconstruir; permanece inválido para correção manual.
    if(window.DEBUG_DATES_CLIENT){ console.warn('[DATE][SANITIZE][FAIL] Não foi possível corrigir', sel, 'valor=', raw, 'digits=', digits); }
  });
}
document.addEventListener('DOMContentLoaded', () => {
  // Executa cedo (após attachLiveDateValidation) e novamente após pequeno delay para cobrir campos preenchidos async
  try { sanitizeInitialDates(); } catch(e){ console.warn('[DATE][SANITIZE] erro inicial', e); }
  setTimeout(()=>{ try { sanitizeInitialDates(); } catch(e){ console.warn('[DATE][SANITIZE] erro tardio', e); } }, 800);
});

/* ======================== FUNÇÃO PARA COLETAR UNSETS ======================== */
function nameToDot(path) {
  // transforma "endereco[cep]" -> "endereco.cep"
  return String(path).replace(/\]/g,'').replace(/\[/g,'.');
}

function collectUnsets(form) {
  const required = new Set([
    'unidade_id','nome','rg','cpf','data_nascimento','sexo','email','telefone'
  ]);
  const unsets = [];

  // pega inputs/selects/textarea com atributo name
  form.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
    const name = el.name;
    if (!name || required.has(name)) return;
    // Não unsetar campos desabilitados (ex.: controlados pelo tipo de contrato)
    if (el.disabled) return;
    const val = (el.value ?? '').toString().trim();

    // Se veio vazio => pedir para apagar
    if (val === '') {
      unsets.push(nameToDot(name));
    }
  });

  // regras de negócio explícitas
  const pcd = form.querySelector('#extra_pcd')?.value;
  if (pcd === 'N') {
    unsets.push('tipo_deficiencia','cid');
  }

  // endereço: NÃO desanexar o objeto inteiro no incremental (pode ser requerido pelo schema)
  // Em vez disso, deixamos o backend manter o valor atual quando os campos estão vazios.
  // const endKeys = ['end_cep','end_tipo','end_logr','end_num','end_comp','end_bairro','end_uf','end_cidade','end_ibge'];
  // const allEmpty = endKeys.every(id => !(form.querySelector('#'+id)?.value || '').trim());
  // if (allEmpty) unsets.push('endereco');

  return Array.from(new Set(unsets));
}

/* ======================== MÁSCARAS EXISTENTES ======================== */
// Máscara/validação de telefone e email centralizadas em masks-global + validators.js
// Funções diretas removidas (applyPhoneMaskDirect / applyEmailValidationDirect)
function applyCPFMaskDirect(element) {
  console.log('[MASK DEBUG] Aplicando máscara CPF no elemento:', element?.id);
  if (!element) return;
  const formatCPF = (value) => {
    if (!value) return '';
    const digits = String(value).replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };
  const isValidCPF = (cpf) => {
    if (!cpf) return false;
    const digits = String(cpf).replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let remainder = sum % 11;
    let digit1 = remainder < 2 ? 0 : 11 - remainder;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    remainder = sum % 11;
    let digit2 = remainder < 2 ? 0 : 11 - remainder;
    return parseInt(digits[9]) === digit1 && parseInt(digits[10]) === digit2;
  };
  const applyMask = () => {
    const oldValue = element.value;
    const newValue = formatCPF(oldValue);
    if (oldValue !== newValue) {
      const cursorPos = element.selectionStart || oldValue.length;
      element.value = newValue;
      const diff = newValue.length - oldValue.length;
      const newCursorPos = Math.max(0, cursorPos + diff);
      setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
    }
  };
  const validateOnBlur = () => {
    const isValid = isValidCPF(element.value);
    element.classList.toggle('is-valid', isValid && element.value.trim() !== '');
    element.classList.toggle('is-invalid', !isValid && element.value.trim() !== '');
  };
  if (element.value) applyMask();
  element.addEventListener('input', applyMask);
  element.addEventListener('blur', validateOnBlur);
}
function applyPisMaskDirect(element) {
  console.log('[MASK DEBUG] Aplicando máscara PIS no elemento:', element?.id);
  console.log('[MASK DEBUG] WDMasks disponível:', !!window.WDMasks);
  console.log('[MASK DEBUG] formatPIS disponível:', !!(window.WDMasks?.formatPIS));
  console.log('[MASK DEBUG] isValidPIS disponível:', !!(window.WDMasks?.isValidPIS));
  if (!element) return;
  if (!window.WDMasks || !window.WDMasks.formatPIS || !window.WDMasks.isValidPIS) {
    console.log('[MASK DEBUG] WDMasks ou funções PIS não disponíveis, pulando máscara');
    return;
  }
  const applyMask = () => {
    const oldValue = element.value;
    const newValue = window.WDMasks.formatPIS(oldValue);
    if (oldValue !== newValue) {
      const cursorPos = element.selectionStart || oldValue.length;
      element.value = newValue;
      const diff = newValue.length - oldValue.length;
      const newCursorPos = Math.max(0, cursorPos + diff);
      setTimeout(() => element.setSelectionRange?.(newCursorPos, newCursorPos), 0);
    }
  };
  const validateOnBlur = () => {
    const isValid = window.WDMasks.isValidPIS(element.value);
    element.classList.toggle('is-valid', isValid && element.value.trim() !== '');
    element.classList.toggle('is-invalid', !isValid && element.value.trim() !== '');
  };
  if (element.value) applyMask();
  element.addEventListener('input', applyMask);
  element.addEventListener('blur', validateOnBlur);
}
// Removido applyMoedaMaskDirect: usando bindMoedaMask central (digit-cent). Mantido utilitário de correção tardia.
function ensureDigitCentMoeda(element){
  if(!element) return;
  // Se após 300ms ainda não tem dataset.maskSource digit-cent, tenta aplicar manualmente
  setTimeout(()=>{
    if(!element.dataset.maskSource && window.WDMasks?.bindMoedaMask){
      try { window.WDMasks.bindMoedaMask(element); console.log('[MOEDA][ensure] bind aplicado tardiamente'); } catch(err){ console.warn('[MOEDA][ensure] erro', err); }
    }
  },300);
}

/* ======================== APPLY MASKS LOTE ======================== */
function applyMasks() {
  console.log('[MASK DEBUG] Executando applyMasks()');
  const cpfField = document.getElementById('cpf');
  console.log('[MASK DEBUG] Campo CPF encontrado:', !!cpfField);
  if (cpfField) applyCPFMaskDirect(cpfField);

  // Campo CPF de dependente agora recebe máscara via classe .cpf-mask no HTML (aba5_dependentes.ejs)

  const pisField = document.getElementById('extra_pis');
  if (pisField) {
    console.log('[MASK DEBUG] Campo PIS encontrado, aplicando máscara');
    setTimeout(() => applyPisMaskDirect(pisField), 100);
  } else {
    console.log('[MASK DEBUG] Campo PIS não encontrado');
  }

  // Aplicações agora automáticas via classes .telefone-mask e .email-mask (masks-global)
  const tel1 = document.getElementById('telefone'); if(tel1) tel1.classList.add('telefone-mask');
  const tel2 = document.getElementById('telefone2'); if(tel2) tel2.classList.add('telefone-mask');
  const emailField = document.getElementById('email'); if(emailField) emailField.classList.add('email-mask');

  const salarioBaseField = document.getElementById('extra_salario_base');
  if (salarioBaseField) {
    salarioBaseField.classList.add('moeda-mask');
    ensureDigitCentMoeda(salarioBaseField);
  }
}

/* ======================== SERIALIZAÇÃO (ANTES DO SUBMIT) ======================== */
function removeHiddenByPrefix(form, prefix) {
  form.querySelectorAll(`input[type="hidden"][data-auto="1"]`).forEach((el) => {
    if (el.name.startsWith(prefix)) el.remove();
  });
}
function addHidden(form, name, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  input.setAttribute('data-auto', '1');
  form.appendChild(input);
}

function setHiddenValue(id, value) {
  let el = document.getElementById(id);
  if(!el){
    const form = document.getElementById('formFuncionario');
    if(form){
      el = document.createElement('input');
      el.type = 'hidden';
      el.id = id;
      el.name = id; // usa o mesmo nome esperado pelo backend
      el.setAttribute('data-auto','1');
      form.appendChild(el);
      console.log('[SERIALIZE][AUTO_ADD_HIDDEN]', id, 'criado');
    }
  }
  if (el) el.value = value;
}

function mapBeneficioTipoFromText(t) {
  const s = (t || '').toLowerCase();
  if (s.includes('transporte')) return 'VT';
  if (s.includes('alimentação')) return 'VA';
  if (s.includes('refeição'))    return 'VR';
  if (s.includes('saúde') || s.includes('plano')) return 'PS';
  if (s.includes('outro'))       return 'OUTRO';
  return 'OUTRO';
}

/* Dependentes -> dependentes_json */
function serializeDependentesToJSON() {
  const tbody = document.getElementById('tbodyDependentes');
  const out = [];
  if (tbody) {
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (!tds.length) return;
      const nome = textTrim(tds[0]);
      const parentesco = textTrim(tds[1]);
      const dataNasc = dateBrToISO(textTrim(tds[2]));
      const cpf = onlyDigits(textTrim(tds[3]));
      if (nome) {
        const sfRaw = (tr.dataset.salarioFamilia || '').toUpperCase();
        const irpfRaw = (tr.dataset.irpf || '').toUpperCase();
        out.push({
          nome,
          parentesco,
          data_nascimento: dataNasc || undefined,
            cpf: cpf || undefined,
          salario_familia: sfRaw === 'S' ? true : (sfRaw === 'N' ? false : undefined),
          irpf: irpfRaw === 'S' ? true : (irpfRaw === 'N' ? false : undefined)
        });
      }
    });
  }
  setHiddenValue('dependentes_json', JSON.stringify(out));
  try { console.log('[DEPENDENTES][SERIALIZE] total=', out.length, out); } catch{}
}

/* Benefícios -> beneficios_json */
function serializeBeneficiosToJSON() {
  const tbody = document.getElementById('tbodyBeneficios');
  const out = [];
  if (tbody) {
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 7) return;
      const tipoTxt   = textTrim(tds[0]);            // "Vale Transporte" etc.
      const nome      = textTrim(tds[1]);
      const cnpjPlano = textTrim(tds[2]);
      const tipoValor = textTrim(tds[3]);            // "R$" ou "%"
      const valorStr  = textTrim(tds[4]);            // "1.234,56" ou "10,00"
      const inicioLbl = textTrim(tds[5]);            // "Admissão" ou "Outra data"
      const dataIniBr = textTrim(tds[6]);            // "dd/mm/aaaa" (quando houver)

      // mantém sua lógica de mapeamento:
      const tipo = mapBeneficioTipoFromText(tipoTxt);
      const valor = valorStr ? parseMoedaToNumber(valorStr) : '';

      let inicio = (inicioLbl ? inicioLbl.toLowerCase() : '');
      let data_inicio = dataIniBr ? dateBrToISO(dataIniBr) : undefined;
      if ((inicio === 'admissão' || inicio === 'admissao') && !data_inicio) {
        const dataAdmEl = document.querySelector('#data_admissao');
        if (dataAdmEl && dataAdmEl.value) {
          data_inicio = dateBrToISO(dataAdmEl.value);
        }
      }
      out.push({
        tipo,                               // "VT" | "VA" | "VR" | "PS" | "OUTRO"
        nome: nome || undefined,
        cnpj_plano: cnpjPlano || undefined,
        tipo_valor: (tipoValor === '%') ? '%' : 'R$',
        valor: (valor !== '' ? Number(valor) : undefined),
        inicio,
        data_inicio
      });
    });
  }
  try {
    // Sanitização final defensiva
    const sane = out.map((b,i)=>{
      if(b && typeof b.valor === 'number' && !Number.isFinite(b.valor)) b.valor = undefined;
      if(b && b.data_inicio && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(b.data_inicio)) b.data_inicio = undefined; // evita strings estranhas
      return b;
    });
    const json = JSON.stringify(sane);
    setHiddenValue('beneficios_json', json);
    console.log('[BENEFICIOS][SERIALIZE] linhas=', sane.length, 'jsonLength=', json.length, sane);
    try { console.log('[BENEFICIOS][HIDDEN] campo valor length=', document.getElementById('beneficios_json')?.value.length); } catch{}
  } catch(err){
    console.warn('[BENEFICIOS][SERIALIZE] Falha ao serializar:', err);
    setHiddenValue('beneficios_json', '[]');
  }
}

/* Normaliza campos simples do formulário para o schema */
function normalizeScalarFields(form) {
  const cpf = form.querySelector('#cpf');
  if (cpf) cpf.value = onlyDigits(cpf.value);
  const pis = form.querySelector('#extra_pis');
  if (pis) pis.value = onlyDigits(pis.value);
  const depCpf = form.querySelector('#dependente_cpf');
  if (depCpf) depCpf.value = onlyDigits(depCpf.value);

  const dateIds = [
    '#data_nascimento',
    '#extra_rg_data_expedicao',
    '#data_admissao',
    '#data_termino',
    '#extra_fgts_data',
    '#extra_cert_militar_data',
    '#extra_cnh_validade',
    '#extra_data_chegada_brasil',
    '#beneficio_data_inicio'
  ];
  dateIds.forEach(sel => {
    const el = form.querySelector(sel);
    if(!el) return;
    // Já normalizado anteriormente? (evita retrabalho / sobrescrita de valor ISO válido)
    if(el.dataset.dateNormalized === '1') return;
    const original = (el.value || '').trim();
    if(!original) return;
    const iso = dateBrToISO(original);
    if(window.DEBUG_DATES_CLIENT){ console.log('[DATE][NORMALIZE] field', sel, 'orig=', original, 'iso=', iso); }
    if(iso){
      el.value = iso;
      el.dataset.dateNormalized = '1';
      el.classList.remove('is-invalid');
      // Remover feedback inválido se existir
      if(el.nextElementSibling && el.nextElementSibling.classList?.contains('invalid-feedback')){
        // Mantém possibilidade de reutilizar em nova edição; não remove o nó para evitar layout shift
        el.nextElementSibling.textContent = '';
      }
    } else {
      // Data preenchida mas inválida -> manter valor original para que o usuário corrija
      // Se formato completo dd/mm/aaaa porém inválida (ex: 31/02/2024 ou fora do range) marcar erro
      if(/^\d{2}\/\d{2}\/\d{4}$/.test(original)){
        el.classList.add('is-invalid');
        // Inserir feedback bootstrap se não existir
        if(!(el.nextElementSibling && el.nextElementSibling.classList?.contains('invalid-feedback'))){
          const fb = document.createElement('div');
          fb.className = 'invalid-feedback';
          fb.textContent = 'Data inválida (verifique dia, mês e ano).';
          el.parentNode.insertBefore(fb, el.nextSibling);
        } else if(el.nextElementSibling && el.nextElementSibling.classList.contains('invalid-feedback')) {
          el.nextElementSibling.textContent = 'Data inválida (verifique dia, mês e ano).';
        }
      }
      // Não marcar como normalizada; valor será reavaliado em novo submit
    }
  });

  const sal = form.querySelector('#extra_salario_base');
  if (sal && sal.value) sal.value = parseMoedaToNumber(sal.value); // transforma "R$ 1.234,56" -> "1234.56"
}

/* ======================== CARREGAR PARA EDIÇÃO NO MESMO FORM ======================== */
function buildEnderecoResumoFromParts(end) {
  if (!end) return '';
  const cep = end.cep || '';
  const tipo = end.tipo_logradouro || '';
  const logr = end.logradouro || '';
  const num = end.numero || '';
  const comp = end.complemento ? `${end.complemento}, ` : '';
  const bairro = end.bairro || '';
  const cidade = end.cidade || '';
  const uf = end.estado || '';
  const ibge = end.codigo_ibge ? `, Código IBGE: ${end.codigo_ibge}` : '';
  return `${tipo} ${logr}, ${num}, ${comp}${bairro}, ${cidade} - ${uf}, CEP: ${cep}${ibge}`
    .replace(/\s+,/g, ',')
    .replace(/,\s+,/g, ', ');
}
function loadDependentesToTable(list) {
  const tbody = document.getElementById('tbodyDependentes');
  if (!tbody) return;
  tbody.innerHTML = '';
  (list || []).forEach(dep => {
    const tr = document.createElement('tr');
    const nasc = dep.data_nascimento ? dateISOToBr(dep.data_nascimento) : '';
    const cpfFmt = dep.cpf ? (dep.cpf.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')) : '';
    tr.innerHTML = `
      <td>${dep.nome || ''}</td>
      <td>${dep.parentesco || ''}</td>
      <td>${nasc}</td>
      <td>${cpfFmt}</td>
      <td class="col-acoes">
        <div class="d-inline-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary btn-icon btnEditarDep" title="Editar" aria-label="Editar">
            <img src="${basePath}/images/editar.png" alt="Editar" class="icon" />
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-icon btnRemoverDep" title="Remover" aria-label="Remover">
            <img src="${basePath}/images/excluir.png" alt="Remover" class="icon" />
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  // Dispara evento para atualizar hidden JSON imediatamente após carregar da API
  try { document.dispatchEvent(new CustomEvent('dependentes:changed')); } catch(_){ }
}
function loadBeneficiosToTable(list) {
  const tbody = document.getElementById('tbodyBeneficios');
  if (!tbody) return;
  tbody.innerHTML = '';
  (list || []).forEach(b => {
    const tipoTxt = (b.tipo || '').toUpperCase();
    const tipoLabel = tipoTxt === 'VT' ? 'Vale Transporte' :
                      tipoTxt === 'VA' ? 'Vale Alimentação' :
                      tipoTxt === 'VR' ? 'Vale Refeição' :
                      tipoTxt === 'PS' ? 'Plano de Saúde' : 'Outro';
    const tipoVal = b.tipo_valor === '%' ? '%' : 'R$';
    const valor = (b.valor != null && b.valor !== '') ? Number(b.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    const inicio = b.inicio ? (b.inicio.toLowerCase() === 'admissão' || b.inicio.toLowerCase() === 'admissao' ? 'Admissão' : 'Outra data') : '';
    let dataIni = b.data_inicio ? dateISOToBr(b.data_inicio) : '';
    // Fallback visual: se início = Admissão e dataIni vazio, usar data_admissao do formulário
    if ((!dataIni || !dataIni.trim()) && ((b.inicio || '').toLowerCase() === 'admissão' || (b.inicio || '').toLowerCase() === 'admissao')) {
      const dataAdmEl = document.querySelector('#data_admissao');
      if (dataAdmEl && dataAdmEl.value) dataIni = dataAdmEl.value; // já em dd/mm/yyyy
    }
    const cnpjPlano = b.cnpj_plano || '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tipoLabel}</td>
      <td>${b.nome || ''}</td>
      <td>${cnpjPlano}</td>
      <td>${tipoVal}</td>
      <td>${valor}</td>
      <td>${inicio || (dataIni ? 'Outra data' : 'Admissão')}</td>
      <td>${dataIni}</td>
      <td class="col-acoes">
        <div class="d-inline-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary btn-icon btnEditarBeneficio" title="Editar" aria-label="Editar">
            <img src="${basePath}/images/editar.png" alt="Editar" class="icon" />
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger btn-icon btnRemoverBeneficio" title="Remover" aria-label="Remover">
            <img src="${basePath}/images/excluir.png" alt="Remover" class="icon" />
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateBeneficiosAdmissaoDates();
  try { document.dispatchEvent(new CustomEvent('beneficios:changed')); } catch(_){ }
}

// Atualiza células de data de benefícios cujo início é 'Admissão' e data vazia
function updateBeneficiosAdmissaoDates() {
  const dataAdmEl = document.querySelector('#data_admissao');
  if (!dataAdmEl || !dataAdmEl.value) return;
  const tbody = document.getElementById('tbodyBeneficios');
  if (!tbody) return;
  Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 7) return;
    const inicioTxt = (tds[5].textContent || '').trim().toLowerCase();
    const dataCell = tds[6];
    if ((inicioTxt === 'admissão' || inicioTxt === 'admissao') && !(dataCell.textContent || '').trim()) {
      dataCell.textContent = dataAdmEl.value; // dd/mm/yyyy
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const dataAdmEl = document.querySelector('#data_admissao');
  if (dataAdmEl) {
    ['change','blur','input'].forEach(ev => dataAdmEl.addEventListener(ev, updateBeneficiosAdmissaoDates));
  }
});
async function fillFormWithFuncionario(data) {
  const form = document.getElementById('formFuncionario');
  if (!form || !data) return;

  // Garantir que a flag de exclusão de foto não fique "presa" de um estado anterior
  const excluirFotoHiddenInit = document.getElementById('excluir_foto');
  if (excluirFotoHiddenInit) excluirFotoHiddenInit.value = 'false';

  // título e botões
  const titulo = document.getElementById('tituloFormFuncionario');
  if (titulo) titulo.textContent = 'Editar Funcionário';
  const btnFinalizar = document.getElementById('btnFinalizar');
  if (btnFinalizar) btnFinalizar.textContent = 'Salvar Alterações';

  // action/method override (QUERYSTRING para garantir override)
  form.action = `${basePath}/api/funcionarios/${data._id}?_method=PUT`;
  form.method = 'POST';
  let m = form.querySelector('input[name="_method"]');
  if (!m) {
    m = document.createElement('input');
    m.type = 'hidden'; m.name = '_method';
    form.appendChild(m);
  }
  m.value = 'PUT';

  // unidade
  const unidId = data.unidade_id?._id || data.unidade_id || '';
  setValueDelayed('#unidade', unidId);

  // função
  const funcNome = data.funcao_id?.nome || data.funcao_nome || '';
  const funcId   = data.funcao_id?._id || data.funcao_id || '';
  const funcInput = document.getElementById('funcao');
  const funcHidden = document.getElementById('funcao_id_hidden');
  if (funcInput) funcInput.value = funcNome || '';
  if (funcHidden) funcHidden.value = funcId || '';

  // identificação
  const el = (id) => document.getElementById(id);
  if (el('nome'))                   el('nome').value = data.nome || '';
  if (el('extra_nome_social'))      el('extra_nome_social').value = data.nome_social || '';
  if (el('extra_nome_mae'))         el('extra_nome_mae').value = data.nome_mae || '';
  if (el('extra_nome_pai'))         el('extra_nome_pai').value = data.nome_pai || '';
  if (el('rg'))                     el('rg').value = data.rg || '';
  if (el('extra_orgao_expedidor'))  el('extra_orgao_expedidor').value = data.rg_orgao || '';
  setValueDelayed('#rg_uf', data.rg_uf || '');
  if (data.rg_data_expedicao) applyDateToInputSafe('extra_rg_data_expedicao', data.rg_data_expedicao);
  if (el('cpf')) el('cpf').value = (data.cpf || '').replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (el('extra_pis')) el('extra_pis').value = data.pis || '';
  if (data.data_nascimento) applyDateToInputSafe('data_nascimento', data.data_nascimento);
  setValueDelayed('#sexo', data.sexo || '');
  setValueDelayed('#estado_civil', data.estado_civil || '');
  setValueDelayed('#raca_cor', data.raca_cor || '');
  setValueDelayed('#escolaridade', data.escolaridade || '');
  setValueDelayed('#nacionalidade', data.nacionalidade || '');
  if (el('pais_nascimento')) el('pais_nascimento').value = data.pais_nascimento || '';
  if (data.data_chegada_brasil) applyDateToInputSafe('extra_data_chegada_brasil', data.data_chegada_brasil);
  if (el('naturalidade')) el('naturalidade').value = data.naturalidade || '';

  // endereço (hidden + resumo)
  const end = data.endereco || {};
  if (el('end_cep'))     el('end_cep').value     = end.cep || '';
  if (el('end_tipo'))    el('end_tipo').value    = end.tipo_logradouro || '';
  if (el('end_logr'))    el('end_logr').value    = end.logradouro || '';
  if (el('end_num'))     el('end_num').value     = end.numero || '';
  if (el('end_comp'))    el('end_comp').value    = end.complemento || '';
  if (el('end_bairro'))  el('end_bairro').value  = end.bairro || '';
  if (el('end_uf'))      el('end_uf').value      = end.estado || '';
  if (el('end_cidade'))  el('end_cidade').value  = end.cidade || '';
  if (el('end_ibge'))    el('end_ibge').value    = end.codigo_ibge || '';
  const endResumo = el('endereco_resumo');
  if (endResumo) endResumo.value = buildEnderecoResumoFromParts(end);

  // contato
  if (el('telefone'))  el('telefone').value  = data.telefone || '';
  if (el('telefone2')) el('telefone2').value = data.telefone2 || '';
  if (el('email'))     el('email').value     = data.email || '';

  // CTPS / PCD
  const tipoCTPS = (data.tipo_ctps || '').toUpperCase();
  const fisico = el('ctpsFisico'), digital = el('ctpsDigital');
  if (tipoCTPS === 'DIGITAL') { if (digital) digital.checked = true; } else { if (fisico) fisico.checked = true; }
  if (el('extra_ctps_numero')) el('extra_ctps_numero').value = data.ctps_numero || '';
  if (el('extra_ctps_serie'))  el('extra_ctps_serie').value  = data.ctps_serie || '';
  setValueDelayed('#extra_ctps_uf', data.ctps_uf || '');
  setValueDelayed('#extra_pcd', data.pcd || '');
  setValueDelayed('#extra_tipo_deficiencia', data.tipo_deficiencia || '');
  if (el('extra_cid')) el('extra_cid').value = data.cid || '';

  // Foto 3x4 existente (se houver no registro)
  if (data.foto && data._id) {
    const fotoUrl = `${basePath}/api/funcionarios/${data._id}/foto?cb=${Date.now()}`;
    const legend = document.getElementById('foto_legenda_arquivo');
    const preview = document.getElementById('preview_foto_funcionario');
    if (typeof window.__setFoto3x4FromURL === 'function') {
      window.__setFoto3x4FromURL(fotoUrl, 'Foto atual');
    } else if (preview) {
      preview.src = fotoUrl;
      preview.classList.remove('d-none');
      if (legend) legend.textContent = 'Foto atual';
    }
    console.log('[EDIÇÃO] Foto carregada:', fotoUrl);
  }

  // Dados contratuais
  if (data.data_admissao) applyDateToInputSafe('data_admissao', data.data_admissao);
  setValueDelayed('#extra_tipo_admissao', data.tipo_admissao || '');
  if (el('extra_categoria_trabalhador')) el('extra_categoria_trabalhador').value = data.categoria_trabalhador || '';
  if (el('extra_tipo_contrato'))         el('extra_tipo_contrato').value         = data.tipo_contrato || '';
  if (data.data_termino) applyDateToInputSafe('data_termino', data.data_termino);
  if (el('extra_objeto_determinante')) el('extra_objeto_determinante').value = data.objeto_determinante || '';
  setValueDelayed('#extra_clausula_assecuratoria', data.clausula_assecuratoria || '');

  if (el('extra_cargo')) el('extra_cargo').value = data.cargo || '';
  if (el('extra_cbo'))   el('extra_cbo').value   = data.cbo || '';

  // Setor (nome + hidden id)
  const setorNome = data.departamento?.nome || data.setor_nome || '';
  const setorId   = data.departamento?._id || data.departamento || '';
  if (el('setor')) el('setor').value = setorNome;
  const setorHidden = document.getElementById('setor_id_hidden'); if (setorHidden) setorHidden.value = setorId;

  setValueDelayed('#extra_regime_contratacao', data.regime_contratacao || '');
  setValueDelayed('#extra_regime_jornada', data.regime_jornada || '');
  if (data.carga_semanal != null && el('extra_carga_semanal')) el('extra_carga_semanal').value = data.carga_semanal;
  if (data.salario_base != null && el('extra_salario_base')) el('extra_salario_base').value = Number(data.salario_base).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  setValueDelayed('#extra_tipo_salario', data.tipo_salario || '');
  setValueDelayed('#extra_forma_pagamento', data.forma_pagamento || '');
  if (el('extra_forma_pagamento_desc')) el('extra_forma_pagamento_desc').value = data.forma_pagamento_desc || '';

  // Bancário
  if (el('extra_banco'))       el('extra_banco').value       = data.banco || '';
  if (el('extra_agencia_num')) el('extra_agencia_num').value = data.agencia_num || '';
  if (el('extra_agencia_dv'))  el('extra_agencia_dv').value  = data.agencia_dv || '';
  if (el('extra_conta_num'))   el('extra_conta_num').value   = data.conta_num || '';
  if (el('extra_conta_dv'))    el('extra_conta_dv').value    = data.conta_dv || '';
  setValueDelayed('#extra_tipo_conta', data.tipo_conta || '');

  // Sindicato + FGTS + Previdenciário
  if (el('extra_sindicato')) el('extra_sindicato').value = data.sindicato || '';
  setValueDelayed('#extra_fgts_optante', data.fgts_optante || '');
  if (data.fgts_data) applyDateToInputSafe('extra_fgts_data', data.fgts_data);
  setValueDelayed('#extra_regime_previdenciario', data.regime_previdenciario || '');
  setValueDelayed('#extra_tipo_especial', data.tipo_especial || '');

  // Documentos
  if (el('extra_cert_militar'))      el('extra_cert_militar').value      = data.cert_militar || '';
  if (el('extra_cert_militar_orgao'))el('extra_cert_militar_orgao').value= data.cert_militar_orgao || '';
  setValueDelayed('#extra_cert_militar_uf', data.cert_militar_uf || '');
  if (data.cert_militar_data) applyDateToInputSafe('extra_cert_militar_data', data.cert_militar_data);

  if (el('extra_titulo'))       el('extra_titulo').value       = data.titulo || '';
  if (el('extra_titulo_zona'))  el('extra_titulo_zona').value  = data.titulo_zona || '';
  if (el('extra_titulo_secao')) el('extra_titulo_secao').value = data.titulo_secao || '';

  if (el('extra_cnh')) el('extra_cnh').value = data.cnh || '';
  setValueDelayed('#extra_cnh_categoria', data.cnh_categoria || '');
  if (data.cnh_validade) applyDateToInputSafe('extra_cnh_validade', data.cnh_validade);
  setValueDelayed('#extra_cnh_uf', data.cnh_uf || '');

  if (el('extra_orgao_prof'))      el('extra_orgao_prof').value      = data.orgao_prof || '';
  setValueDelayed('#extra_orgao_prof_uf', data.orgao_prof_uf || '');
  if (el('extra_orgao_prof_num'))  el('extra_orgao_prof_num').value  = data.orgao_prof_numero || '';

  // Observações
  if (el('observacoes')) el('observacoes').value = data.observacoes || '';

  // Anexos existentes
  console.log('[EDIÇÃO][ANEXOS] Recebidos do backend:', Array.isArray(data.anexos)? data.anexos.length : 'NULO/INDEFINIDO', data.anexos);
  if (typeof window.carregarAnexosAba7 === 'function') {
    try {
      window.carregarAnexosAba7(data.anexos || []);
      console.log('[EDIÇÃO][ANEXOS] carregarAnexosAba7 chamado');
    } catch(e){ console.warn('[EDIÇÃO][ANEXOS] Falha ao carregar anexos inicialmente:', e); }
  } else {
    console.warn('[EDIÇÃO][ANEXOS] Função carregarAnexosAba7 não disponível no momento do preenchimento');
  }

  // Campos biométricos (aba 2)
  if (el('hash_biometria_digital')) el('hash_biometria_digital').value = data.biometrico || '';
  if (el('hash_biometria_facial')) el('hash_biometria_facial').value = data.biometrico_face || '';
  if (el('fp_template_b64')) el('fp_template_b64').value = data.fp_template_b64 || '';
  if (el('fp_template_sha256')) el('fp_template_sha256').value = data.fp_template_sha256 || '';
  if (el('fp_imagem')) el('fp_imagem').value = data.fp_imagem || '';
  if (el('fp_dedo')) el('fp_dedo').value = data.fp_dedo || '';
  if (el('face_template_b64')) el('face_template_b64').value = data.face_template_b64 || '';
  if (el('face_template_sha256')) el('face_template_sha256').value = data.face_template_sha256 || '';
  if (el('face_imagem')) el('face_imagem').value = data.face_imagem || '';

  // Hidratar capturas faciais existentes (URLs Blob ou data URLs) para a UI externa e o modal
  try {
    const capEl = document.getElementById('face_capturas_json');
    if (capEl) {
      let arr = [];
      if (Array.isArray(data.biometrias_facial) && data.biometrias_facial.length) {
        arr = data.biometrias_facial.slice(0,3).map((o, i) => ({ idx: i, imagem: (o.imagem || o.url || o.file || ''), hash: o.hash || '' }));
      }
      // Fallbacks progressivos
      if (!arr.length) {
        const faceImg = data.face_imagem || '';
        if (faceImg) {
          const hashes = (typeof data.biometrico_face === 'string' ? data.biometrico_face.split('|').filter(Boolean).slice(0,3) : []);
          for (let i=0;i<Math.max(1, hashes.length || 3);i++) arr.push({ idx: i, imagem: faceImg, hash: hashes[i] || '' });
        }
      }
      if (!arr.length) {
        // Usa a rota de foto 3x4 (se existir) como fallback visual
        if (data._id && (data.foto || data.foto_url || data.foto_url_api || data.foto_urls)) {
          const fotoUrl = `${basePath}/api/funcionarios/${data._id}/foto?cb=${Date.now()}`;
          const hashes = (typeof data.biometrico_face === 'string' ? data.biometrico_face.split('|').filter(Boolean).slice(0,3) : []);
          for (let i=0;i<Math.max(1, hashes.length || 3);i++) arr.push({ idx: i, imagem: fotoUrl, hash: hashes[i] || '' });
        }
      }
      if (arr.length) {
        capEl.value = JSON.stringify(arr);
      }
      // pede para o módulo facial reidratar os thumbs externos
      try { window.WDModalBioFacial && typeof window.WDModalBioFacial.hydrateFromHidden === 'function' && window.WDModalBioFacial.hydrateFromHidden(); } catch(_) {}
    }
  } catch(e){ console.warn('[EDIÇÃO][FACIAL] falha ao hidratar capturas existentes:', e); }

  // Foto 3x4 existente
  if (data.foto && data._id) {
    const fotoUrl = `${basePath}/api/funcionarios/${data._id}/foto?cb=${Date.now()}`;
    const legend = document.getElementById('foto_legenda_arquivo');
    const preview = document.getElementById('preview_foto_funcionario');
    if (typeof window.__setFoto3x4FromURL === 'function') {
      window.__setFoto3x4FromURL(fotoUrl, 'Foto atual');
    } else if (preview) {
      preview.src = fotoUrl;
      preview.classList.remove('d-none');
      if (legend) legend.textContent = 'Foto atual';
    }
    console.log('[EDIÇÃO] Foto carregada:', fotoUrl);

  // Resetar o campo de exclusão quando carregar uma foto existente
    const excluirFotoHidden = document.getElementById('excluir_foto');
    if (excluirFotoHidden) {
      excluirFotoHidden.value = 'false';
    }
  }

  // Dependentes/Benefícios tabelas
  loadDependentesToTable(data.dependentes || []);
  loadBeneficiosToTable(data.beneficios || []);

  // ---------------- Fallback pós-inicialização (garante campos sensíveis) ----------------
  // Alguns componentes (flatpickr/selects dinâmicos) podem sobrescrever ou limpar valores logo após o preenchimento.
  // Executamos um reforço assíncrono em pequenos intervalos para assegurar persistência dos valores críticos.
  const criticalState = {
    tentativas: 0,
    max: 10,
    id: data._id || '',
    data_termino: data.data_termino ? dateISOToBr(data.data_termino) : '',
    objeto_determinante: data.objeto_determinante || '',
    clausula_assecuratoria: data.clausula_assecuratoria || '',
    anexos: Array.isArray(data.anexos) ? data.anexos : [],
    foto: data.foto || '',
    // Valores esperados para selects dinâmicos
    selects: {
      '#unidade':           (data.unidade_id?._id || data.unidade_id || ''),
      '#sexo':              (data.sexo || ''),
      '#estado_civil':      (data.estado_civil || ''),
      '#raca_cor':          (data.raca_cor || ''),
      '#escolaridade':      (data.escolaridade || ''),
      '#nacionalidade':     (data.nacionalidade || ''),
      '#rg_uf':             (data.rg_uf || ''),
      '#extra_ctps_uf':     (data.ctps_uf || ''),
      '#extra_cert_militar_uf': (data.cert_militar_uf || ''),
      '#extra_cnh_uf':      (data.cnh_uf || ''),
      '#extra_orgao_prof_uf': (data.orgao_prof_uf || ''),
      '#extra_tipo_admissao':    (data.tipo_admissao || ''),
      '#extra_regime_contratacao': (data.regime_contratacao || ''),
      '#extra_regime_jornada':     (data.regime_jornada || ''),
      '#extra_tipo_salario':       (data.tipo_salario || ''),
      '#extra_forma_pagamento':    (data.forma_pagamento || ''),
      '#extra_tipo_conta':         (data.tipo_conta || ''),
      '#extra_cnh_categoria':      (data.cnh_categoria || '')
    }
  };
  function reinforce() {
    criticalState.tentativas++;
    // Data de término
    if (criticalState.data_termino) {
      const elTerm = document.getElementById('data_termino');
      if (elTerm && !elTerm.value) elTerm.value = criticalState.data_termino;
      if (elTerm && elTerm._flatpickr && elTerm._flatpickr.input && elTerm._flatpickr.input.value !== criticalState.data_termino) {
        try { elTerm._flatpickr.setDate(criticalState.data_termino, false, 'd/m/Y'); } catch(_){}
      }
    }
    // Reforço de selects dinâmicos
    try {
      const expected = criticalState.selects || {};
      Object.keys(expected).forEach(sel => {
        const val = expected[sel];
        if (!val) return;
        const el = document.querySelector(sel);
        if (!el) return;
        // Se ainda não refletiu o valor, reaplica com mecanismo resiliente
        if (el.value !== String(val)) {
          setValueDelayed(sel, val, 4, 200);
        }
      });
    } catch(_e) {}
    // Objeto determinante
    if (criticalState.objeto_determinante) {
      const objEl = document.getElementById('extra_objeto_determinante');
      if (objEl && !objEl.value) objEl.value = criticalState.objeto_determinante;
    }
    // Cláusula assecuratória
    if (criticalState.clausula_assecuratoria) {
      const clausEl = document.getElementById('extra_clausula_assecuratoria');
      if (clausEl && !clausEl.value) {
        clausEl.value = criticalState.clausula_assecuratoria;
        clausEl.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }
    // Anexos existentes (reforço)
    if (criticalState.anexos.length) {
      const lista = document.getElementById('listaAnexos');
      if (typeof window.carregarAnexosAba7 !== 'function') {
        console.log('[REFORCE][ANEXOS] carregarAnexosAba7 ainda indisponível tentativa', criticalState.tentativas);
      } else if (lista && !lista.children.length) {
        try {
          console.log('[REFORCE][ANEXOS] Reaplicando anexos. Quantidade:', criticalState.anexos.length);
          window.carregarAnexosAba7(criticalState.anexos);
        } catch(e){ console.warn('[REFORCE][ANEXOS] carregarAnexosAba7 falhou:', e); }
      }
    }
    // Foto (reafirma caso preview tenha sido limpo)
    if (criticalState.foto && criticalState.id) {
      const preview = document.getElementById('preview_foto_funcionario');
      if (preview && (!preview.getAttribute('src') || preview.classList.contains('d-none'))) {
        const fotoUrl = `${basePath}/api/funcionarios/${criticalState.id}/foto?cb=${Date.now()}`;
        if (typeof window.__setFoto3x4FromURL === 'function') {
          window.__setFoto3x4FromURL(fotoUrl, 'Foto atual');
        } else {
          preview.src = fotoUrl;
          preview.classList.remove('d-none');
        }
      }
    }
    if (criticalState.tentativas < criticalState.max) {
      setTimeout(reinforce, 200); // re-checa por ~2s
    }
  }
  setTimeout(reinforce, 150); // inicia após pequeno atraso
}

/* ======================== BOOTSTRAP / INICIALIZAÇÃO ======================== */
document.addEventListener('DOMContentLoaded', function() {
  // Máscaras
  setTimeout(applyMasks, 1000);

  // Utilitário: construir HTML da coluna "Ações" dos funcionários (detalhes/editar/excluir)
  // Mantém consistência de ícones e classes em criações dinâmicas de linhas
  function buildAcoesFuncionarioHTML(funcId) {
    const idAttr = funcId ? String(funcId) : '';
    return `
      <div class="d-inline-flex gap-1">
        <button type="button" class="btn btn-outline-info btn-sm btn-icon btn-detalhes-func" data-func-id="${idAttr}" title="Detalhes" aria-label="Detalhes">
          <img src="${basePath}/images/detalhe.png" alt="Detalhes" class="icon" />
        </button>
        <button type="button" class="btn btn-outline-primary btn-sm btn-icon btn-edit-func" title="Editar" aria-label="Editar">
          <img src="${basePath}/images/editar.png" alt="Editar" class="icon" />
        </button>
        <form method="POST" action="${basePath}/api/funcionarios/${idAttr}/delete" class="d-inline">
          <button class="btn btn-outline-danger btn-sm btn-icon" type="submit" title="Excluir" aria-label="Excluir">
            <img src="${basePath}/images/excluir.png" alt="Excluir" class="icon" />
          </button>
        </form>
      </div>
    `;
  }
  // expor globalmente para uso em inserções dinâmicas
  window.buildAcoesFuncionarioHTML = buildAcoesFuncionarioHTML;

  // Reaplicar máscaras ao trocar de aba
  document.querySelectorAll('#tabsFuncionario [data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => {
      setTimeout(applyMasks, 500);
      updateWizardButtons(); // Atualizar botões do wizard ao trocar de aba
    });
  });

  // Sistema de persistência temporária para aba3

  // --- PERSISTÊNCIA ABA 3 (robusta p/ flatpickr) ---
  (function persistAba3() {
    const KEY = 'aba3_temp_data';

    const get = () => {
      try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
      catch { return {}; }
    };
    const set = (obj) => localStorage.setItem(KEY, JSON.stringify(obj || {}));

    const ids = {
      termino: 'data_termino',
      objeto:  'extra_objeto_determinante',
      claus:   'extra_clausula_assecuratoria',
    };

    function lerForm() {
      return {
        data_termino: document.getElementById(ids.termino)?.value || '',
        objeto_determinante: document.getElementById(ids.objeto)?.value || '',
        clausula_assecuratoria: document.getElementById(ids.claus)?.value || ''
      };
    }

    function gravar() {
      const dados = lerForm();
      set(dados);
    }

    function setDateBr(el, value) {
      if (!el || !value) return;
      if (el._flatpickr) {
        // evita que o flatpickr limpe o valor depois
        el._flatpickr.setDate(value, false, 'd/m/Y');
      } else {
        el.value = value;
      }
    }

    function restaurar() {
      const d = get();
      const elTermino = document.getElementById(ids.termino);
      const elObjeto  = document.getElementById(ids.objeto);
      const elClaus   = document.getElementById(ids.claus);

      if (d.data_termino) setDateBr(elTermino, d.data_termino);
      if (elObjeto && d.objeto_determinante) elObjeto.value = d.objeto_determinante;
      if (elClaus && d.clausula_assecuratoria) {
        elClaus.value = d.clausula_assecuratoria;
        elClaus.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }

    // salva a cada digitação/mudança
    ['data_termino','extra_objeto_determinante','extra_clausula_assecuratoria'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', gravar);
      el?.addEventListener('change', gravar);
    });

    // salva ao sair da aba3
    document.querySelectorAll('#tabsFuncionario [data-bs-toggle="tab"]').forEach(tab => {
      tab.addEventListener('hide.bs.tab', (e) => {
        const target = e.target.getAttribute('data-bs-target') || e.target.getAttribute('href');
        if (target === '#aba3') gravar();
      });
    });

    // restaura assim que a aba3 for mostrada (e de novo 200ms depois se o flatpickr reinitiar)
    document.querySelector('#tab-aba3')?.addEventListener('shown.bs.tab', () => {
      restaurar();
      setTimeout(restaurar, 200);
    });

    // 1ª carga
    restaurar();
  })();

  // Fallback periódico
  // TODO(legacy): este setInterval é um paliativo para casos onde elementos são recriados
  // por scripts externos. Avaliar substituir por MutationObserver limitado ao formulário
  // para evitar processamento contínuo a cada 2s.
  // Polling antigo de máscaras removido (centralização global)

  /*
  // FUTURE(optimization): substituição do polling acima por observer específico
  (function setupFormMutationObserver(){
    const form = document.getElementById('formFuncionario');
    if(!form || typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(mutations => {
      let needsMask = false;
      for(const m of mutations){
        if(m.addedNodes && m.addedNodes.length){ needsMask = true; break; }
      }
      if(needsMask){
        // Debounce simples
        clearTimeout(window.__wdgMaskDebounce);
        window.__wdgMaskDebounce = setTimeout(()=>{ applyMasks(); }, 120);
      }
    });
    observer.observe(form, { childList:true, subtree:true });
    console.log('[MUTATION_OBSERVER] Ativado para formFuncionario (descomente para usar).');
  })();
  */

  // Wizard
  function navigateToNextTab() {
    const activeTab = document.querySelector('#tabsFuncionario .nav-link.active');
    const tabs = document.querySelectorAll('#tabsFuncionario .nav-link');
    const currentIndex = Array.from(tabs).indexOf(activeTab);
    const isLastTab = currentIndex === tabs.length - 1;

    if (isLastTab) {
      // Última aba: disparar submit padrão (que já é interceptado pelo listener do form)
      console.log('=== REQUEST SUBMIT (última aba) ===');
      const form = document.getElementById('formFuncionario');
      if (form) {
        form.requestSubmit();
      }
    } else {
      // Caso contrário, navegar para a próxima aba
      const nextTab = activeTab?.parentElement?.nextElementSibling?.querySelector('.nav-link');
      if (nextTab) { nextTab.click(); updateWizardButtons(); }
    }
  }
  function isOnLastTab(){
    const tabs = document.querySelectorAll('#tabsFuncionario .nav-link');
    const activeTab = document.querySelector('#tabsFuncionario .nav-link.active');
    if(!tabs.length || !activeTab) return false;
    const currentIndex = Array.from(tabs).indexOf(activeTab);
    return currentIndex === tabs.length - 1;
  }
  // Interceptar Enter em campos para não submeter antes da última aba
  (function preventEarlyEnterSubmit(){
    const form = document.getElementById('formFuncionario');
    if(!form) return;
    form.addEventListener('keydown', (ev)=>{
      if(ev.key === 'Enter'){
        // Permite Enter em textarea ou dentro de componentes específicos
        if(ev.target && (ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable)) return;
        // Permite se for último tab
        if(!isOnLastTab()){
          ev.preventDefault();
          navigateToNextTab();
        }
      }
    });
  })();
  function navigateToPrevTab() {
    const activeTab = document.querySelector('#tabsFuncionario .nav-link.active');
    const prevTab = activeTab?.parentElement?.previousElementSibling?.querySelector('.nav-link');
    if (prevTab) { prevTab.click(); updateWizardButtons(); }
  }
  function updateWizardButtons() {
    const activeTab = document.querySelector('#tabsFuncionario .nav-link.active');
    const tabs = document.querySelectorAll('#tabsFuncionario .nav-link');
    const btnVoltar = document.getElementById('btnVoltar');
    const btnProximo = document.getElementById('btnProximo');
    const btnFinalizar = document.getElementById('btnFinalizar');
    const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
    if (!activeTab || !tabs.length || !btnVoltar || !btnProximo || !btnFinalizar) return;
    const currentIndex = Array.from(tabs).indexOf(activeTab);
    const isFirstTab = currentIndex === 0;
    const isLastTab = currentIndex === tabs.length - 1;

    // Verificar se está em modo de edição
    const formFuncionario = document.getElementById('formFuncionario');
    const isEditing = formFuncionario && /\?_method=PUT\b/.test(formFuncionario.action);

    // Mostrar/ocultar botão "Cancelar Edição" baseado no modo
    if (btnCancelarEdicao) {
      if (isEditing) {
        btnCancelarEdicao.classList.remove('d-none');
      } else {
        btnCancelarEdicao.classList.add('d-none');
      }
    }

    btnVoltar.disabled = isFirstTab;
    btnVoltar.style.opacity = isFirstTab ? '0.5' : '1';
    if (isLastTab) {
      // Na última aba, alterar o texto do botão baseado no modo (criação/edição)
      const buttonText = isEditing ? 'Salvar Alterações' : 'Cadastrar';
      btnProximo.textContent = buttonText;
      // Padrão: manter outline-primary sempre
      btnProximo.classList.remove('btn-success', 'btn-primary');
      btnProximo.classList.add('btn-outline-primary');
      btnFinalizar.classList.add('d-none');
    } else {
      // Nas outras abas, manter o texto "Próximo"
      btnProximo.textContent = 'Próximo »';
      btnProximo.classList.remove('btn-success', 'btn-primary');
      btnProximo.classList.add('btn-outline-primary');
      btnFinalizar.classList.add('d-none');
    }
  }

  // Função para cancelar edição e iniciar novo cadastro
  function cancelarEdicao() {
    if (!confirm('Tem certeza que deseja cancelar a edição?\nTodos os dados não salvos serão perdidos.')) {
      return;
    }

    const form = document.getElementById('formFuncionario');
    if (!form) return;

    // Limpar todos os campos do formulário
    form.reset();

    // Resetar action do formulário para modo de criação
  form.action = `${basePath}/api/funcionarios`;
    form.method = 'POST';

    // Limpar campos hidden específicos
    const hiddenFields = [
      'dependentes_json',
      'beneficios_json',
      'end_cep', 'end_tipo', 'end_logr', 'end_num', 'end_comp', 'end_bairro', 'end_uf', 'end_cidade', 'end_ibge'
    ];
    hiddenFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Resetar título da página
    const titulo = document.getElementById('tituloFormFuncionario');
    if (titulo) {
      titulo.textContent = 'Cadastrar Funcionário';
    }

    // Voltar para a primeira aba
    const primeiraAba = document.getElementById('tab-aba1');
    if (primeiraAba) {
      primeiraAba.click();
    }

    // Limpar dados temporários de edição
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('aba3_temp_data');
    }

    // Atualizar botões do wizard
    updateWizardButtons();

    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' });

    alert('Edição cancelada. Você pode iniciar um novo cadastro.');
  }

  const btnProximo = document.getElementById('btnProximo');
  const btnVoltar = document.getElementById('btnVoltar');
  const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
  btnProximo?.addEventListener('click', (e) => { e.preventDefault(); navigateToNextTab(); });
  btnVoltar?.addEventListener('click',  (e) => { e.preventDefault(); navigateToPrevTab(); });
  btnCancelarEdicao?.addEventListener('click', (e) => { e.preventDefault(); cancelarEdicao(); });
  updateWizardButtons();

  // === SINCRONIA DO ENDEREÇO (usa helpers se existirem) ===
  // Funções auxiliares movidas para escopo global

  const formFuncionario = document.getElementById('formFuncionario');
  const endDisplay = document.getElementById('endereco'); // input visível (geralmente name="endereco_str")

  // --- sincroniza hiddens no load e a cada mudança do campo visível ---
  // syncEndereco() movida para escopo global
  syncEndereco(); // importante ao abrir a tela de EDIÇÃO já preenchida
  endDisplay?.addEventListener('input',  syncEndereco);
  endDisplay?.addEventListener('change', syncEndereco);

  // --- SUBMIT: sincroniza antes de validar, valida, e só depois normaliza/serializa ---
if (formFuncionario && !formFuncionario.__wdSubmitBound) {
  formFuncionario.addEventListener('submit', async function (e) {
    if (window.__funcSubmitLock) { // já em processo - evita duplicação
      e.preventDefault();
      return;
    }
    await handleFormSubmission(e);
  });
  formFuncionario.__wdSubmitBound = true;
}

  // === EDIÇÃO NO MESMO FORMULÁRIO (sem navegar) ===
  async function entrarModoEdicao(id, btn) {
    try {
      if (btn) {
        btn.disabled = true;
        btn.dataset._oldHtml = btn.innerHTML; // preservar ícone + estrutura
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Abrindo...';
      }
  const resp = await fetch(`${basePath}/api/funcionarios/${id}`, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!resp.ok) throw new Error(`Falha ao carregar funcionário (${resp.status})`);
      const json = await resp.json();
      const funcionario = json?.funcionario || json?.data || json; // cobre diferentes formatos
      if (!funcionario || !funcionario._id) throw new Error('Resposta inválida da API.');

      // Ativar temporariamente a aba 7 para garantir que os campos sejam preenchidos
      const aba7Tab = document.getElementById('tab-aba7');
      const aba7Pane = document.getElementById('aba7');
      if (aba7Tab && aba7Pane) {
        aba7Tab.click();
        updateWizardButtons(); // Atualizar botões após mudança programática de aba
        // Aguardar um pouco para garantir que a aba seja ativada
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await fillFormWithFuncionario(funcionario);

      // Voltar para a primeira aba
      document.getElementById('tab-aba1')?.click();
      updateWizardButtons(); // Atualizar botões após mudança programática de aba
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      alert('Não foi possível abrir para edição. ' + (err?.message || ''));
    } finally {
      if (btn) {
        btn.disabled = false;
        // Restaura o HTML com o ícone; fallback garante o ícone de editar
  btn.innerHTML = btn.dataset._oldHtml || `<img src="${basePath}/images/editar.png" alt="Editar" class="icon" />`;
        delete btn.dataset._oldHtml;
      }
    }
  }

  // Handler delegado para o botão Editar (AGORA NÃO NAVEGA)
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.btn-edit-func');
    if (!btn) return;
    ev.preventDefault();
    const tr = btn.closest('tr');
    const id = tr?.dataset.funcId || tr?.getAttribute('data-func-id');
    if (id) entrarModoEdicao(id, btn);
  });

  // === DEPENDENTES ===
  // Inserir dependente (já implementado no EJS)
  // Editar/Remover dependente
  document.addEventListener('click', (ev) => {
    const btnEditar = ev.target.closest('.btnEditarDep');
    const btnRemover = ev.target.closest('.btnRemoverDep');

    if (btnEditar) {
      // A edição já está implementada no script inline do EJS
      return; // Não fazer nada, deixar o EJS lidar com isso
    }

    if (btnRemover) {
      btnRemover.closest('tr').remove();
    }
  });

  // === BENEFÍCIOS ===
  // Editar/Remover benefício (o inserir já está implementado no EJS)
  document.addEventListener('click', (ev) => {
    const btnEditar = ev.target.closest('.btnEditarBeneficio');
    const btnRemover = ev.target.closest('.btnRemoverBeneficio');

    if (btnEditar) {
      // A edição já está implementada no script inline do EJS
      return; // Não fazer nada, deixar o EJS lidar com isso
    }

    if (btnRemover) {
      btnRemover.closest('tr').remove();
    }
  });

});

// Função para voltar o formulário ao modo de criação após edição
function resetToCreateMode(){
  const form = document.getElementById('formFuncionario');
  if(!form) return;
  // Remover hidden _id e _method
  const hid = form.querySelector('input[name="_id"]'); if(hid) hid.remove();
  const mtd = form.querySelector('input[name="_method"]'); if(mtd) mtd.remove();
  // Restaurar action/method para modo criação (remove query _method=PUT)
  try {
    const cleanAction = `${basePath}/api/funcionarios`;
    form.action = cleanAction;
    form.method = 'POST';
  } catch(_) {}
  // Limpar campos principais (apenas os que fazem sentido manter vazios)
  const keep = new Set(['_csrf']);
  form.querySelectorAll('input, textarea, select').forEach(el=>{
    if(keep.has(el.name)) return;
    // Remover hiddens __unset[] completamente
    if(el.type==='hidden' && el.name === '__unset[]'){ el.remove(); return; }
    if(['button','submit','checkbox','radio','file'].includes(el.type)){
      if(el.type==='checkbox' || el.type==='radio') el.checked=false;
      return;
    }
    if(el.tagName==='SELECT'){ el.selectedIndex = 0; }
    else if(el.type!=='file'){ el.value=''; }
    // Remover classes de validação visuais
    el.classList.remove('is-valid','is-invalid');
  });

  // Limpeza explícita de campos biométricos (facial e digital)
  try {
    // Facial
    const faceFields = ['hash_biometria_facial','face_template_b64','face_template_sha256','face_imagem','face_capturas_json'];
    faceFields.forEach(id=>{ const el = document.getElementById(id); if (el) el.value = ''; });
    // Disparar a limpeza visual (usa o handler já existente do botão)
    const btnLimparFacial = document.getElementById('btnLimparFacialCampo');
    if (btnLimparFacial) {
      btnLimparFacial.click();
    }
    // Digital (mantém consistência com os demais)
    const fpFields = ['hash_biometria_digital','fp_template_b64','fp_template_sha256','fp_imagem','fp_capturas_json','fp_dedo'];
    fpFields.forEach(id=>{ const el = document.getElementById(id); if (el) el.value = ''; });
    const btnLimparDigital = document.getElementById('btnLimparDigital');
    if (btnLimparDigital) {
      btnLimparDigital.click();
    }
  } catch(_ignore) {}
  // Limpar hiddens específicos (endereço e JSONs)
  ['dependentes_json','beneficios_json','end_cep','end_tipo','end_logr','end_num','end_comp','end_bairro','end_uf','end_cidade','end_ibge']
    .forEach(id=>{ const el = document.getElementById(id); if(el) el.value=''; });
  // Reset foto preview
  const prev = document.getElementById('preview_foto_funcionario');
  if(prev){ prev.removeAttribute('src'); prev.classList.add('d-none'); }
  const fotoLegenda = document.getElementById('foto_legenda_arquivo'); if(fotoLegenda) fotoLegenda.textContent='';
  // Zerar completamente o widget da Foto 3x4 (inclui miniatura/"Ver")
  try {
    if (typeof window.__setFoto3x4FromURL === 'function') {
      // Usar o helper oficial: passar string vazia dispara o clearPreview()
      window.__setFoto3x4FromURL('');
    } else {
      // Fallback defensivo caso o helper ainda não tenha sido registrado
      const thumbSlot = document.getElementById('foto3x4Thumb');
      if (thumbSlot) thumbSlot.innerHTML = '<span>Vazio</span>';
      const info = document.getElementById('foto3x4Info');
      if (info) { info.textContent = '—'; info.removeAttribute('title'); }
      const btnVer = document.getElementById('btnVerFoto');
      if (btnVer) btnVer.classList.add('d-none');
    }
  } catch(_ignore) {}
  // Limpar input file da foto explicitamente (mantido fora do loop para browsers que não limpam apenas reatribuindo value='')
  const fotoInput = document.getElementById('foto');
  if(fotoInput){
    try { fotoInput.value=''; } catch(_){}
    // Clonar técnica (caso value não limpe em alguns navegadores):
    if(fotoInput.value){
      const clone = fotoInput.cloneNode(true);
      fotoInput.replaceWith(clone);
    }
  }
  const btnExcluirFoto = document.getElementById('btnExcluirFoto');
  if(btnExcluirFoto) btnExcluirFoto.classList.add('d-none');
  // Reset flag de exclusão da foto para não afetar próximo cadastro/edição
  const excluirFotoHidden = document.getElementById('excluir_foto');
  if (excluirFotoHidden) excluirFotoHidden.value = 'false';
  // Reset tabelas dependentes/benefícios
  const depBody = document.getElementById('tbodyDependentes'); if(depBody) depBody.innerHTML='';
  const benBody = document.getElementById('tbodyBeneficios'); if(benBody) benBody.innerHTML='';
  // Reset anexos visual
  const listaAnexos = document.getElementById('listaAnexos'); if(listaAnexos) listaAnexos.innerHTML='';
  // Título & botões
  const titulo = document.getElementById('tituloFormFuncionario'); if(titulo) titulo.textContent='Cadastrar Funcionário';
  document.getElementById('btnFinalizar')?.classList.add('d-none');
  document.getElementById('btnCancelarEdicao')?.classList.add('d-none');
  // Voltar para a primeira aba e atualizar botões
  try { document.getElementById('tab-aba1')?.click(); } catch(_){ }
  try { if(typeof updateWizardButtons==='function') updateWizardButtons(); } catch(_){ }
  // Limpar dados temporários
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem('aba3_temp_data'); } catch(_){ }
  // Focar primeiro campo
  const first = form.querySelector('[name="nome"]'); if(first) first.focus();
  // Scroll topo para feedback
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_){ }
  console.log('[FORM] Resetado para modo criação');
}

// Função para lidar com o envio do formulário
async function handleFormSubmission(e) {
  if (!window.__funcHandleLogged) { // evita log duplicado quando fallback delega
    console.log('=== HANDLE FORM SUBMISSION STARTED ===');
    window.__funcHandleLogged = true;
  }

  // Se não estiver na última aba, apenas avança e não envia ainda
  try {
    const tabs = document.querySelectorAll('#tabsFuncionario .nav-link');
    const active = document.querySelector('#tabsFuncionario .nav-link.active');
    if(tabs.length && active){
      const idx = Array.from(tabs).indexOf(active);
      const isLast = idx === tabs.length - 1;
      if(!isLast){
        if(e && e.preventDefault) e.preventDefault();
        console.log('[SUBMIT][ABORT] Não é última aba -> navegando para próxima.');
        const next = active.parentElement?.nextElementSibling?.querySelector('.nav-link');
        if(next){ next.click(); }
        window.__funcSubmitLock = false; // libera para próxima tentativa ao final
        return;
      }
    }
  } catch(_ignore){ /* fallback silencioso */ }

  // Guardar flag global simples para evitar dupla submissão
  if (window.__funcSubmitLock) {
    console.warn('[SUBMIT] Ignorado - submissão já em andamento');
    if (e && e.preventDefault) e.preventDefault();
    return;
  }
  window.__funcSubmitLock = true;

  const formFuncionario = document.getElementById('formFuncionario');
  if (!formFuncionario) {
    console.error('Form not found!');
    window.__funcSubmitLock = false;
    return;
  }
  // Normalização leve de datas parciais (ex: 1/1/1990 -> 01/01/1990)
  (function normalizeDatesPreSubmit(){
    const primary = ['data_nascimento','data_admissao','data_demissao'];
    primary.forEach(name => {
      const el = formFuncionario.querySelector(`[name="${name}"]`);
      if(!el) return;
      let v = (el.value||'').trim();
      if(!v) return;
      if(el.dataset.dateNormalized==='1') return; // já processada anteriormente via normalizeScalarFields
      // ISO -> BR
      const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(isoMatch){ v = isoMatch[3] + '/' + isoMatch[2] + '/' + isoMatch[1]; }
      // padding d/m/yyyy
      const short = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if(short){ v = short[1].padStart(2,'0') + '/' + short[2].padStart(2,'0') + '/' + short[3]; }
      // valida antes de aceitar
      if(isValidBrDate && isValidBrDate(v)){
        el.value = v;
      }
    });
  })();

  // Se foi chamado por um evento, prevenir o comportamento padrão
  if (e && e.preventDefault) {
    e.preventDefault();
  }

  const isEditing =
    (formFuncionario.querySelector('input[name="_method"]')?.value || '')
      .toUpperCase() === 'PUT' ||
    /\?_method=PUT\b/.test(formFuncionario.action);

  // 1) Preenche os hiddens de endereço (fallback e parsing)
  syncHiddenEnderecoFromResumo();
  syncEndereco();

  // Reidratar datas a partir do flatpickr (em raros casos o valor visual pode não estar no input)
  (function rehydrateDatesFromPicker(){
    function rehydrate(name){
      try{
        const el = formFuncionario.querySelector(`[name="${name}"]`);
        if(!el) return;
        const cur = String(el.value||'').trim();
        if(cur) return; // já tem valor
        // Tenta ler do flatpickr
        const inst = el._flatpickr;
        let v = '';
        if(inst){
          if(inst.selectedDates && inst.selectedDates.length){
            const d = inst.selectedDates[0];
            // dd/mm/aaaa coerente com masks/validações
            const dd = String(d.getDate()).padStart(2,'0');
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const yy = String(d.getFullYear());
            v = `${dd}/${mm}/${yy}`;
          } else if(inst.input && inst.input.value){
            v = String(inst.input.value||'').trim();
          }
        }
        if(!v && el.getAttribute('value')){
          v = String(el.getAttribute('value')||'').trim();
        }
        if(!v && el.dataset && el.dataset.filledValue){ v = String(el.dataset.filledValue).trim(); }
        if(v){ el.value = v; }
      }catch(_e){}
    }
    ['data_nascimento','data_admissao','data_demissao','data_termino','fgts_data','rg_data_expedicao','cnh_validade','cert_militar_data','data_chegada_brasil'].forEach(rehydrate);
  })();

  // Garante que o backend receba endereco_str (caso o template use outro name/id)
  const autoEndStr = formFuncionario.querySelector('input[type="hidden"][data-auto="1"][name="endereco_str"]');
  if (autoEndStr) autoEndStr.remove();
  const visEndereco = document.getElementById('endereco') || document.getElementById('endereco_resumo');
  if (visEndereco) addHidden(formFuncionario, 'endereco_str', visEndereco.value || '');

  // 2) Valida obrigatórios
  const faltando = [];
  // Em edição, não exigimos data_nascimento aqui (o backend trata parcial/merge);
  // em criação, ela é obrigatória.
  const camposObrigatorios = isEditing
    ? ['unidade_id','nome','rg','cpf','sexo','email','telefone']
    : ['unidade_id','nome','rg','cpf','data_nascimento','sexo','email','telefone'];
  camposObrigatorios.forEach((campo) => {
    const el = formFuncionario.querySelector(`[name="${campo}"]`);
    if (!el) { faltando.push(campo); return; }
    let val = String(el.value || '').trim();
    // Tolerância especial para datas (principalmente data_nascimento com flatpickr)
    if (!val && (campo === 'data_nascimento')) {
      try {
        const inst = el._flatpickr;
        if (inst && inst.selectedDates && inst.selectedDates.length) {
          const d = inst.selectedDates[0];
          const dd = String(d.getDate()).padStart(2,'0');
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const yy = String(d.getFullYear());
          val = `${dd}/${mm}/${yy}`;
          el.value = val; // reflita no input para os próximos passos
        } else if (inst && inst.input && inst.input.value) {
          val = String(inst.input.value||'').trim();
          if (val) el.value = val;
        } else if (el.getAttribute('value')) {
          val = String(el.getAttribute('value')||'').trim();
          if (val) el.value = val;
        } else if (el.dataset && el.dataset.filledValue) {
          val = String(el.dataset.filledValue||'').trim();
          if (val) el.value = val;
        }
      } catch(_rehydErr) {
        // diagnóstico mínimo, sem interromper
        try { console.warn('[REQUIRED][data_nascimento] rehydrate falhou', _rehydErr); } catch(_c){}
      }
    }
    if (!val) faltando.push(campo);
  });
  if(window.DEBUG_FORM_SUBMIT){
    const dn = formFuncionario.querySelector('[name="data_nascimento"]');
    console.debug('[REQUIRED_CHECK] data_nascimento valor="'+ (dn?dn.value:'<sem elemento>') +'"');
  }
  const endCep = formFuncionario.querySelector('#end_cep');
  if (!endCep || !String(endCep.value || '').trim()) faltando.push('endereco[cep]');

  if (faltando.length) {
    alert('Campos obrigatórios ausentes: ' + faltando.join(', '));
    window.__funcSubmitLock = false;
    return;
  }

  // Validação específica telefone / email usando Validators se disponível
  // ================= VALIDACOES DETALHADAS =================
  const errors = [];
  function markInvalid(el, cond){
    if(!el) return; if(cond){ el.classList.remove('is-invalid'); el.classList.add('is-valid'); } else { el.classList.add('is-invalid'); el.classList.remove('is-valid'); }
  }
  // CPF
  const cpfEl = formFuncionario.querySelector('[name="cpf"]');
  if (cpfEl && window.WDMasks?.isValidCPF) {
    const raw = cpfEl.value.replace(/\D/g,'');
    const ok = !raw || window.WDMasks.isValidCPF(raw);
    markInvalid(cpfEl, ok);
    if(!ok) errors.push('CPF inválido');
  }
  // PIS (opcional, validar só se preenchido)
  const pisEl = formFuncionario.querySelector('[name="pis"],[name="extra_pis"]');
  if (pisEl && window.WDMasks?.isValidPIS) {
    const rawP = pisEl.value.replace(/\D/g,'');
    if(rawP){ const ok = window.WDMasks.isValidPIS(rawP); markInvalid(pisEl, ok); if(!ok) errors.push('PIS inválido'); }
  }
  // Telefone(s)
  const telEls = [formFuncionario.querySelector('#telefone'), formFuncionario.querySelector('#telefone2')].filter(Boolean);
  telEls.forEach(tel => {
    const digits = (tel.value||'').replace(/\D/g,'');
    if(digits){ const ok = digits.length>=10 && digits.length<=11; markInvalid(tel, ok); if(!ok) errors.push('Telefone inválido'); }
  });
  // Email
  const emailEl = formFuncionario.querySelector('[name="email"]');
  if(emailEl){ const val = String(emailEl.value||'').trim(); if(val){ const ok = window.WDMasks?.isValidEmail ? window.WDMasks.isValidEmail(val) : /.+@.+\..+/.test(val); markInvalid(emailEl, ok); if(!ok) errors.push('Email inválido'); } }
  // Data de nascimento (aceitar dd/mm/aaaa, d/m/aaaa, yyyy-mm-dd) com diagnóstico
  const dnEl = formFuncionario.querySelector('[name="data_nascimento"]');
  if(dnEl){
    let vOriginal = dnEl.value.trim();
    if(vOriginal){
      // Se vier yyyy-mm-dd converte para dd/mm/yyyy para manter consistência
      const iso = vOriginal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if(iso){ vOriginal = iso[3] + '/' + iso[2] + '/' + iso[1]; dnEl.value = vOriginal; }
      // Padding se necessário
      const short = vOriginal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if(short){ vOriginal = short[1].padStart(2,'0') + '/' + short[2].padStart(2,'0') + '/' + short[3]; dnEl.value = vOriginal; }
      const re = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      let ok=false; let motivo='';
      const m = vOriginal.match(re);
      if(m){
        const d = +m[1], mo = +m[2]-1, y = +m[3];
        const dt = new Date(y,mo,d);
        ok = dt.getFullYear()===y && dt.getMonth()===mo && dt.getDate()===d;
        if(!ok) motivo='data inexistente';
        if(ok){
          const anoAtual = new Date().getFullYear();
            if(!(y>1900 && y<=anoAtual)) { ok=false; motivo='ano fora da faixa'; }
        }
        // (Opcional: idade mínima/máxima) poderíamos validar > 14 anos, < 120 anos
      } else {
        motivo='formato';
      }
      if(!window.__wdDateDiag){ window.__wdDateDiag = []; }
      window.__wdDateDiag.push({campo:'data_nascimento', valor:vOriginal, ok, motivo, timestamp: Date.now()});
      if(window.__wdDateDiag.length>20) window.__wdDateDiag.shift();
      if(!ok){
        console.warn('[DATA_NASC][INVALID]', {valor:vOriginal, motivo, historico: window.__wdDateDiag});
        errors.push('Data de nascimento inválida');
        markInvalid(dnEl,false);
      } else {
        markInvalid(dnEl,true);
      }
    }
  }
  // Moeda salário base (se existir - converter p/ centavos)
  const salarioEl = formFuncionario.querySelector('#extra_salario_base');
  if (salarioEl){ const raw = salarioEl.value.replace(/[^0-9]/g,''); if(raw){ const valInt = parseInt(raw,10); if(isNaN(valInt) || valInt<=0){ markInvalid(salarioEl,false); errors.push('Salário base inválido'); } else markInvalid(salarioEl,true); } }
  // ENDEREÇO CEP
  if(endCep){ const cepOk = /^\d{8}$/.test(String(endCep.value||'').replace(/\D/g,'')); markInvalid(endCep, cepOk); if(!cepOk) errors.push('CEP inválido'); }
  if(errors.length){ alert('Erros:\n - ' + errors.join('\n - ')); window.__funcSubmitLock=false; return; }
  // ================= FIM VALIDACOES =================
  try {
    const telEl = formFuncionario.querySelector('#telefone');
    if(telEl){
      const okTel = window.Validators?.validarTelefoneValor ? window.Validators.validarTelefoneValor(telEl.value) : true;
      if(!okTel){
        alert('Telefone principal inválido. Informe DDD + número (10 ou 11 dígitos).');
        telEl.focus();
        return;
      }
    }
    const emailEl = formFuncionario.querySelector('#email');
    if(emailEl){
      const okEmail = window.Validators?.validarEmailValor ? window.Validators.validarEmailValor(emailEl.value) : true;
      if(!okEmail){
        alert('E-mail inválido. Verifique o formato.');
        emailEl.focus();
        return;
      }
    }
  } catch(err){ console.warn('[VALIDACAO][CONTATO] erro durante validação', err); }

  // 3) Normaliza e serializa tabelas
  normalizeScalarFields(formFuncionario);
  // Formatar telefones no padrão esperado pelo backend: (DD) 9999-9999 ou (DD) 99999-9999
  try {
    function formatTelDigits(raw){
      if(!raw) return '';
      const digits = String(raw).replace(/\D/g,'');
      if(digits.length === 10){ return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`; }
      if(digits.length === 11){ return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`; }
      return raw;
    }
    const tel1 = formFuncionario.querySelector('#telefone');
    if(tel1) tel1.value = formatTelDigits(tel1.value);
    const tel2 = formFuncionario.querySelector('#telefone2');
    if(tel2) tel2.value = formatTelDigits(tel2.value);
  } catch(normTelErr){ console.warn('[NORMALIZACAO][TELEFONE] falha', normTelErr); }
  serializeDependentesToJSON();
  serializeBeneficiosToJSON();

  // 4) Coletar campos para unset (apenas na edição)
  if (isEditing) {
    const unsets = collectUnsets(formFuncionario);
    console.log('[DEBUG][UNSETS] Coletados:', unsets);
    unsets.forEach(path => addHidden(formFuncionario, '__unset[]', path));
  }

  // 5) Sempre enviar via fetch para capturar erros da API adequadamente
  try {
    // DEBUG: Log dos dados que serão enviados
    if(window.DEBUG_FORM_SUBMIT){
      console.log('=== DEBUG FORM SUBMISSION ===');
      console.log('Campos obrigatórios verificados:', camposObrigatorios);
    }
    if(window.DEBUG_FORM_SUBMIT){
      camposObrigatorios.forEach(campo => {
        const el = formFuncionario.querySelector(`[name="${campo}"]`);
        console.log(`${campo}:`, el ? `"${el.value}"` : 'ELEMENTO NÃO ENCONTRADO');
      });
      console.log('endereco_resumo:', document.getElementById('endereco_resumo')?.value);
      console.log('end_cep:', document.getElementById('end_cep')?.value);
      console.log('end_cidade:', document.getElementById('end_cidade')?.value);
      console.log('end_uf:', document.getElementById('end_uf')?.value);
    }

    // DEBUG: Verificar se o formulário existe e tem elementos
    if(window.DEBUG_FORM_SUBMIT){
      console.log('Form element exists:', !!formFuncionario);
      console.log('Form elements count:', formFuncionario ? formFuncionario.elements.length : 0);
      console.log('Form method:', formFuncionario?.method);
      console.log('Form action:', formFuncionario?.action);
      console.log('Form enctype:', formFuncionario?.enctype);
    }

    // Coleta anexos (função global definida na aba 7) antes de montar FD
    let anexosNovos = [];
    try {
      if(typeof window.__collectAnexosForSubmit === 'function') {
        anexosNovos = window.__collectAnexosForSubmit(formFuncionario) || [];
      } else {
        console.warn('[ANEXOS] __collectAnexosForSubmit indisponível no momento da submissão');
      }
    } catch(colErr){ console.warn('[ANEXOS] Falha ao coletar anexos antes do FormData:', colErr); }

    // Converter datas para ISO antes de montar FormData (mantém consistência com backend)
    (function convertDatesToISO(){
      const dateNames = ['data_nascimento','data_admissao','data_demissao','fgts_data','rg_data_expedicao','cnh_validade','cert_militar_data','data_chegada_brasil','data_termino'];
      dateNames.forEach(name => {
        const el = formFuncionario.querySelector(`[name="${name}"]`);
        if(!el) return; let v = (el.value||'').trim(); if(!v) return;
        // Se já está em ISO e marcado, mantém
        if(/^\d{4}-\d{2}-\d{2}$/.test(v)){ el.dataset.dateNormalized='1'; return; }
        const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if(m){ el.value = `${m[3]}-${m[2]}-${m[1]}`; el.dataset.dateNormalized='1'; }
      });
    })();
    // Evitar enviar campos obrigatórios vazios em edição (mantém valor atual no servidor)
    const __tempDisabled = [];
    // Desabilitar temporariamente campos de apoio (staging) das abas 5 e 6,
    // pois o backend consome somente os JSONs consolidados (dependentes_json/beneficios_json)
    try {
      const stagingSelectors = ['[name^="dependente_"]','[name^="beneficio_"]'];
      stagingSelectors.forEach(sel => {
        formFuncionario.querySelectorAll(sel).forEach(el => {
          if (!el) return;
          if (el.disabled) return; // já não seria enviado
          el.disabled = true;
          __tempDisabled.push(el);
        });
      });
    } catch(_s){ /* silencioso */ }
    if(isEditing){
      try {
        const dnEl = formFuncionario.querySelector('[name="data_nascimento"]');
        if(dnEl && !String(dnEl.value||'').trim()){
          dnEl.disabled = true; __tempDisabled.push(dnEl);
        }
      } catch(_){ }
    }
    const fd = new FormData(formFuncionario);
    // Restaura elementos temporariamente desabilitados
    __tempDisabled.forEach(el=>{ try{ el.disabled=false; }catch(_){ } });
    // Adiciona anexos novos manualmente para evitar dependência da mutação de input.files
    if(anexosNovos && anexosNovos.length){
      anexosNovos.forEach(f=>{ try { fd.append('anexos', f); } catch(appErr){ console.warn('[ANEXOS] Falha ao anexar arquivo ao FormData:', f?.name, appErr); } });
      if(window.DEBUG_FORM_SUBMIT){ console.log('[ANEXOS] Anexos novos anexados ao FormData:', anexosNovos.length); }
    } else {
      if(window.DEBUG_FORM_SUBMIT){ console.log('[ANEXOS] Nenhum anexo novo para enviar'); }
    }
    if(window.DEBUG_FORM_SUBMIT){
      console.log('FormData created successfully:', !!fd);
      console.log('FormData entries count:', [...fd.entries()].length);
      console.log('FormData entries:');
    }
    let entryCount = 0;
    for (let [key, value] of fd.entries()) {
      if(!window.DEBUG_FORM_SUBMIT) break;
      if(value instanceof File){ console.log(`${key}: [File name=${value.name} size=${value.size} type=${value.type}]`); }
      else { console.log(`${key}: "${value}"`); }
      entryCount++;
      if (entryCount > 20) { console.log('... (truncating remaining entries)'); break; }
    }
    if(window.DEBUG_FORM_SUBMIT){ console.log('=== END DEBUG ==='); }

    // Verificar se FormData está vazio
    if ([...fd.entries()].length === 0) {
      console.error('ERRO: FormData está vazio! Verificar campos do formulário.');
      alert('Erro: Nenhum dado foi encontrado no formulário. Verifique se os campos estão preenchidos.');
      return;
    }

    // desabilita para evitar duplo clique
    const btn = document.getElementById('btnFinalizar') || document.getElementById('btnProximo');
    if (btn) { btn.disabled = true; btn.dataset._oldTxt = btn.textContent; btn.textContent = 'Salvando...'; }

    // Em edição, preferimos a rota incremental para reduzir chances de validação 500 por campos ausentes
    let submitUrl = formFuncionario.action;
    let method = isEditing ? 'PUT' : 'POST';
    if (isEditing) {
      try {
        const idMatch = formFuncionario.action.match(/funcionarios\/([^/?]+)/);
        const id = idMatch && idMatch[1];
        if (id) submitUrl = `${basePath}/api/funcionarios/${id}/incremental`;
      } catch(_) {}
    }
    const resp = await fetch(submitUrl, {
      method,
      body: fd,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store'
    });

    if (!resp.ok) {
      // Trata erros específicos da API
      if (resp.status === 400) {
        const errorData = await resp.json().catch(() => ({}));
        try { console.error('[FUNCIONARIOS][SUBMIT][400]', errorData); } catch(_){ }
        const campo = errorData.path || errorData.campo;
        const errorMessage = (errorData.error || errorData.message || 'Erro de validação') + (campo ? `\nCampo: ${campo}` : '');
        alert(errorMessage);
        return; // Não redireciona, permanece na página
      }
      // Para 500 (ou outros), tentamos extrair JSON com mensagem amigável
      let bodyText = '';
      let jsonData = null;
      try {
        const ct = resp.headers.get('content-type') || '';
        if (/application\/json/i.test(ct)) jsonData = await resp.json(); else bodyText = await resp.text();
      } catch { /* ignore */ }
      if (jsonData && (jsonData.message || jsonData.error)) {
        const msg = (jsonData.message || jsonData.error) + (jsonData.path ? ` (campo: ${jsonData.path})` : '');
        console.error('[FUNCIONARIOS][SUBMIT][ERRO]', resp.status, jsonData);
        alert(`Erro ao salvar: ${msg}`);
      } else {
        console.error('[FUNCIONARIOS][SUBMIT][ERRO]', resp.status, bodyText);
        alert(`Erro ao salvar (HTTP ${resp.status}). Detalhes no console.`);
      }
      return;
    }

    let data = {};
    try { data = await resp.json(); } catch (_) {}
  if (data && (data.sucesso === false || data.success === false)) throw new Error(data.mensagem || data.message || 'Falha ao salvar.');

  const autoUser = data?.data?.autoUser || null;
  const autoUserMessage = typeof autoUser?.message === 'string' ? autoUser.message.trim() : '';
  const autoUserAlertType = autoUser?.outcome === 'conflict' ? 'warning' : 'success';
  const successMessage = autoUserMessage ? `Dados salvos com sucesso. ${autoUserMessage}` : 'Dados salvos com sucesso.';

  // Sucesso: não redirecionar em edição. Em criação, recarregar lista para exibir novo funcionário.
    localStorage.removeItem('aba3_temp_data');
    try {
      const alertHost = document.getElementById('alertArea');
      if (alertHost) {
        alertHost.innerHTML = `<div class="alert alert-${autoUserAlertType} py-2 mb-2">${successMessage}</div>`;
        setTimeout(()=> { if(alertHost.firstChild) alertHost.firstChild.classList.add('fade','show'); }, 10);
        setTimeout(()=> { alertHost.innerHTML=''; }, 5000);
      } else {
        console.log('[SALVAR] Sucesso (sem alertArea)', successMessage);
      }
      // Atualizar título/botões
      const titulo = document.getElementById('tituloFormFuncionario');
      if (titulo && /Editar/.test(titulo.textContent||'')) {
        // Permanecemos em modo edição
      }
      // Atualizar linha da tabela (se já existe) buscando novamente os dados resumidos
      if (isEditing && formFuncionario.action) {
        const idMatch = formFuncionario.action.match(/funcionarios\/([^/?]+)/);
        const id = idMatch && idMatch[1];
        if (id) {
          try {
            const respRef = await fetch(`${basePath}/api/funcionarios/${id}`, { headers:{'Accept':'application/json'}, cache:'no-store' });
            if(respRef.ok){
              const jsonRef = await respRef.json();
              const fRef = jsonRef.funcionario || jsonRef.data || jsonRef;
              const tr = document.querySelector(`tr[data-func-id="${id}"]`);
              if (tr && fRef) {
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 6) {
                  tds[0].textContent = fRef.nome || '';
                  tds[1].textContent = fRef.cpf || '';
                  tds[2].textContent = (fRef.unidade_id && (fRef.unidade_id.codigo && fRef.unidade_id.nome) ? (fRef.unidade_id.codigo + ' - ' + fRef.unidade_id.nome) : (fRef.unidade_id?.nome || '-')) || '-';
                  tds[3].textContent = (fRef.funcao_id && fRef.funcao_id.nome) ? fRef.funcao_id.nome : (fRef.funcao_nome || '-');
                  tds[4].innerHTML = fRef.ativo ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>';
                }
              }
            }
          } catch (e) { console.warn('[SALVAR] Falha ao atualizar linha:', e); }
        }
      } else if(!isEditing) {
        // Modo criação: recarregar a página para listar o novo funcionário.
        // Evita ter que reimplementar lógica de append parcial com possíveis filtros/paginação.
        setTimeout(()=>{ try { window.location.reload(); } catch{} }, 400);
      }
    } catch (uiErr) { console.warn('[SALVAR] Falha pós-sucesso:', uiErr); }

    // Se estava em modo edição, voltar ao modo criação após atualizar linha
    if(isEditing){
      try { resetToCreateMode(); } catch(rErr){ console.warn('[SALVAR] Falha ao resetar formulário para criação:', rErr); }
    }
  } catch (err) {
    alert('Erro ao salvar: ' + (err?.message || 'Erro desconhecido'));
  } finally {
    const btn = document.getElementById('btnFinalizar') || document.getElementById('btnProximo');
    if (btn) {
      btn.disabled = false;
      // Recalcular modo atual após possíveis resets durante o try
      let nowEditing = false;
      try {
        const f = document.getElementById('formFuncionario');
        if (f) nowEditing = /\?_method=PUT\b/.test(f.action) || (f.querySelector('input[name="_method"]').value||'').toUpperCase()==='PUT';
      } catch(_) {}
      btn.textContent = btn.dataset._oldTxt || (nowEditing ? 'Salvar Alterações' : 'Cadastrar');
    }
    window.__funcSubmitLock = false;
  }
}

// Substituir uso direto de '/' + data.foto posteriormente no arquivo
if (typeof window.buildFotoUrl !== 'function') {
  window.buildFotoUrl = function(caminho) {
    if (!caminho) return '';
    const basePath = (window.__basePath || window.__WD_BASE_PATH || '/gestor').replace(/\/$/, '');
    let clean = String(caminho).trim();
    // remover prefixos duplicados
    clean = clean.replace(/^https?:\/\/[^/]+/,'');
    clean = clean.replace(/^\/+/, '');
    // se iniciar com public/ remover pois assets já servidos a partir da raiz do módulo
    clean = clean.replace(/^public\//,'');
    return basePath + '/' + clean;
  };
}

// ================== UTIL DE TESTE (EDGE CASES DATAS) ==================
// Permite validar rapidamente no console a normalização/validação dos principais cenários.
// Uso: window.__testDatas(['2025-09-03','20250903','03/09/2025','31022025','3/9/2025'])
if(!window.__testDatas){
  window.__testDatas = function(list){
    const resultados = [];
    (list||[]).forEach(v=>{
      const normLoose = tryNormalizeLooseDate(v);
      const valid = isValidBrDate(normLoose);
      resultados.push({input:v, normLoose, valid, iso: valid ? dateBrToISO(normLoose) : ''});
    });
    console.table(resultados);
    return resultados;
  };
}