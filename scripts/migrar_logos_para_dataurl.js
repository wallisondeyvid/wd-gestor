import Unidade from '#models/unidade.js';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { connectMongo } from '../src/core/db/connect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function _processarLogoParaDataUrl(buffer){
  const out = await sharp(buffer)
    .resize(600, 600, { fit: 'cover', position: 'center', withoutEnlargement: true })
    .toFormat('webp', { quality: 90 })
    .toBuffer();
  const b64 = out.toString('base64');
  return `data:image/webp;base64,${b64}`;
}

async function migrarLogos() {
  try {
    console.log('Conectando ao banco...');
    await connectMongo();

    console.log('Iniciando migração de logos para Data URLs...');

    const unidades = await Unidade.find({ logo: { $exists: true, $ne: null, $not: /^data:/ } });

    console.log(`Encontradas ${unidades.length} unidades com logos para migrar.`);

    for (const unidade of unidades) {
      try {
        const logoPath = unidade.logo;

        // Tentar caminhos possíveis
        let fullPath = null;
        const possiblePaths = [
          path.join(__dirname, '../../../public/uploads', logoPath),
          path.join(__dirname, '../../../public/uploads/unidades', logoPath),
          path.join(__dirname, '../../../public', logoPath),
          path.join(__dirname, '../../../', logoPath)
        ];

        for (const p of possiblePaths) {
          try {
            await fs.access(p);
            fullPath = p;
            break;
          } catch {}
        }

        if (!fullPath) {
          console.warn(`Arquivo não encontrado para unidade ${unidade._id}: ${logoPath}`);
          continue;
        }

        console.log(`Processando unidade ${unidade._id}: ${fullPath}`);

        const buffer = await fs.readFile(fullPath);
        const dataUrl = await _processarLogoParaDataUrl(buffer);

        unidade.logo = dataUrl;
        await unidade.save();

        console.log(`Migrado unidade ${unidade._id}`);

      } catch (err) {
        console.error(`Erro ao migrar unidade ${unidade._id}:`, err.message);
      }
    }

    console.log('Migração concluída.');

  } catch (error) {
    console.error('Erro na migração:', error);
  }
}

migrarLogos();