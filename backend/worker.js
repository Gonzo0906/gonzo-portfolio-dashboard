import holdings from '../public/holdings.json' with {type:'json'};

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const origin='https://gonzo0906.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Content-Type':'application/json','Cache-Control':'no-store'};
async function json(url,extra={}){
 const r=await fetch(url,{headers:{'User-Agent':'GonzoPortfolioDashboard/1.0',...extra},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Provider HTTP '+r.status);
 return r.json();
}
export async function fetchStock(symbol){
 try{
  const d=await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`);
  const chart=d.chart.result[0],m=chart.meta;
  if(m.symbol!==symbol||m.currency!=='USD'||!finite(m.regularMarketPrice)||m.regularMarketPrice<=0||!m.regularMarketTime)throw Error('Invalid symbol, currency, price or timestamp');
  const prior=chart.timestamp.map((t,i)=>({t,c:chart.indicators.quote[0].close[i]})).filter(x=>finite(x.c)&&new Date(x.t*1000).toISOString().slice(0,10)<new Date(m.regularMarketTime*1000).toISOString().slice(0,10));
  const previous=m.previousClose??prior.at(-1)?.c;
  return [symbol,{price:m.regularMarketPrice,dailyPct:previous>0?(m.regularMarketPrice/previous-1)*100:null,timestamp:m.regularMarketTime,provider:'Yahoo Finance public chart',providerId:m.symbol,name:m.longName||m.shortName,status:'delayed',sessionEnd:m.currentTradingPeriod?.regular?.end,previousClose:previous??null}];
 }catch(e){return [symbol,{price:null,dailyPct:null,timestamp:null,provider:'Yahoo Finance public chart',providerId:symbol,status:'unavailable',error:e.message}];}
}
export async function fetchQuotes(env={}){
 const started=Date.now()/1000,stocks=holdings.stocks.map(r=>r[0]),quotes={};
 // Bound concurrent requests below the provider/Worker subrequest limits.
 for(let i=0;i<stocks.length;i+=6)Object.assign(quotes,Object.fromEntries(await Promise.all(stocks.slice(i,i+6).map(fetchStock))));
 const crypto=holdings.crypto,ids=crypto.map(r=>r[2]).join(',');
 try{
  const extra=env.COINGECKO_DEMO_API_KEY?{'x-cg-demo-api-key':env.COINGECKO_DEMO_API_KEY}:{};
  const prices=await json(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,extra);
  for(const [symbol,_,id] of crypto){const q=prices[id];const ok=finite(q?.usd)&&q.usd>0&&q.last_updated_at;quotes[symbol]={price:ok?q.usd:null,dailyPct:ok?q.usd_24h_change??null:null,timestamp:ok?q.last_updated_at:null,provider:'CoinGecko',providerId:id,status:ok?'connected':'unavailable'};}
 }catch(e){for(const [symbol,_,id] of crypto)quotes[symbol]={price:null,dailyPct:null,timestamp:null,provider:'CoinGecko',providerId:id,status:'unavailable',error:e.message};}

 const paprikaIds={JitoSOL:'jitosol-jito-staked-sol',SOL:'sol-solana',BTC:'btc-bitcoin',DOGE:'doge-dogecoin',XRP:'xrp-xrp',SHIB:'shib-shiba-inu',ADA:'ada-cardano',HBAR:'hbar-hedera-hashgraph',FLR:'flr-flare-network',ZBCN:'zbcn-zebec-network',WLFI:'wlfi-official-world-liberty-financial',TRUMP:'trump-official-trump',PEPE:'pepe-pepe',PI:'pi2-pi-network',ETH:'eth-ethereum'};
 // One public aggregate request covers rate-limited or missing crypto quotes.
 if(crypto.some(([symbol])=>quotes[symbol]?.price===null)){
  try{
   const tickers=await json('https://api.coinpaprika.com/v1/tickers');
   const byId=new Map(tickers.map(q=>[q.id,q]));
   for(const [symbol] of crypto){
    if(quotes[symbol]?.price!==null)continue;
    const id=paprikaIds[symbol],q=byId.get(id),usd=q?.quotes?.USD,timestamp=Date.parse(q?.last_updated)/1000;
    if(q?.symbol?.trim().toUpperCase()!==symbol.toUpperCase()||!finite(usd?.price)||usd.price<=0||!finite(timestamp))continue;
    quotes[symbol]={price:usd.price,dailyPct:finite(usd.percent_change_24h)?usd.percent_change_24h:null,timestamp,provider:'CoinPaprika',providerId:id,name:q.name,status:'connected'};
   }
  }catch(e){for(const [symbol] of crypto)if(quotes[symbol]?.price===null)quotes[symbol].error+='; CoinPaprika fallback: '+e.message;}
 }
 return {schema:1,fetchedAt:Date.now()/1000,startedAt:started,refreshSeconds:120,quotes,issues:Object.entries(quotes).filter(([_,q])=>q.price===null).map(([s,q])=>s+': '+(q.error||'Unavailable'))};
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers});
  if(url.pathname!=='/prices')return new Response(JSON.stringify({service:'Gonzo two-minute price feed',endpoint:'/prices'}),{headers});
  const key=new Request(url.origin+'/prices?feedVersion=3');
  const cached=await caches.default.match(key);
  if(cached){const d=await cached.json();if(Date.now()/1000-d.fetchedAt<115)return new Response(JSON.stringify(d),{headers});}
  const data=await fetchQuotes(env);
  const body=JSON.stringify(data);
  // Cache only briefly. Fetch while open; no claims of background alerts.
  if(Object.values(data.quotes).some(q=>q.price!==null))ctx.waitUntil(caches.default.put(key,new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=115'}})));
  return new Response(body,{headers});
 }
};
