import express from 'express';
const router = express.Router();

// Esta rota serve apenas o fragmento do modal se for necessária em outras telas via include dinâmico
router.get('/modais/notas', (req, res)=>{
  try {
    res.render('escalas/modais_popups/notas');
  } catch (e) {
    res.status(500).send('Erro ao renderizar modal de notas');
  }
});

export default router;
