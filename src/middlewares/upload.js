import fs from 'fs';
import path from 'path';
import multer from 'multer';

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

// Configuração para formulários de funcionários (aceita múltiplos tipos de arquivo)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.cwd(), 'tmp', 'uploads');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

// Middleware para formulários de funcionários (aceita imagens e documentos)
export const uploadFuncionario = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Aceita imagens e documentos comuns
    const tiposPermitidos = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)|application\/(pdf|msword|vnd\.openxmlformats|vnd\.ms-excel|vnd\.openxmlformats\.officedocument)/;
    const ok = tiposPermitidos.test(file.mimetype);
    cb(ok ? null : new Error(`Tipo de arquivo inválido: ${file.mimetype}`), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB por arquivo
});

// Middleware para nenhum arquivo (apenas campos do formulário)
export const uploadNone = multer().none();

// Middleware original mantido para compatibilidade
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), 'tmp', 'uploads');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
  }),
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/.test(file.mimetype);
    cb(ok ? null : new Error('Tipo de arquivo inválido'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

export default upload;
