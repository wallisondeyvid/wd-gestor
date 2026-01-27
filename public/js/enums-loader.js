(function(){
  const cache = {};
  async function loadEnum(name){
    if(cache[name]) return cache[name];
    const res = await fetch(`/data/${name}.json`);
    if(!res.ok) throw new Error('Falha ao carregar enum '+name);
    const data = await res.json();
    cache[name] = data;
    return data;
  }
  window.Enums = { load: loadEnum, _cache: cache };
})();
