// Divide cbo_full.json em múltiplos chunks e atualiza manifest
// Uso: node scripts/split_cbo_chunks.js [tamanhoChunk(default=500)]
const fs=require('fs');
const path=require('path');

function main(){
  const dataDir=path.join(process.cwd(),'public','data');
  const fullPath=path.join(dataDir,'cbo_full.json');
  if(!fs.existsSync(fullPath)){
    console.error('Arquivo cbo_full.json não encontrado. Gere antes com gerar_cbo_full.js');
    process.exit(1);
  }
  const arr=JSON.parse(fs.readFileSync(fullPath,'utf8'));
  if(!Array.isArray(arr) || !arr.length){
    console.error('cbo_full.json vazio.');
    process.exit(1);
  }
  const tamanho=parseInt(process.argv[2]||'500',10);
  const chunks=[];
  for(let i=0;i<arr.length;i+=tamanho){
    const parte=arr.slice(i,i+tamanho);
    const idx=(chunks.length+1);
    const file=`cbo_chunk_${idx}.json`;
    fs.writeFileSync(path.join(dataDir,file), JSON.stringify(parte),'utf8');
    chunks.push({file, count: parte.length});
  }
  const manifest={version:1,total:arr.length,chunks,generatedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(dataDir,'cbo_manifest.json'), JSON.stringify(manifest,null,2),'utf8');
  console.log('Manifest e', chunks.length,'chunks gerados. Total:', arr.length);
}

if(require.main===module){ main(); }
