// Utilitário para gerar cbo_full.json a partir de um CSV oficial da CBO
// Uso: node scripts/gerar_cbo_full.js caminho/para/CBO.csv
// CSV esperado com colunas incluindo codigo;titulo (ou CODIGO;TITULO)
// Delimitador padrão ; (pode ajustar)

const fs = require('fs');
const path = require('path');

function normalizarCodigo(c){
  // Mantém formato nnnn-nn ou nnnn-nn
  return c.replace(/[^0-9-]/g,'');
}

function carregar(csvPath){
  const raw = fs.readFileSync(csvPath,'utf8');
  const linhas = raw.split(/\r?\n/).filter(l=>l.trim());
  const sep = linhas[0].includes(';')? ';':',';
  const headers = linhas[0].split(sep).map(h=>h.trim().toLowerCase());
  const idxCodigo = headers.findIndex(h=> h.includes('codigo') || h==='cbo');
  const idxTitulo = headers.findIndex(h=> h.includes('titulo') || h.includes('ocupacao'));
  if(idxCodigo<0 || idxTitulo<0) throw new Error('Colunas de código e título não encontradas.');
  const dados=[]; const vistos=new Set();
  for(let i=1;i<linhas.length;i++){
    const cols = linhas[i].split(sep).map(c=>c.trim());
    const cod = normalizarCodigo(cols[idxCodigo]);
    const titulo = cols[idxTitulo].replace(/\s+/g,' ').trim();
    if(!cod || !titulo || vistos.has(cod)) continue;
    vistos.add(cod);
    dados.push({codigo:cod,titulo});
  }
  return dados;
}

function main(){
  const csvPath = process.argv[2];
  if(!csvPath){ console.error('Informe caminho do CSV: node scripts/gerar_cbo_full.js CBO.csv'); process.exit(1); }
  const dados = carregar(csvPath);
  dados.sort((a,b)=> a.codigo.localeCompare(b.codigo));
  const outPath = path.join(process.cwd(),'public','data','cbo_full.json');
  fs.writeFileSync(outPath, JSON.stringify(dados,null,2),'utf8');
  console.log('Gerado', outPath, 'Total registros:', dados.length);
}

if(require.main === module){
  try { main(); } catch(e){ console.error('Erro:', e.message); process.exit(1);} }
