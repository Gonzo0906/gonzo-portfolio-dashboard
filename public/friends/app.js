import {valuation,returns,quoteStatus,alertValue,condition,validNumber} from './engine.js';
import {purchaseUpdate} from './purchase.js';
import {openHoldingsUpload} from './holdings-upload.js';
const $=id=>document.getElementById(id);
import {PORTFOLIO_KEY,emptyPortfolio,validatePortfolio,priceQuery} from './portfolio.js';
import {addHolding,settings as portfolioSettings} from './manage.js';
const KEY=PORTFOLIO_KEY;
const api=path=>new URL('api/'+path,new URL('./',import.meta.url)).href;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PRIVACY_KEY='gonzo.friends.concealed';
let concealed=false;
try{concealed=localStorage.getItem(PRIVACY_KEY)==='true';}catch{}
const usd=(n,price=false)=>concealed?'••••':validNumber(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:price&&n<.01?9:2}).format(n):'—';
const qty=n=>concealed?'••••':validNumber(n)?new Intl.NumberFormat('en-US',{maximumFractionDigits:11}).format(n):'quantity needed';
const pct=n=>concealed?'••••':validNumber(n)?`${n>=0?'+':''}${n.toFixed(2)}%`:'—';
const tone=n=>validNumber(n)?n>=0?'positive':'negative':'';
const time=n=>n?new Date(n*1000).toLocaleString(): 'Unavailable';
let notificationsReadAt=0,notificationsOpen=false;
let defaults,holdings,market={quotes:{},news:[],fetchedAt:null},rules=[],history=[],seen=null,newsPopups=true,ruleState={},pages={stocks:0,crypto:0,news:0,alerts:0},storageError=false,refreshError='',busy=false,priceEndpoint=null,minuteConnected=false;
function readState(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({holdings,rules,history:history.slice(0,200),seen:seen?.slice(-500),newsPopups,ruleState,notificationsReadAt}));}catch{storageError=true;}}
function normalize(raw){return {stocks:raw.stocks.map(([symbol,quantity,cost])=>({symbol,quantity,cost})),crypto:raw.crypto.map(([symbol,quantity,id,name])=>({symbol,quantity,id,name,cost:null})),metadata:raw.metadata};}
function pageNav(id,key,count,size){const total=Math.max(1,Math.ceil(count/size));pages[key]=Math.min(pages[key],total-1);$(id).innerHTML=`<button aria-label="Previous ${key} page" ${pages[key]===0?'disabled':''}>‹</button><span>${pages[key]+1} / ${total}</span><button aria-label="Next ${key} page" ${pages[key]>=total-1?'disabled':''}>›</button>`;const bs=$(id).querySelectorAll('button');bs[0].onclick=()=>{pages[key]--;render();};bs[1].onclick=()=>{pages[key]++;render();};}
function rows(type,id,nav){const el=$(id),list=holdings[type];el.innerHTML=list.map(h=>{const q=market.quotes[h.symbol],r=returns(h,q),st=quoteStatus(q,market.fetchedAt);const value=validNumber(h.quantity)&&validNumber(q?.price)?h.quantity*q.price:null;return `<button class="holding" data-symbol="${escape(h.symbol)}" title="Details and edit ${escape(h.symbol)}"><div><b class="asset">${escape(h.symbol)}</b><small title="${qty(h.quantity)}">${qty(h.quantity)}</small></div><div><b>${usd(q?.price,true)}</b><small class="${tone(q?.dailyPct)}">${pct(q?.dailyPct)} ${type==='stocks'?'day':'24h'}</small><small class="${st.includes('stale')||st==='unavailable'?'warning':''}">${escape(st)}</small></div><div><b>${usd(value)}</b><small class="${tone(r.pct)}">${validNumber(r.pct)?pct(r.pct)+' return':h.cost===0?'return undefined':'basis unknown'}</small>${type==='stocks'?`<small>Avg ${h.cost===null?'unknown':usd(h.cost)}</small>`:''}</div></button>`;}).join('');el.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>editHolding(b.dataset.symbol));fitHoldingText(el);}

