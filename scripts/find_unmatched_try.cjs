const fs = require('fs');
const path = require('path');

const filePath = path.resolve('c:/Projeto3/public/escalas/js/escala_nova.js');
const code = fs.readFileSync(filePath, 'utf8');

function isIdentifierChar(ch){
  return /[A-Za-z0-9_$]/.test(ch);
}

function scan(code){
  const res = [];
  const len = code.length;
  let i = 0;
  let line = 1, col = 1;

  function advance(n=1){
    for(let k=0;k<n;k++){
      const ch = code[i++];
      if(ch === '\n'){ line++; col = 1; } else { col++; }
    }
  }

  function skipWhitespace(){
    while(i < len){
      const ch = code[i];
      if(ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n'){ advance(); continue; }
      // line comment
      if(ch === '/' && code[i+1] === '/'){ while(i < len && code[i] !== '\n') advance(); continue; }
      // block comment
      if(ch === '/' && code[i+1] === '*'){ advance(2); while(i < len && !(code[i] === '*' && code[i+1] === '/')) advance(); advance(2); continue; }
      break;
    }
  }

  function skipString(){
    const quote = code[i];
    if(quote !== '"' && quote !== "'" && quote !== '`') return false;
    let q = quote; advance();
    let escaped = false;
    while(i < len){
      const ch = code[i];
      advance();
      if(q === '`' && ch === '$' && code[i] === '{'){ // template expr
        // skip until matching }
        advance(); // skip '{'
        let depth = 1;
        while(i < len && depth > 0){
          if(!skipString()){
            const c = code[i];
            if(c === '{'){ depth++; advance(); }
            else if(c === '}'){ depth--; advance(); }
            else if(c === '/' && code[i+1] === '/'){ while(i < len && code[i] !== '\n') advance(); }
            else if(c === '/' && code[i+1] === '*'){ advance(2); while(i < len && !(code[i] === '*' && code[i+1] === '/')) advance(); advance(2); }
            else { advance(); }
          }
        }
        continue; // continue within template
      }
      if(escaped){ escaped = false; continue; }
      if(ch === '\\'){ escaped = true; continue; }
      if(ch === q){ return true; }
    }
    return true;
  }

  function matchKeyword(kw){
    skipWhitespace();
    const start = i;
    for(let k=0;k<kw.length;k++){
      if(code[i+k] !== kw[k]) return false;
    }
    const before = code[start-1];
    const after = code[start+kw.length];
    if(before && isIdentifierChar(before)) return false;
    if(after && isIdentifierChar(after)) return false;
    i += kw.length;
    col += kw.length;
    return true;
  }

  function skipBalancedBraces(){
    skipWhitespace();
    if(code[i] !== '{') return null;
    let startLine = line, startCol = col;
    advance(); // skip '{'
    let depth = 1;
    while(i < len && depth > 0){
      if(skipString()) continue;
      const ch = code[i];
      if(ch === '{'){ depth++; advance(); continue; }
      if(ch === '}'){ depth--; advance(); continue; }
      if(ch === '/' && code[i+1] === '/'){ while(i < len && code[i] !== '\n') advance(); continue; }
      if(ch === '/' && code[i+1] === '*'){ advance(2); while(i < len && !(code[i] === '*' && code[i+1] === '/')) advance(); advance(2); continue; }
      advance();
    }
    return { endLine: line, endCol: col };
  }

  while(i < len){
    if(skipString()) continue;
    if(matchKeyword('try')){
      skipWhitespace();
      const blk = skipBalancedBraces();
      if(!blk){
        res.push({ line, col, reason: 'try sem bloco { }' });
        continue;
      }
      // after block, expect catch or finally
      const saveI = i, saveLine = line, saveCol = col;
      skipWhitespace();
      if(matchKeyword('catch') || matchKeyword('finally')){
        // ok: attempt to skip optional catch(param) and its block or finally block
        // Peek backward 5 chars from current index to see if last match was 'catch'
        const lastFive = code.slice(i-5, i);
        const matchedCatch = lastFive === 'catch';
        if(matchedCatch){
          // optional ( ... )
          skipWhitespace();
          if(code[i] === '('){
            advance();
            let depth = 1;
            while(i < len && depth > 0){
              if(skipString()) continue;
              const ch2 = code[i];
              if(ch2 === '('){ depth++; advance(); }
              else if(ch2 === ')'){ depth--; advance(); }
              else { advance(); }
            }
          }
          // then catch block
          skipBalancedBraces();
        } else {
          // finally block
          skipBalancedBraces();
        }
      } else {
        res.push({ line: saveLine, col: saveCol, reason: "faltando 'catch' ou 'finally' após try" });
      }
      continue;
    }
    // advance safely
    advance();
  }
  return res;
}

const problems = scan(code);
if(!problems.length){
  console.log('Nenhum try inválido encontrado.');
} else {
  console.log('Trys problemáticos:');
  problems.forEach(p=> console.log(`linha ${p.line}, col ${p.col}: ${p.reason}`));
}
