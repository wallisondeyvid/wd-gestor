// src/shared/adapters/bank/bank.adapter.js

import * as serviceBridge from '#services/bank/bankClient.js';

export const BankAdapter = {
  callBankApi: serviceBridge.callBankApi,
  getOAuthTokenFromConfig: serviceBridge.getOAuthTokenFromConfig,
  getOAuthToken: serviceBridge.getOAuthToken,
  createBankClient: serviceBridge.createBankClient,
  bankClient: serviceBridge.bankClient,
  BANK: serviceBridge.BANK,
};

export default BankAdapter;