function fitHoldingText(container){
 for(const card of container.querySelectorAll('.holding')){
  const style=getComputedStyle(card),innerWidth=card.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),innerHeight=card.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
  const labels=[...card.querySelectorAll('b,small')].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none');
  for(const group of card.children){group.style.fontSize='0px';group.style.lineHeight='0';}
  for(const label of labels){label.style.display='block';label.style.lineHeight='1.3';}
  for(const label of labels){
   const range=document.createRange();range.selectNodeContents(label);
   const width=range.getBoundingClientRect().width,available=Math.min(innerWidth,label.parentElement.clientWidth);
   if(width>available&&available>0)label.style.fontSize=(parseFloat(getComputedStyle(label).fontSize)*(available-1)/width)+'px';
  }
  for(let attempt=0;attempt<3;attempt++){
   const groups=[...card.children].filter(el=>getComputedStyle(el).display!=='none');
   const needed=style.display==='flex'&&style.flexDirection==='column'?groups.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+parseFloat(style.rowGap||0)*Math.max(0,groups.length-1):Math.max(...groups.map(el=>el.getBoundingClientRect().height));
   if(needed<=innerHeight||innerHeight<=0)break;
   for(const label of labels)label.style.fontSize=(parseFloat(getComputedStyle(label).fontSize)*Math.max(.5,(innerHeight-1)/needed))+'px';
  }
 }
}

function applyPrivacy(){
 document.body.classList.toggle('concealed',concealed);
 for(const id of ['conceal','dialogConceal']){const button=$(id);button.textContent=concealed?'Show values':'Conceal';button.setAttribute('aria-pressed',String(concealed));button.setAttribute('aria-label',concealed?'Show values and prices':'Conceal values and prices');}
}
function togglePrivacy(){concealed=!concealed;try{localStorage.setItem(PRIVACY_KEY,String(concealed));}catch{}$('dialog').close();applyPrivacy();render();}
$('conceal').onclick=togglePrivacy;$('dialogConceal').onclick=togglePrivacy;applyPrivacy();

function renderNotifications(){
 const unread=history.filter(item=>validNumber(item.at)&&item.at>notificationsReadAt).length;
 $('notificationBadge').textContent=unread>99?'99+':String(unread);
 $('notificationBadge').hidden=unread===0;
 $('notificationsButton').setAttribute('aria-label',`Notifications, ${unread} unread`);
 $('notificationsButton').setAttribute('aria-expanded',String(notificationsOpen));
 $('notificationDropdown').hidden=!notificationsOpen;
 $('notificationList').innerHTML=history.length?history.slice(0,30).map(item=>`<li><p>${concealed?'Alert details concealed':escape(item.text)}</p><small>${escape(time(item.at))}</small></li>`).join(''):'<li class="empty">No alerts yet. Add a rule to get started.</li>';
}
function closeNotifications(){notificationsOpen=false;renderNotifications();}
$('notificationsButton').onclick=()=>{
 notificationsOpen=!notificationsOpen;
 if(notificationsOpen){notificationsReadAt=Date.now()/1000;persist();}
 renderNotifications();
};
$('closeNotifications').onclick=closeNotifications;
document.addEventListener('click',e=>{if(notificationsOpen&&!$('notificationDropdown').contains(e.target)&&!$('notificationsButton').contains(e.target))closeNotifications();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&notificationsOpen){closeNotifications();$('notificationsButton').focus();}});

