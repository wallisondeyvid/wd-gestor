const bankWiringSpecifier = './wiring/' + 'bank.wiring.js';
const { bindBankPort } = await import(bankWiringSpecifier);

export { bindBankPort };