// public/js/modals/cnae_secundario.js (LEGADO) - use /gestor/js/modals/cnae_secundario.js
if (window && window.wdgFetchGestorJson) { console.warn('[legacy cnae_secundario] ignorado'); } else {
document.addEventListener('DOMContentLoaded', () => {
  const modalEl            = document.getElementById('modalCnaeSecundario');
  if (!modalEl) return;

  const filtroInput        = document.getElementById('filtroCnaeSecundario');
  const listaDiv           = document.getElementById('listaCnaesSecundarios');
  const btnInserir         = document.getElementById('btnInserirCnaeSecundario');
  const btnDesmarcarTodos  = document.getElementById('btnDesmarcarTodosCnaeSecundario');
  const campoDestino       = document.getElementById('cnaeSecundarios');
  const overlay            = document.getElementById('cnae-loading-overlay');

  let listaCnaes = [];
  let baseListaCnaes = [];
  let debounceTimer = null;

  function normaliza(raw){
    const out = [];
    function mapOne(n){
      if(!n) return null;
      const codigo = String(n.codigo ?? n.cod ?? n.code ?? n.CNAE ?? n.cnae ?? '').trim();
      const nomeRaw = (n.nome ?? n.descricao ?? n['descrição'] ?? n.DESCRICAO ?? n.descricao_cnae ?? n.descricaoCnae ?? n.descricaoCNAE ?? n.desc ?? n.text ?? n.title ?? n.titulo ?? n.label);
      const nome = String(nomeRaw || '').trim();
      if(!codigo) return null;
      return { codigo, nome };
    }
    function walk(obj){
      if(!obj) return;
      if(Array.isArray(obj)) obj.forEach(x=>{ const m=mapOne(x); if(m) out.push(m); });
      else if(typeof obj === 'object'){
        if(Array.isArray(obj.cnaes)) walk(obj.cnaes); else Object.values(obj).forEach(walk);
      }
    }
    walk(raw);
    const seen = new Set(), dedup = [];
    for(const it of out){ if(!it) continue; if(seen.has(it.codigo)) continue; seen.add(it.codigo); dedup.push(it); }
    const toNum = c => parseInt(String(c).replace(/\D/g,''),10)||0;
    dedup.sort((a,b)=>toNum(a.codigo)-toNum(b.codigo));
    if(!window.__CNAE_SEC_LOG){ console.debug('[cnae_secundario] total normalizado', dedup.length, 'exemplo', dedup.slice(0,3)); window.__CNAE_SEC_LOG=true; }
    return dedup;
  }

  function renderLista(filtro = '') {
    const filtroLower = filtro.toLowerCase();
    const itens = listaCnaes.filter(c =>
      !filtroLower ||
      c.codigo.toLowerCase().includes(filtroLower) ||
      c.nome.toLowerCase().includes(filtroLower)
    );

    if (!itens.length) {
      listaDiv.innerHTML = `<div class="text-muted small px-2 py-1">Nenhum CNAE encontrado.</div>`;
      return;
    }

    // monta cada item com data-nome para usarmos no textarea (layout label-based)
    listaDiv.querySelector('#listaCnaesSecundariosUL').innerHTML = itens.map(c => {
      const id = `chkCnae_${c.codigo.replace(/[^a-zA-Z0-9]/g,'_')}`;
      const nome = (c.nome || '(sem descrição)').trim();
      return `
        <li class="list-group-item d-grid" style="grid-template-columns:72px 110px 1fr; column-gap:12px; align-items:center; border:0; border-bottom:1px solid var(--bs-gray-200); padding:.5rem .75rem;">
          <div class="text-center">
            <input class="form-check-input" type="checkbox" id="${id}" value="${c.codigo}" data-nome="${nome.replace(/"/g,'&quot;')}">
          </div>
          <div class="text-center" style="white-space:nowrap;">${c.codigo}</div>
          <label class="form-check-label" for="${id}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${nome}">${nome}</label>
        </li>`;
    }).join('');

    // pré-seleciona os que já estão no textarea (pelo código)
    if (campoDestino && campoDestino.value.trim()) {
      const codigosAtuais = campoDestino.value
        .split(',')
        .map(s => s.trim())
        .map(s => s.split(' - ')[0]); // pega só o código quando já vem "cod - nome"
      listaDiv.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        if (codigosAtuais.includes(chk.value)) chk.checked = true;
      });
    }
  }

  async function carregarCnaes() {
    try {
      if (overlay) overlay.style.display = 'flex';
      if (baseListaCnaes.length){
        listaCnaes = baseListaCnaes.slice(0);
        renderLista('');
        return;
      }
      const res = await fetch('/data/CNAES_POR_NATUREZA.json', { cache: 'no-store' });
      const raw = await res.json();
      baseListaCnaes = normaliza(raw);
      listaCnaes = baseListaCnaes.slice(0);
      renderLista('');
    } catch (err) {
      console.error('Erro ao carregar CNAEs:', err);
      listaDiv.innerHTML = `<div class="text-danger small px-2 py-1">Falha ao carregar CNAEs.</div>`;
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  }

  function getNaturezaCodigo(){
    const el = document.getElementById('naturezaJuridica');
    if (!el) return '';
    const v = (el.value || el.textContent || '').trim();
    if (!v) return '';
    const i = v.indexOf(' - ');
    return (i > -1 ? v.slice(0, i) : v).trim();
  }

  async function buscarApiCnaes(search){
    try{
      const natureza = getNaturezaCodigo();
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (natureza) params.set('natureza', natureza);
      params.set('limit', '300');
      const url = `/cnaes?${params.toString()}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const body = await res.json();
      const data = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
      return normaliza(data);
    }catch(err){
      console.warn('[cnae_secundario legacy] busca API falhou:', err.message || err);
      return null;
    }
  }

  if (filtroInput) {
    filtroInput.addEventListener('input', e => {
      const q = (e.target.value || '').trim();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (q.length >= 2){
          const api = await buscarApiCnaes(q);
          if (api && api.length){
            listaCnaes = api;
            renderLista('');
            return;
          }
        }
        listaCnaes = baseListaCnaes.length ? baseListaCnaes.slice(0) : listaCnaes;
        renderLista(q);
      }, 250);
    });
  }

  if (btnInserir) {
    btnInserir.addEventListener('click', () => {
      const selecionados = Array.from(listaDiv.querySelectorAll('input[type="checkbox"]:checked'))
        .map(chk => `${chk.value} - ${chk.dataset.nome}`);   // << código - nome

      if (campoDestino) {
        campoDestino.value = selecionados.join(', ');
        campoDestino.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    });
  }

  if (btnDesmarcarTodos) {
    btnDesmarcarTodos.addEventListener('click', () => {
      listaDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(chk => chk.checked = false);
    });
  }

  // abrir/fechar
  const abrirBtn = document.getElementById('btnPesquisarCnaeSecundario');
  if (abrirBtn) {
    abrirBtn.addEventListener('click', () => {
      const inst = bootstrap.Modal.getOrCreateInstance(modalEl);
      inst.show();
    });
  }
  modalEl.addEventListener('show.bs.modal', carregarCnaes);
});
} // fim guarda legacy