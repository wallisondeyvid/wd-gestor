import { Router } from 'express';

const router = Router();

function requireEscalasAuth(req,res,next){
  if(!req.session?.escalasUser) return res.status(401).send('Não autenticado');
  next();
}

// GET /popup/grupo-turnos (query params: id, turnos JSON)
router.get('/popup/grupo-turnos', requireEscalasAuth, (req,res)=>{
  let initData={ edit:false, id:null, turnos:[] };
  try {
    if(req.query.id) initData.id = req.query.id;
    if(req.query.turnos){
      let raw = req.query.turnos;
      try { raw = decodeURIComponent(raw); } catch(_) {}
      const arr = JSON.parse(raw);
      if(Array.isArray(arr)) initData.turnos = arr.filter(t=> t && t.ini && t.fim).map(t=>({ ini:t.ini, fim:t.fim, overnight: !!t.overnight }));
      if(initData.id) initData.edit = true;
    }
  } catch { /* ignore parse errors */ }
  res.render('modais_popups/popup_grupo_turnos', { initData, edit:initData.edit });
});

export default router;