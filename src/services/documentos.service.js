import * as legacyNS from '#legacy-services/documentos.service.js';

const legacyDefault = legacyNS.default;

export const obterPorToken = legacyNS.obterPorToken ?? legacyDefault?.obterPorToken;
export const emitirDocumentoAssinadoExterno = legacyNS.emitirDocumentoAssinadoExterno ?? legacyDefault?.emitirDocumentoAssinadoExterno;
export const substituir = legacyNS.substituir ?? legacyDefault?.substituir;

export default legacyDefault ?? legacyNS.default;
