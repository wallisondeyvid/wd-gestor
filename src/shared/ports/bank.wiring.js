// src/shared/ports/bank.wiring.js

/**
 * Wiring explícito do BankPort.
 * Conecta o contrato (Port) à implementação (Adapter).
 */

import { BankPort } from '#shared/ports/bank.port.js';
import { BankAdapter } from '#shared/adapters/bank/bank.adapter.js';

Object.assign(BankPort, BankAdapter);
