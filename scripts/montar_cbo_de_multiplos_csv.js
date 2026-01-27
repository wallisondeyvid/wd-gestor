// Consolida múltiplos arquivos CSV oficiais da CBO em cbo_full.json + chunks
// Usa o arquivo de Ocupacoes como base. Outros arquivos podem ser usados depois para enriquecer (sinônimos, hierarquia)
// Uso: node scripts/montar_cbo_de_multiplos_csv.js [tamanhoChunk=500]

const fs=require('fs');
const path=require('path');

function lerCSV(file){
  // Tenta utf8; se houver muitos caracteres de substituição (�) recarrega como latin1
  let rawUtf8=fs.readFileSync(file,'utf8');
  const replacementCount=(rawUtf8.match(/�/g)||[]).length;
  if(replacementCount>10){ // heurística
    const rawLatin=fs.readFileSync(file,'latin1');
    rawUtf8=rawLatin; // latin1 -> unicode direto (mapeamento 1:1)
  }
  const texto=rawUtf8.replace(/^\uFEFF/, '');
  const linhas=texto.split(/\r?\n/).filter(l=>l.trim());
  if(!linhas.length) return [];
  const sep=';';
  const header=linhas[0].split(sep).map(h=>h.trim().toLowerCase());
  return linhas.slice(1).map(l=>{
    const cols=l.split(sep).map(c=>c.trim());
    const obj={};
    header.forEach((h,i)=> obj[h]=cols[i]);
    return obj;
  });
}

function normalizarTitulo(t){
  if(!t) return t;
  return t.replace(/\s+/g,' ').trim();
}

function main(){
  const dataDir=path.join(process.cwd(),'public','data');
  const ocupPath=path.join(dataDir,'CBO2002 - Ocupacao.csv');
  if(!fs.existsSync(ocupPath)){
    console.error('Arquivo Ocupacao não encontrado em public/data');
    process.exit(1);
  }
  const ocup=lerCSV(ocupPath);
  const lista=[]; const vistos=new Set();
  for(const o of ocup){
    const cod=(o.codigo||o.cod||'').trim();
    const titulo=normalizarTitulo(o.titulo||o.nome||'');
    if(!cod || !titulo || vistos.has(cod)) continue;
    vistos.add(cod);
    // Formata código: 6 dígitos vira nnnn-nn
    const codFmt = cod.length===6? cod.slice(0,4)+'-'+cod.slice(4): cod;
    lista.push({codigo:codFmt, titulo});
  }
  lista.sort((a,b)=> a.codigo.localeCompare(b.codigo));
  const fullOut=path.join(dataDir,'cbo_full.json');
  fs.writeFileSync(fullOut, JSON.stringify(lista,null,2));
  console.log('Gerado cbo_full.json total:', lista.length);
  // Gera chunks
  const tamanho=parseInt(process.argv[2]||'500',10);
  const chunks=[];
  for(let i=0;i<lista.length;i+=tamanho){
    const parte=lista.slice(i,i+tamanho);
    const idx=(chunks.length+1);
    const file=`cbo_chunk_${idx}.json`;
    fs.writeFileSync(path.join(dataDir,file), JSON.stringify(parte));
    chunks.push({file, count:parte.length});
  }
  const manifest={version:1,total:lista.length,chunks,generatedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(dataDir,'cbo_manifest.json'), JSON.stringify(manifest,null,2));
  console.log('Manifest e', chunks.length,'chunks gerados.');
}

if(require.main===module){ main(); }
