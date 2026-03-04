const documentosWiringSpecifier = './wiring/' + 'documentos.wiring.js';
const { bindDocumentosPort } = await import(documentosWiringSpecifier);

export { bindDocumentosPort };