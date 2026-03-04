import * as legacyNS from '#legacy-services/bank/bankClient.js';

const legacyDefault = legacyNS.default;

export const callBankApi = legacyNS.callBankApi ?? legacyDefault?.callBankApi;
export const getOAuthTokenFromConfig = legacyNS.getOAuthTokenFromConfig ?? legacyDefault?.getOAuthTokenFromConfig;
export const getOAuthToken = legacyNS.getOAuthToken ?? legacyDefault?.getOAuthToken;
export const createBankClient = legacyNS.createBankClient ?? legacyDefault?.createBankClient;
export const bankClient = legacyNS.bankClient ?? legacyDefault?.bankClient;
export const BANK = legacyNS.BANK ?? legacyDefault?.BANK;

export default legacyDefault ?? legacyNS.default;