function render(){if(!holdings)return;renderNotifications();const v=valuation(holdings,market.quotes),n=holdings.stocks.length+holdings.crypto.length,stale=Object.values(market.quotes).some(q=>quoteStatus(q,market.fetchedAt).includes('stale'));
 $('totalLabel').textContent=v.complete?'COMBINED PORTFOLIO':'KNOWN SUBTOTAL · PARTIAL';$('total').textContent=v.priced?usd(v.subtotal):'Unavailable';$('coverage').textContent=`${v.priced}/${n} valued${stale?' · stale data':''}`;
 for(const [type,id,a] of [['stocks','stockTotal','stockAlloc'],['crypto','cryptoTotal','cryptoAlloc']]){$(id).textContent=v[type].priced?usd(v[type].subtotal):'Unavailable';$(a).textContent=v.allocation?`${v.allocation[type].toFixed(1)}% allocation`:`${v[type].complete?'Valued':'Partial'} · allocation unknown`;}
 rows('stocks','stocks','stockPages');rows('crypto','cryptos','cryptoPages');
 pageNav('newsPages','news',market.news.length,1);const article=market.news[pages.news];$('news').innerHTML=article?`<button class="newsitem"><b>${escape(article.title)}</b><small>${escape(article.source)} · ${escape(new Date(article.published*1000).toLocaleDateString())}</small></button>`:'<p class="empty">News unavailable. No placeholder articles.</p>';
 if(article)$('news').querySelector('button').onclick=()=>showArticle(article);
 $('newsStatus').textContent=refreshError?'Fetch failed':`${market.newsStatus||'unavailable'} · ${market.news.length}`;
 const size=1;pageNav('alertPages','alerts',history.length,size);const entry=history[pages.alerts];$('alerts').innerHTML=entry?`<div class="alertitem">${escape(entry.text)}<small>${escape(time(entry.at))}</small></div>`:`<p class="empty">${rules.length} rule${rules.length===1?'':'s'} configured.<br>Alerts run while this dashboard is open.</p>`;
 $('feedTime').textContent=refreshError?'Refresh failed · showing last snapshot':market.fetchedAt?`Snapshot ${new Date(market.fetchedAt*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · ${stale?'stale':minuteConnected?'2m prices':'15m snapshot'}`:'Market data unavailable';
}
function dialog(title,html){$('dialog').classList.toggle('financialDialog',title!=='Market article');$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
$('closeDialog').onclick=()=>$('dialog').close();$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
function editHolding(symbol){const h=[...holdings.stocks,...holdings.crypto].find(h=>h.symbol===symbol),q=market.quotes[symbol],r=returns(h,q),isStock=holdings.stocks.includes(h);dialog(`${symbol} · details & quantity`,`<p>${escape(h.name||q?.name||symbol)}</p><div class="facts"><div><small>Current price</small>${usd(q?.price,true)}</div><div><small>Market value</small>${validNumber(h.quantity)&&validNumber(q?.price)?usd(h.quantity*q.price):'Unavailable'}</div><div><small>${isStock?'Daily change vs previous close':'Rolling 24-hour change'}</small><span class="${tone(q?.dailyPct)}">${pct(q?.dailyPct)}</span></div><div><small>Total investment return</small>${r.pct===null?h.cost===0?'Undefined: zero cost basis':'Unknown cost basis':pct(r.pct)}${r.profit!==null?'<br>'+usd(r.profit)+' unrealized P/L':''}</div></div><p class="note">${escape(q?.provider||'No provider')} · ID ${escape(q?.providerId||h.id||symbol)}<br>Provider timestamp: ${escape(time(q?.timestamp))}<br>Status: ${escape(quoteStatus(q,market.fetchedAt))}</p><form id="editForm"><div class="fields"><label>Quantity<input id="quantity" type="number" min="0" step="any" value="${h.quantity??''}" placeholder="Quantity needed"></label>${isStock?`<label>Average cost (USD)<input id="cost" type="number" min="0" step="any" value="${h.cost??''}" placeholder="Unknown; leave blank"></label>`:'<p class="note">Crypto cost basis is unknown. No return is inferred.</p>'}${symbol==='PI'?`<label>Available PI (separate)<input id="available" type="number" min="0" step="any" value="${holdings.metadata.PI.available}"></label>`:''}</div><p class="note">Edits are stored on this device. Share quantities are never automatically adjusted for corporate actions.</p><p id="editError" class="error"></p><div class="actions"><button class="primary" type="submit">Save changes</button></div></form>`);$('editForm').onsubmit=e=>{e.preventDefault();const quantity=$('quantity').value===''?null:Number($('quantity').value),cost=isStock?($('cost').value===''?null:Number($('cost').value)):null;const available=symbol==='PI'?Number($('available').value):null;if(quantity===null||[quantity,cost,available].some(x=>x!==null&&(!validNumber(x)||x<0))||(symbol==='PI'&&(quantity===null||available>quantity))){$('editError').textContent='Enter valid nonnegative values. Available PI cannot exceed total PI.';return;}h.quantity=quantity;h.cost=cost;if(symbol==='PI')holdings.metadata.PI.available=available;persist();render();$('dialog').close();if(storageError)toast('Browser storage is unavailable; export a backup from Settings.');};}

function recordPurchase(){
 const list=[...holdings.stocks,...holdings.crypto];
 dialog('Record purchase',`<form id="purchaseForm"><div class="fields"><label>Stock or crypto<select id="purchaseSymbol">${list.map(h=>`<option value="${escape(h.symbol)}">${escape(h.symbol)} · ${holdings.stocks.includes(h)?'Stock':'Crypto'}</option>`).join('')}</select></label><label>Quantity purchased<input id="purchaseAmount" type="number" min="0" step="any" required placeholder="Shares or coins bought"></label><label id="startingLabel" hidden>Existing quantity before purchase<input id="purchaseStarting" type="number" min="0" step="any" placeholder="Enter actual quantity"></label><label id="purchasePriceLabel">Purchase price per share (USD, optional)<input id="purchasePrice" type="number" min="0" step="any" placeholder="Actual price paid"></label></div><p id="purchasePreview" class="note"></p><p class="note">This records a completed purchase in your dashboard. It adds to your existing quantity and saves on this device. Enter the actual fill quantity. Crypto cost basis remains unknown. Stock average cost updates only when the existing basis and purchase price are known; otherwise it becomes unknown.</p><p id="purchaseError" class="error" role="alert"></p><div class="actions"><button class="primary" id="savePurchase" type="submit">Save purchase</button></div></form>`);
 const selected=()=>list.find(h=>h.symbol===$('purchaseSymbol').value);
 const preview=()=>{
  const h=selected(),stock=holdings.stocks.includes(h),unknown=h.quantity===null;
  $('startingLabel').hidden=!unknown;$('purchaseStarting').required=unknown;
  $('purchasePriceLabel').hidden=!stock;
  const current=unknown?($('purchaseStarting').value===''?null:Number($('purchaseStarting').value)):h.quantity;
  const amount=$('purchaseAmount').value===''?null:Number($('purchaseAmount').value);
  $('purchasePreview').textContent=`Existing: ${qty(current)}${validNumber(current)&&validNumber(amount)&&amount>0?' → After purchase: '+qty(current+amount):''}`;
 };
 $('purchaseSymbol').onchange=()=>{$('purchaseStarting').value='';$('purchasePrice').value='';$('purchaseError').textContent='';preview();};
 for(const id of ['purchaseAmount','purchaseStarting'])$(id).oninput=preview;
 preview();
 $('purchaseForm').onsubmit=e=>{
  e.preventDefault();const h=selected(),stock=holdings.stocks.includes(h);
  try{
   const current=h.quantity===null?($('purchaseStarting').value===''?null:Number($('purchaseStarting').value)):h.quantity;
   const price=stock&&$('purchasePrice').value!==''?Number($('purchasePrice').value):null;
   const update=purchaseUpdate(h,Number($('purchaseAmount').value),price,current);
   const next=structuredClone(holdings),target=[...next.stocks,...next.crypto].find(x=>x.symbol===h.symbol);
   target.quantity=update.quantity;target.cost=stock?update.cost:null;
   // Save before mutating the displayed portfolio so failed storage can be retried safely.
   localStorage.setItem(KEY,JSON.stringify({holdings:next,rules,history:history.slice(0,200),seen:seen?.slice(-500),newsPopups,ruleState,notificationsReadAt}));
   holdings=next;storageError=false;render();$('dialog').close();
   toast(`${h.symbol}: purchase recorded. New quantity ${qty(update.quantity)}.`);
  }catch(err){$('purchaseError').textContent=err.message==='QuotaExceededError'?'Could not save. Free browser storage and try again.':err.message;}
 };
}
$('recordPurchase').onclick=recordPurchase;
$('updateHoldings').onclick=()=>openHoldingsUpload({assets:[...holdings.stocks.map(h=>({...h,stock:true})),...holdings.crypto.map(h=>({...h,available:h.symbol==='PI'?holdings.metadata.PI.available:undefined}))],dialog,escape,onSave:(updates,available)=>{
 const next=structuredClone(holdings);
 for(const update of updates){const stock=next.stocks.find(h=>h.symbol===update.symbol),h=stock||next.crypto.find(h=>h.symbol===update.symbol);if(!h)throw Error('Unknown holding');const changed=h.quantity!==update.quantity;h.quantity=update.quantity;if(stock&&(changed||update.cost!==null))h.cost=update.cost;}
 const pi=next.crypto.find(h=>h.symbol==='PI');if(pi){if(!validNumber(available)||available<0||available>pi.quantity)throw Error('Available PI cannot exceed the new total PI.');next.metadata.PI={available};}
 const state={holdings:next,rules,history:history.slice(0,200),seen:seen?.slice(-500),newsPopups,ruleState,notificationsReadAt};
 try{localStorage.setItem(KEY,JSON.stringify(state));}catch{throw Error('Could not save on this device. Export a backup from Settings and try again.');}
 holdings=next;storageError=false;render();$('dialog').close();toast(updates.length+' holding totals updated.');
}});

function showArticle(a){const safeLink=/^https:\/\//.test(a.url)?a.url:'#';dialog('Market article',`<h3>${escape(a.title)}</h3><p>${escape(a.source)} · ${escape(time(a.published))}</p><p>${escape(a.summary)}</p><p class="note">${escape(a.summaryType)}. Relevant to a holdings watch group: ${escape(a.tags.join(', '))}.</p><p><a href="${escape(safeLink)}" target="_blank" rel="noopener noreferrer">Read original publisher article ↗</a></p><p class="note">${escape(a.linkType)}. This is refreshed news, not a placeholder watch link.</p>`);}
function toast(message){const box=document.createElement('div');box.className='toast';box.innerHTML=`<button aria-label="Dismiss alert">✕</button>${escape(message)}`;$('toasts').prepend(box);box.querySelector('button').onclick=()=>box.remove();while($('toasts').children.length>3)$('toasts').lastChild.remove();setTimeout(()=>box.remove(),12000);}
function logAlert(text){history.unshift({text,at:Date.now()/1000});history=history.slice(0,200);if(notificationsOpen)notificationsReadAt=Date.now()/1000;renderNotifications();toast(text);}
function evaluateAlerts(){for(const rule of rules){const value=alertValue(rule,holdings,market);if(value===null)continue;const active=condition(rule.type,value,rule.threshold),old=ruleState[rule.id]||{active:false,last:0};if(active&&!old.active&&Date.now()/1000-old.last>rule.cooldown*60){logAlert(`${rule.symbol}: ${rule.type==='above'?'price above':rule.type==='below'?'price below':rule.type==='daily'?'absolute daily move above':'allocation above'} ${rule.threshold}${['daily','allocation'].includes(rule.type)?'%':' USD'} (now ${['daily','allocation'].includes(rule.type)?value.toFixed(2)+'%':usd(value)})`);old.last=Date.now()/1000;}old.active=active;ruleState[rule.id]=old;}
 const ids=market.news.map(a=>a.id);if(seen!==null&&newsPopups){const fresh=market.news.filter(a=>!seen.includes(a.id)&&a.published>Date.now()/1000-86400);if(fresh.length)logAlert(`${fresh.length} new relevant article${fresh.length>1?'s':''}: ${fresh[0].title}`);}seen=[...new Set([...(seen||[]),...ids])].slice(-500);persist();}
function alertSettings(){dialog('Configure alerts',`<p class="note">Popup alerts require this dashboard to stay open. Rules trigger on entry into the condition, with a cooldown. Stale or missing data suppresses price alerts. Allocation rules wait for a complete valuation.</p><form id="ruleForm"><div class="fields"><label>Asset<select id="ruleSymbol">${[...holdings.stocks,...holdings.crypto].map(h=>`<option>${escape(h.symbol)}</option>`).join('')}</select></label><label>Condition<select id="ruleType"><option value="above">Price above (USD)</option><option value="below">Price below (USD)</option><option value="daily">Absolute daily move above (%)</option><option value="allocation">Asset allocation above (%)</option></select></label><label>Threshold<input id="threshold" type="number" min="0" step="any" required></label><label>Cooldown (minutes)<input id="cooldown" type="number" min="1" step="1" value="60" required></label></div><div class="actions"><button class="primary">Add rule</button></div><p id="ruleError" class="error"></p></form><p><label><input id="newsPopups" type="checkbox" style="width:auto" ${newsPopups?'checked':''}> Popup alerts for new relevant articles</label></p><div id="rulesList">${rules.map(r=>`<div class="rule"><span>${escape(r.symbol)} · ${escape(r.type)} · ${r.threshold} · ${r.cooldown}m</span><button data-delete="${r.id}">Delete</button></div>`).join('')||'<p class="note">No price rules yet.</p>'}</div>`);$('newsPopups').onchange=e=>{newsPopups=e.target.checked;persist();};$('ruleForm').onsubmit=e=>{e.preventDefault();const threshold=Number($('threshold').value),cooldown=Number($('cooldown').value);if(!validNumber(threshold)||threshold<0||!validNumber(cooldown)||cooldown<1){$('ruleError').textContent='Enter a nonnegative threshold and cooldown of at least 1 minute.';return;}rules.push({id:crypto.randomUUID(),symbol:$('ruleSymbol').value,type:$('ruleType').value,threshold,cooldown});persist();alertSettings();render();};$('rulesList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{rules=rules.filter(r=>r.id!==b.dataset.delete);delete ruleState[b.dataset.delete];persist();alertSettings();render();});}
$('configureAlerts').onclick=alertSettings;
function savePortfolio(next,nextRules=rules){
 const checked=validatePortfolio(next);if(!checked.stocks.length&&!checked.crypto.length){history=[];ruleState={};seen=null;}const state={holdings:checked,rules:nextRules,history:history.slice(0,200),seen:seen?.slice(-500),newsPopups,ruleState,notificationsReadAt};
 try{localStorage.setItem(KEY,JSON.stringify(state));}catch{throw Error('Could not save on this device. Export a backup and try again.');}
 holdings=checked;rules=nextRules;render();refresh();
}
function openAddHolding(){addHolding({holdings,dialog,escape,api,save:savePortfolio,onQuote:(symbol,quote,fetchedAt)=>{market.quotes[symbol]=quote;market.fetchedAt=fetchedAt;minuteConnected=true;}});}
$('addHolding').onclick=openAddHolding;
$('shareDashboard').onclick=async()=>{const url=new URL('./',location.href).href;try{if(navigator.share)await navigator.share({title:'Gonzo Portfolio',text:'Track your own stocks and crypto with Gonzo Portfolio.',url});else{await navigator.clipboard.writeText(url);toast('Share link copied. It contains no portfolio data.');}}catch(e){if(e.name!=='AbortError')toast('Copy the dashboard address to share it.');}};
$('settings').onclick=()=>portfolioSettings({holdings,rules,dialog,save:savePortfolio,escape});
$('feedDetails').onclick=()=>dialog('Data coverage & freshness',`<p>Prices are checked every 2 minutes while this dashboard is visible. Stocks use delayed public Yahoo quotes; crypto uses CoinGecko USD prices. News rotates every 7 seconds.</p><p>Last price fetch: ${escape(time(market.fetchedAt))}. ${escape(refreshError)}</p><p>Only asset symbols and coin identifiers are sent to the price service. Quantities, costs and screenshots stay on this device. API keys are kept on the server. Public provider limits can temporarily prevent an update; the last available quote remains visible with its timestamp.</p><p>Returns use the average costs you enter and exclude fees and dividends. Crypto basis is unknown.</p>${Object.entries(market.quotes).filter(([symbol])=>[...holdings.stocks,...holdings.crypto].some(h=>h.symbol===symbol)).map(([symbol,q])=>`<p><b>${escape(symbol)}</b> · ${escape(q.provider)}<br><small>${escape(quoteStatus(q,market.fetchedAt))} · ${escape(time(q.timestamp))}</small></p>`).join('')}<p><a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">Data provided by CoinGecko</a></p>`);
const showHoldingDetails=editHolding;
editHolding=function(symbol){showHoldingDetails(symbol);const button=document.createElement('button');button.type='button';button.textContent='Remove holding';$('editForm').querySelector('.actions').append(button);button.onclick=()=>{dialog('Remove '+symbol+'?',`<p>This removes ${escape(symbol)} and its alert rules from this device.</p><button id="confirmRemove">Remove holding</button>`);$('confirmRemove').onclick=()=>{const next=structuredClone(holdings);for(const type of ['stocks','crypto'])next[type]=next[type].filter(h=>h.symbol!==symbol);savePortfolio(next,rules.filter(r=>r.symbol!==symbol));$('dialog').close();};};};
const renderDashboard=render;
render=function(){renderDashboard();if(!holdings)return;const count=holdings.stocks.length+holdings.crypto.length;$('stockCount').textContent=holdings.stocks.length;$('cryptoCount').textContent=holdings.crypto.length;for(const [id,type] of [['stocks','stocks'],['cryptos','crypto']]){const el=$(id),columns=innerHeight<=500?(type==='stocks'?6:4):innerWidth<=750?(type==='stocks'?3:2):2;el.style.gridTemplateRows='repeat('+Math.max(1,Math.ceil(holdings[type].length/columns))+',minmax(0,1fr))';if(!holdings[type].length)el.innerHTML=type==='stocks'?'<div class="welcomeCard"><h3>Your portfolio starts here</h3><p>Add the stocks and coins you own. This dashboard starts empty for each new visitor.</p><button id="firstHolding" class="primary">Add your first holding</button></div>':'<div class="welcomeCard"><h3>Your coins, your totals</h3><p>Add a cryptocurrency to track its price and value.</p></div>';fitHoldingText(el);}if($('firstHolding'))$('firstHolding').onclick=openAddHolding;for(const id of ['recordPurchase','updateHoldings','configureAlerts'])$(id).disabled=!count;if(!count){$('totalLabel').textContent='BUILD YOUR PORTFOLIO';$('coverage').textContent='Add your first stock or coin';}};
async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;try{
 if(!market.newsFetchedAt||Date.now()/1000-market.newsFetchedAt>900){try{const response=await fetch(api('news'),{signal:AbortSignal.timeout(20000)});if(response.ok){const news=await response.json();market.news=Array.isArray(news.news)?news.news:[];market.newsStatus=news.newsStatus||'connected';market.newsFetchedAt=news.fetchedAt;}}catch{market.newsStatus='unavailable';}}
 if(holdings.stocks.length+holdings.crypto.length){const response=await fetch(api('prices')+'?'+priceQuery(holdings),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Price service temporarily unavailable');const data=await response.json();if(data.schema!==1||!data.quotes||!validNumber(data.fetchedAt))throw Error('Invalid price response');for(const [symbol,q] of Object.entries(data.quotes))if(validNumber(q.price)&&q.price>0)market.quotes[symbol]=q;market.fetchedAt=data.fetchedAt;market.issues=data.issues;minuteConnected=true;refreshError=data.issues?.length?'Some prices unavailable; showing last known quotes':'';evaluateAlerts();}else refreshError='';render();
 }catch(e){refreshError=e.message;render();}finally{busy=false;$('refresh').disabled=false;}}
$('refresh').onclick=refresh;
try{defaults=emptyPortfolio();holdings=emptyPortfolio();const stored=readState();if(stored?.holdings){holdings=validatePortfolio(stored.holdings);const symbols=[...holdings.stocks,...holdings.crypto].map(h=>h.symbol);rules=Array.isArray(stored.rules)?stored.rules.filter(r=>symbols.includes(r.symbol)&&['above','below','daily','allocation'].includes(r.type)&&validNumber(r.threshold)&&r.threshold>=0&&validNumber(r.cooldown)&&r.cooldown>=1):[];history=Array.isArray(stored.history)?stored.history:[];seen=Array.isArray(stored.seen)?stored.seen:null;newsPopups=stored.newsPopups!==false;ruleState=stored.ruleState||{};notificationsReadAt=validNumber(stored.notificationsReadAt)?stored.notificationsReadAt:0;}persist();
 setInterval(()=>{if(document.hidden||$('dialog').open||market.news.length<2||$('news').matches(':hover')||$('news').contains(document.activeElement))return;pages.news=(pages.news+1)%market.news.length;render();},7000);
 document.fonts.ready.then(()=>render());new ResizeObserver(()=>render()).observe($('stocks'));render();await refresh();setInterval(()=>{if(!document.hidden)refresh();},120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}catch(e){$('coverage').textContent='This device has an unreadable portfolio. Use Settings to import a backup.';holdings=emptyPortfolio();render();toast(e.message);}
