export const validNumber = x => typeof x === 'number' && Number.isFinite(x);
export function valuation(holdings, quotes) {
  const groups = {};
  for (const type of ['stocks','crypto']) {
    let subtotal=0, priced=0, missing=[];
    for (const h of holdings[type]) {
      const q=quotes[h.symbol];
      if (validNumber(h.quantity) && validNumber(q?.price) && q.price>0) {subtotal+=h.quantity*q.price;priced++;}
      else missing.push(h.symbol);
    }
    groups[type]={subtotal,priced,missing,complete:missing.length===0};
  }
  const subtotal=groups.stocks.subtotal+groups.crypto.subtotal;
  return {...groups,subtotal,complete:groups.stocks.complete&&groups.crypto.complete,priced:groups.stocks.priced+groups.crypto.priced,missing:[...groups.stocks.missing,...groups.crypto.missing],allocation:groups.stocks.complete&&groups.crypto.complete&&subtotal>0?{stocks:groups.stocks.subtotal/subtotal*100,crypto:groups.crypto.subtotal/subtotal*100}:null};
}
export function returns(h, q) {
  if (!validNumber(h.cost) || !validNumber(h.quantity) || !validNumber(q?.price)) return {profit:null,pct:null};
  return {profit:h.quantity*(q.price-h.cost),pct:h.cost>0?(q.price/h.cost-1)*100:null};
}
export function quoteStatus(q, fetchedAt, now=Date.now()/1000) {
  if (!validNumber(q?.price) || !q.timestamp) return 'unavailable';
  if (!fetchedAt || now-fetchedAt>3600) return 'stale snapshot';
  if (['CoinGecko','CoinPaprika'].includes(q.provider)) return now-q.timestamp>1800?'stale':'connected';
  // Friday close remains valid over a weekend; always show its exact timestamp.
  if (now-q.timestamp>4*86400) return 'stale';
  return q.sessionEnd && now>q.sessionEnd?'market closed · delayed':'delayed';
}
export function alertValue(rule,holdings,market) {
  const q=market.quotes[rule.symbol], h=[...holdings.stocks,...holdings.crypto].find(h=>h.symbol===rule.symbol);
  if (!q || !['connected','delayed','market closed · delayed'].includes(quoteStatus(q,market.fetchedAt))) return null;
  if (rule.type==='above'||rule.type==='below') return validNumber(q.price)?q.price:null;
  if (rule.type==='daily') return validNumber(q.dailyPct)?Math.abs(q.dailyPct):null;
  const v=valuation(holdings,market.quotes);
  return v.complete&&v.subtotal>0&&validNumber(h?.quantity)?h.quantity*q.price/v.subtotal*100:null;
}
export function condition(type,value,threshold) {return value!==null&&(type==='below'?value<threshold:value>threshold);}
