import { BankAdapter } from '#shared/adapters/bank/bank.adapter.js';
import { DocumentosAdapter } from '#shared/adapters/documentos/documentos.adapter.js';

function freezeDeep(obj) {
  if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;

  Object.freeze(obj);

  for (const value of Object.values(obj)) {
    if (!value || typeof value !== 'object') continue;
    if (value === BankAdapter || value === DocumentosAdapter) continue;
    if (!Object.isFrozen(value)) freezeDeep(value);
  }

  return obj;
}

function missingPortMethod(name) {
  return async function missingPortMethodImpl() {
    throw new Error(`Port method não implementado: ${name}`);
  };
}

export function buildPorts() {
  const bank = {
    ...BankAdapter,
    callBankApi: BankAdapter.callBankApi ?? missingPortMethod('BankPort.callBankApi'),
    getOAuthTokenFromConfig: BankAdapter.getOAuthTokenFromConfig ?? missingPortMethod('BankPort.getOAuthTokenFromConfig'),
    getOAuthToken: BankAdapter.getOAuthToken ?? missingPortMethod('BankPort.getOAuthToken'),
    createBankClient: BankAdapter.createBankClient ?? missingPortMethod('BankPort.createBankClient'),
  };

  const documentos = {
    ...DocumentosAdapter,
    obterPorToken: DocumentosAdapter.obterPorToken ?? missingPortMethod('DocumentosPort.obterPorToken'),
    emitirDocumentoAssinadoExterno: DocumentosAdapter.emitirDocumentoAssinadoExterno ?? missingPortMethod('DocumentosPort.emitirDocumentoAssinadoExterno'),
    substituir: DocumentosAdapter.substituir ?? missingPortMethod('DocumentosPort.substituir'),
  };

  return freezeDeep({
    bank,
    documentos,
  });
}

let cachedPorts = null;

export function getPorts() {
  if (cachedPorts) return cachedPorts;
  const built = buildPorts();
  cachedPorts = built;
  return cachedPorts;
}
