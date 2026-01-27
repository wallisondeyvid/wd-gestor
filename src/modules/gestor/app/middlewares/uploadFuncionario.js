import multer from 'multer';

const storage = multer.memoryStorage();

const allowedMime = new Set([
	'image/jpeg','image/pjpeg','image/png','image/webp','image/gif','image/bmp',
	'application/pdf',
	'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'text/plain'
]);

function fileFilter(req, file, cb){
	// Foto pode ser só imagem; anexos podem ser da lista
	if(file.fieldname === 'foto'){
		if(!file.mimetype.startsWith('image/')) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
		return cb(null, true);
	}
	if(file.fieldname === 'anexos'){
		if(!allowedMime.has(file.mimetype)) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
		return cb(null, true);
	}
	return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
}

const upload = multer({ storage, fileFilter, limits:{ fileSize: 15 * 1024 * 1024, files: 15 } });

// Campos suportados: foto (single) + anexos (multi)
export const uploadFuncionario = upload.fields([
	{ name: 'foto', maxCount: 1 },
	{ name: 'anexos', maxCount: 10 }
]);

export default uploadFuncionario;
