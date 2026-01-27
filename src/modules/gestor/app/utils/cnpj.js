// (migrado) util CNPJ
export function formatarCnpj(cnpj=''){ try { const dig=String(cnpj).replace(/\D/g,''); if(dig.length!==14) return cnpj||''; return dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); } catch { return cnpj||''; } }
export function calcularDigitoVerificador(cnpjParcial, pesos){ let soma=0; for(let i=0;i<cnpjParcial.length;i++){ soma += parseInt(cnpjParcial[i],10)*pesos[i]; } const resto=soma%11; return resto<2?0:11-resto; }
export function validarCnpj(cnpj){ const cleaned=String(cnpj||'').replace(/\D/g,''); if(cleaned.length!==14) return false; if(/^(\d)\1{13}$/.test(cleaned)) return false; const base=cleaned.slice(0,12); const dv1=calcularDigitoVerificador(base,[5,4,3,2,9,8,7,6,5,4,3,2]); const dv2=calcularDigitoVerificador(base+dv1,[6,5,4,3,2,9,8,7,6,5,4,3,2]); return cleaned.endsWith(String(dv1)+String(dv2)); }
export default { formatarCnpj, calcularDigitoVerificador, validarCnpj };
