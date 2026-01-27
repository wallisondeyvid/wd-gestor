const fs = require('fs');
const content = fs.readFileSync('public/escalas/js/escala_nova.js', 'utf8');
const tokens = [];
const regex = /\b(try|catch|finally)\b/g;
let match;
while ((match = regex.exec(content)) !== null) {
  tokens.push({ token: match[1], index: match.index, line: content.substring(0, match.index).split('\n').length });
}
console.log('Tokens:', tokens.slice(0, 50)); // first 50
let stack = [];
for(const t of tokens) {
  if(t.token === 'try') {
    stack.push(t);
  } else if(t.token === 'catch' || t.token === 'finally') {
    if(stack.length > 0) {
      stack.pop();
    } else {
      console.log('Unmatched', t.token, 'at line', t.line);
    }
  }
}
console.log('Unmatched try at end:', stack);