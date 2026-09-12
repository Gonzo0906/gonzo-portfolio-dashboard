export const PORTFOLIO_KEY='gonzo.friends.portfolio.v1';
export const emptyPortfolio=()=>({stocks:[],crypto:[],metadata:{}});
export function validatePortfolio(raw){
 if(!raw||!Array.isArray(raw.stocks)||!Array.isArray(raw.crypto)||raw.stocks.length>30||raw.crypto.length>20)throw Error('Use up to 30 stocks and 20 coins.');
 const next=emptyPortfolio(),symbols=new Set();
 for(const type of ['stocks','crypto'])for(const h of raw[type]){
  if(!h||typeof h.symbol!=='string'||!/^[A-Za-z0-9][A-Za-z0-9.^=-]{0,15}$/.test(h.symbol)||symbols.has(h.symbol.toUpperCase())||!Number.isFinite(h.quantity)||h.quantity<0)throw Error('Invalid or duplicate holding.');
  symbols.add(h.symbol.toUpperCase());
  if(type==='stocks'){if(h.cost!==null&&(!Number.isFinite(h.cost)||h.cost<0))throw Error('Invalid average cost.');next.stocks.push({symbol:h.symbol.toUpperCase(),quantity:h.quantity,cost:h.cost});}
  else{if(typeof h.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(h.id))throw Error('Invalid crypto identity.');next.crypto.push({symbol:h.symbol.toUpperCase(),quantity:h.quantity,id:h.id,name:typeof h.name==='string'?h.name.slice(0,100):h.symbol,cost:null});}
 }
 if(next.crypto.some(h=>h.symbol==='PI')){const available=raw.metadata?.PI?.available??0,total=next.crypto.find(h=>h.symbol==='PI').quantity;if(!Number.isFinite(available)||available<0||available>total)throw Error('Available PI cannot exceed total PI.');next.metadata.PI={available};}
 return next;
}
export function priceQuery(holdings){const params=new URLSearchParams();params.set('stocks',holdings.stocks.map(h=>h.symbol).sort().join(','));params.set('crypto',holdings.crypto.map(h=>h.symbol+':'+h.id).sort().join(','));return params;}
