/**
 * Gera uma chave única baseada no endereço IP do cliente
 * Suporte completo para IPv4 e IPv6, incluindo mapeamentos IPv4-para-IPv6
 * @param {string} clientIP - Endereço IP do cliente
 * @returns {string} Chave única baseada no IP
 */
export function ipKeyGenerator(clientIP) {
    // Trata casos especiais
    if (!clientIP || clientIP === 'unknown' || clientIP === '::1' || clientIP === '127.0.0.1') {
        // Para desenvolvimento local, usa um identificador genérico
        return 'localhost';
    }

    // Remove o prefixo '::ffff:' de mapeamentos IPv4-para-IPv6
    if (clientIP.startsWith('::ffff:')) {
        clientIP = clientIP.substring(7);
    }

    // Validação básica do formato IP
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^([0-9a-fA-F]{1,4}:){0,6}::([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$/;

    if (!ipv4Regex.test(clientIP) && !ipv6Regex.test(clientIP)) {
        console.warn(`[IP KEY GENERATOR] IP inválido detectado: ${clientIP}`);
        return 'invalid';
    }

    return clientIP;
}