// Teste para verificar se os erros de ReferenceError foram resolvidos
console.log('Testando funções após correção de hoisting...');

// Verificar se as funções estão definidas
try {
  if (typeof fetchAndPopulateUnidades === 'function') {
    console.log('✓ fetchAndPopulateUnidades está definida');
  } else {
    console.error('✗ fetchAndPopulateUnidades não está definida');
  }
} catch (e) {
  console.error('✗ Erro ao verificar fetchAndPopulateUnidades:', e.message);
}

try {
  if (typeof detectTipoEarly === 'function') {
    console.log('✓ detectTipoEarly está definida');
  } else {
    console.error('✗ detectTipoEarly não está definida');
  }
} catch (e) {
  console.error('✗ Erro ao verificar detectTipoEarly:', e.message);
}

try {
  if (typeof normalizeId === 'function') {
    console.log('✓ normalizeId está definida');
  } else {
    console.error('✗ normalizeId não está definida');
  }
} catch (e) {
  console.error('✗ Erro ao verificar normalizeId:', e.message);
}

console.log('Teste concluído.');