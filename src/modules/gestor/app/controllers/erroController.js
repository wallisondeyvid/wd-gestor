// (migrado) erroController
export async function renderErro(req, res){ const message=req.query.message||'Ocorreu um erro desconhecido.'; res.render('erro',{ errorMessage: decodeURIComponent(message) }); }
