(function(){
  var modalEl = document.getElementById('modalFotoAreaComum');
  if(!modalEl) return;
  var img = document.getElementById('fotoAreaComumZoom');
  var scale = 1;
  function apply(){ if(img) img.style.transform='scale('+scale+')'; }
  modalEl.addEventListener('click', function(ev){ var btn = ev.target.closest('[data-zoom]'); if(!btn) return; var act = btn.getAttribute('data-zoom'); if(act==='in'){ scale = Math.min(scale+0.25, 6); } else if(act==='out'){ scale = Math.max(scale-0.25, 0.25); } else if(act==='reset'){ scale=1; } apply(); });
})();
