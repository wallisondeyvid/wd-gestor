// src/shared/adapters/documentos/documentos.adapter.js

import * as serviceBridge from '#services/documentos.service.js';

export const DocumentosAdapter = {
  obterPorToken: serviceBridge.obterPorToken,
  emitirDocumentoAssinadoExterno: serviceBridge.emitirDocumentoAssinadoExterno,
  substituir: serviceBridge.substituir,
};

export default DocumentosAdapter;
