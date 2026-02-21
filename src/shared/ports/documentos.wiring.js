// src/shared/ports/documentos.wiring.js

/**
 * Wiring explícito do DocumentosPort.
 * Conecta o contrato (Port) à implementação (Adapter).
 * Importar este arquivo SOMENTE no bootstrap/composition root.
 */

import { DocumentosPort } from '#shared/ports/documentos.port.js';
import { DocumentosAdapter } from '#shared/adapters/documentos/documentos.adapter.js';

Object.assign(DocumentosPort, DocumentosAdapter);
