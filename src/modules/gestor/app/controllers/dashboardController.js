// (migrado) dashboardController
export async function renderDashboard(req,res){ res.render('dashboard-gestor',{ user:req.user }); }
