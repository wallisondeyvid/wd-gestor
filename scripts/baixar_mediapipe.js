const https = require('https');
const fs = require('fs');
const path = require('path');

const files = [
  {
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_wasm_nosimd_internal.js',
    filename: 'vision_wasm_nosimd_internal.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_wasm_nosimd_internal.wasm',
    filename: 'vision_wasm_nosimd_internal.wasm'
  }
];

const targetDir = path.join(__dirname, '../public/js/mediapipe');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

files.forEach(file => {
  const filePath = path.join(targetDir, file.filename);
  const fileStream = fs.createWriteStream(filePath);
  https.get(file.url, response => {
    if (response.statusCode !== 200) {
      console.error(`Erro ao baixar ${file.url}: ${response.statusCode}`);
      return;
    }
    response.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      console.log(`Baixado: ${file.filename}`);
    });
  }).on('error', err => {
    fs.unlink(filePath, () => {});
    console.error(`Erro ao baixar ${file.url}: ${err.message}`);
  });
});
