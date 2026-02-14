// Script simples para validar que o controller importa sem SyntaxError.
// Uso: node scripts/test-import-funcionario-controller.js
(async()=>{
  try {
    console.time('importController');
    const mod = await import('#modules/gestor/app/controllers/funcionarioApiController.js');
    console.timeEnd('importController');
    const fns = Object.keys(mod).filter(k=>typeof mod[k]==='function');
    console.log('[TEST] Funções exportadas:', fns);
    if(!fns.includes('createFuncionario')){
      console.warn('[TEST] createFuncionario não encontrado!');
      process.exitCode = 2;
    } else {
      console.log('[TEST] OK - createFuncionario presente.');
    }
  } catch(err){
    console.error('[TEST][FAIL] Erro ao importar controller:', err);
    process.exitCode = 1;
  }
})();
