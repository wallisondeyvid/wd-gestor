const fs = require('fs');
const path = require('path');

const filePath = path.resolve('c:/Projeto3/public/escalas/js/escala_nova.js');
const code = fs.readFileSync(filePath, 'utf8');

let i=0, line=1, col=1; const len = code.length;
const stack = []; // items: { ch, line, col }

function advance(){
  const ch = code[i++];
  if(ch === '\n'){ line++; col=1; } else { col++; }
  return ch;
}

function peek(){ return code[i]; }

function skipLineComment(){ while(i < len && code[i] !== '\n') advance(); }
function skipBlockComment(){ advance(); advance(); while(i < len && !(code[i] === '*' && code[i+1] === '/')) advance(); if(i < len){ advance(); advance(); } }
function skipString(){
  const q = peek();
  if(q !== '"' && q !== "'" && q !== '`') return false;
  advance();
  let escaped=false;
  while(i < len){
    const ch = advance();
    if(q === '`' && ch === '$' && peek() === '{'){
      advance(); // '{'
      // skip template expression recursively using braces
      let depth = 1;
      while(i < len && depth > 0){
        if(skipString()) continue;
        const c = peek();
        if(c === '{'){ depth++; advance(); }
        else if(c === '}'){ depth--; advance(); }
        else if(c === '/' && code[i+1] === '/') skipLineComment();
        else if(c === '/' && code[i+1] === '*') skipBlockComment();
        else advance();
      }
      continue;
    }
    if(escaped){ escaped=false; continue; }
    if(ch === '\\'){ escaped=true; continue; }
    if(ch === q){ return true; }
  }
  return true;
}

const problems = [];
while(i < len){
  const ch = peek();
  if(skipString()) continue;
  if(ch === '/' && code[i+1] === '/') { skipLineComment(); continue; }
  if(ch === '/' && code[i+1] === '*') { skipBlockComment(); continue; }
  if(ch === '(' || ch === '{'){ stack.push({ ch, line, col }); advance(); continue; }
  if(ch === ')' || ch === '}'){
    const open = stack.pop();
    const ok = open && ((open.ch === '(' && ch === ')') || (open.ch === '{' && ch === '}'));
    if(!ok){ problems.push({ line, col, msg: `fechamento inesperado '${ch}'` }); advance(); continue; }
    advance(); continue;
  }
  advance();
}

if(stack.length){
  console.log('Aberturas não fechadas (do topo para o início):');
  for(let k=stack.length-1; k>=0; k--){
    const s = stack[k];
    console.log(`- '${s.ch}' aberto em linha ${s.line}, col ${s.col}`);
  }
} else if(problems.length){
  console.log('Fechamentos inesperados:');
  problems.forEach(p=> console.log(`linha ${p.line}, col ${p.col}: ${p.msg}`));
} else {
  console.log('Parênteses/chaves/colchetes balanceados.');
}
