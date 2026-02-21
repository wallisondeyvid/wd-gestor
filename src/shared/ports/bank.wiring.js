// src/shared/ports/bank.wiring.js

/**
 * Wiring explícito do BankPort.
 * Wrapper fino de compatibilidade; binding real ocorre no container.
 */

import { BankPort } from '#shared/ports/bank.port.js';
import { getPorts } from '#shared/container/ports.js';

export function bindBankPort() {
	Object.assign(BankPort, getPorts().bank);
	return BankPort;
}
