// src/shared/ports/bank.port.js

/**
 * Contrato formal do serviço de integração bancária.
 * Nenhum módulo deve importar adapters diretamente.
 * Sempre depender deste port.
 */

export const BankPort = {
  callBankApi: null,
  getOAuthTokenFromConfig: null,
  getOAuthToken: null,
  createBankClient: null,
  bankClient: null,
  BANK: null,
};
