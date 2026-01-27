// Script Node.js para gerar arquivos completos de municípios do Brasil
// Gera municipios_ibge.json e municipios_por_uf.json

const https = require('https');
const fs = require('fs');

const url = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const municipios = JSON.parse(data);
    // municipios_ibge.json
    const municipiosIbge = municipios.map(m => ({
      codigo: m.id.toString(),
      nome: m.nome,
      uf: m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || m.microrregiao?.mesorregiao?.UF?.sigla || ''
    }));
    fs.writeFileSync('public/data/municipios_ibge.json', JSON.stringify(municipiosIbge, null, 2));
    // municipios_por_uf.json
    const municipiosPorUf = {};
    municipiosIbge.forEach(m => {
      if (!municipiosPorUf[m.uf]) municipiosPorUf[m.uf] = [];
      municipiosPorUf[m.uf].push(m.nome);
    });
    fs.writeFileSync('public/data/municipios_por_uf.json', JSON.stringify(municipiosPorUf, null, 2));
    console.log('Arquivos gerados com sucesso!');
  });
}).on('error', err => {
  console.error('Erro ao baixar dados do IBGE:', err);
});
