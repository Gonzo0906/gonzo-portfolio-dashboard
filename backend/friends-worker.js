const finite=n=>typeof n==='number'&&Number.isFinite(n);


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

const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export function parseAssets(url){
 const stocks=(url.searchParams.get('stocks')||'').split(',').filter(Boolean),crypto=(url.searchParams.get('crypto')||'').split(',').filter(Boolean).map(item=>{const parts=item.split(':');if(parts.length!==2)throw Error('Invalid crypto identity');return {symbol:parts[0],id:parts[1]};});
 if(stocks.length>30||crypto.length>20||stocks.some(s=>!/^[A-Z0-9][A-Z0-9.^=-]{0,15}$/.test(s))||crypto.some(c=>!/^[A-Z0-9][A-Z0-9.^=-]{0,15}$/.test(c.symbol)||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(c.id)))throw Error('Invalid asset request');
 const symbols=[...stocks,...crypto.map(c=>c.symbol)];if(new Set(symbols).size!==symbols.length)throw Error('Duplicate symbols');
 return {stocks:stocks.sort(),crypto:crypto.sort((a,b)=>a.symbol.localeCompare(b.symbol))};
}
async function prices(assets,env){
 const quotes={};for(let i=0;i<assets.stocks.length;i+=6)Object.assign(quotes,Object.fromEntries(await Promise.all(assets.stocks.slice(i,i+6).map(fetchStock))));
 if(assets.crypto.length){try{const data=await json('https://api.coingecko.com/api/v3/simple/price?ids='+encodeURIComponent(assets.crypto.map(c=>c.id).join(','))+'&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true',env.COINGECKO_DEMO_API_KEY?{'x-cg-demo-api-key':env.COINGECKO_DEMO_API_KEY}:{});for(const c of assets.crypto){const q=data[c.id],ok=finite(q?.usd)&&q.usd>0&&q.last_updated_at;quotes[c.symbol]={price:ok?q.usd:null,dailyPct:ok?q.usd_24h_change??null:null,timestamp:ok?q.last_updated_at:null,provider:'CoinGecko',providerId:c.id,status:ok?'connected':'unavailable'};}}catch(e){for(const c of assets.crypto)quotes[c.symbol]={price:null,dailyPct:null,timestamp:null,provider:'CoinGecko',providerId:c.id,status:'unavailable',error:e.message};}}
 return {schema:1,fetchedAt:Date.now()/1000,refreshSeconds:120,quotes,issues:Object.entries(quotes).filter(([_,q])=>q.price===null).map(([s,q])=>s+': '+(q.error||'Unavailable'))};
}
const decode=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
async function news(){
 const response=await fetch('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,BTC-USD&region=US&lang=en-US',{headers:{'User-Agent':'Mozilla/5.0 GonzoPortfolio/1.0'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('News provider HTTP '+response.status);const xml=await response.text(),items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];const field=(item,key)=>decode(item.match(new RegExp('<'+key+'(?:[^>]*)>([\\s\\S]*?)</'+key+'>'))?.[1]||'').trim();return {fetchedAt:Date.now()/1000,newsStatus:'connected',news:items.slice(0,30).map(([_,item])=>{const title=field(item,'title'),url=field(item,'link'),published=Date.parse(field(item,'pubDate'))/1000;return {id:url,title,url,source:'Yahoo Finance news feed',summary:field(item,'description').slice(0,500),published:Number.isFinite(published)?published:null,tags:['Market'],summaryType:'Publisher feed summary',linkType:'Publisher article'};}).filter(a=>a.title&&/^https:\/\//.test(a.url))};
}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 let assets;try{if(url.pathname==='/api/prices')assets=parseAssets(url);else if(url.pathname==='/api/search'){if(!url.searchParams.get('q')?.trim()||url.searchParams.get('q').length>60)throw Error('Enter a coin name');}else if(url.pathname!=='/api/news')return reply({error:'Not found'},404);}catch(e){return reply({error:e.message},400);}
 if(assets&&!assets.stocks.length&&!assets.crypto.length)return reply({schema:1,fetchedAt:Date.now()/1000,refreshSeconds:120,quotes:{},issues:[]});
 const canonical=new URL(url.origin+url.pathname);if(assets){canonical.searchParams.set('stocks',assets.stocks.join(','));canonical.searchParams.set('crypto',assets.crypto.map(c=>c.symbol+':'+c.id).join(','));}else if(url.pathname==='/api/search')canonical.searchParams.set('q',url.searchParams.get('q').trim().toLowerCase());const key=new Request(canonical),cached=await caches.default.match(key);if(cached)return reply(await cached.json());
 try{let data,ttl;if(assets){data=await prices(assets,env);ttl=data.issues.length?15:115;}else if(url.pathname==='/api/search'){const found=await json('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(url.searchParams.get('q')),env.COINGECKO_DEMO_API_KEY?{'x-cg-demo-api-key':env.COINGECKO_DEMO_API_KEY}:{});data={coins:(found.coins||[]).slice(0,30).map(c=>({id:c.id,symbol:c.symbol.toUpperCase(),name:c.name}))};ttl=86400;}else{data=await news();ttl=900;}
 ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age='+ttl}})));return reply(data);
 }catch(e){return reply({error:e.message},502);}
}};
