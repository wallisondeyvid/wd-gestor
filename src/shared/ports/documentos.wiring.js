// src/shared/ports/documentos.wiring.js

/**
 * Wiring explícito do DocumentosPort.
 * Wrapper fino de compatibilidade; binding real ocorre no container.
 */

import { DocumentosPort } from '#shared/ports/documentos.port.js';
import { getPorts } from '#shared/container/ports.js';

export function bindDocumentosPort() {
	Object.assign(DocumentosPort, getPorts().documentos);
	return DocumentosPort;
}
