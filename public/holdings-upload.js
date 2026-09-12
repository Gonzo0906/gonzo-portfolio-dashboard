const number='(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const safeNumber=s=>{const n=Number(s.replaceAll(',',''));return Number.isFinite(n)&&n>=0?n:null;};
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function detectHoldings(text,assets){
 const lines=String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean),found=new Map();
 const marker=line=>assets.filter(h=>new RegExp(`(^|[^a-z0-9])${escaped(h.symbol)}([^a-z0-9]|$)`,h.symbol.length>3?'i':'').test(line)||(h.name&&new RegExp(`(^|[^a-z0-9])${escaped(h.name)}([^a-z0-9]|$)`,'i').test(line)));
 let active=null;
 const add=(symbol,value)=>{if(value===null)return;const values=found.get(symbol)||new Set();values.add(value);found.set(symbol,values);};
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(line==='===SCREENSHOT==='){active=null;continue;}const matches=marker(line);if(!matches.length&&/^[A-Z]{1,6}$/.test(line)){active=null;continue;}
  if(matches.length===1)active=matches[0];else if(matches.length>1){active=null;continue;}
  if(!active)continue;
  // Never treat a dollar price, daily change, cost, or available PI as total quantity.
  if(/[+−-]\s*\d|[$€£%]|available|average|avg\.?|cost|price|value|buying power/i.test(line))continue;
  const candidates=[];
  for(const re of [new RegExp(`(?<![\\d.,+-])(${number})\\s*(?:shares?|coins?|tokens?|units?)\\b`,'i'),new RegExp(`(?:total\\s+(?:balance|holdings)|shares?(?:\\s+owned)?|quantity|coins?(?:\\s+owned)?|tokens?|balance|holdings)\\s*[:=]?\\s*(${number})\\b`,'i'),new RegExp(`(?<![\\d.,+-])(${number})\\s*${escaped(active.symbol)}\\b`,'i'),new RegExp(`^${escaped(active.symbol)}\\s+(${number})$`,'i')]){
   const m=line.match(re);if(m)candidates.push(safeNumber(m[1]));
  }
  if(/^(?:total\s+(?:balance|holdings)|shares?(?:\s+owned)?|quantity|coins?(?:\s+owned)?|tokens?|balance|holdings)\s*:?$/i.test(line)&&lines[i+1]){
   const m=lines[i+1].match(new RegExp(`^(${number})(?:\\s*(?:${escaped(active.symbol)}|shares?|coins?|tokens?))?$`,'i'));if(m)candidates.push(safeNumber(m[1]));
  }
  for(const value of candidates)add(active.symbol,value);
 }
 return assets.filter(h=>found.has(h.symbol)).map(h=>{const values=[...found.get(h.symbol)];return {symbol:h.symbol,quantity:values.length===1?values[0]:null,conflict:values.length>1};});
}
let enginePromise;
function loadEngine(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/tesseract.min.js',import.meta.url).href;script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{enginePromise=null;script.remove();reject(Error('Could not load screenshot reader. Try again or enter totals below.'));};document.head.append(script);});
 return enginePromise;
}
export async function readScreenshots(files,onProgress,isCancelled,workerReady){
 const engine=await loadEngine();if(isCancelled())return '';
 const worker=await engine.createWorker('eng',1,{workerPath:new URL('vendor/worker.min.js',import.meta.url).href,logger:m=>onProgress(m.status==='recognizing text'?'Reading text '+Math.round((m.progress||0)*100)+'%':'Preparing screenshot reader…')});
 workerReady(worker);let text='';
 try{for(let i=0;i<files.length&&!isCancelled();i++){onProgress(`Reading screenshot ${i+1} of ${files.length}…`);const {data}=await worker.recognize(files[i]);text+='\n===SCREENSHOT===\n'+data.text;}return text;}finally{await worker.terminate();}
}
export function openHoldingsUpload({assets,dialog,onSave,escape}){
 dialog('Update holdings',`<p>Upload your latest holdings screenshots, then check the detected <b>total shares and coins</b>. Saving replaces totals; it does not add purchases.</p><label class="uploadLabel">Screenshots<input id="holdingsScreenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p class="note">Images are read on this device and are not uploaded to a server. The first scan downloads the text reader. Use clear screenshots showing symbols and total quantities.</p><div id="screenshotPreviews"></div><p id="scanStatus" role="status"></p><p id="uploadError" class="error" role="alert"></p><details><summary>Review or correct extracted text</summary><textarea id="screenshotText" rows="7" aria-label="Extracted screenshot text" placeholder="NVDA 52.5 shares&#10;15.934 SOL"></textarea><button id="parseScreenshotText" type="button">Detect totals from text</button></details><p id="detectedSummary" class="note">You can also enter several totals directly below.</p><p class="note">Only checked rows are saved. For changed stocks, enter the latest average cost or leave it blank to mark the cost as unknown.</p><form id="holdingsUploadForm"><div class="uploadTable"><div class="uploadRow uploadHead"><span>Use</span><span>Holding / current</span><span>New total</span><span>Stock avg. $</span></div>${assets.map(h=>`<div class="uploadRow" data-upload-symbol="${escape(h.symbol)}"><input type="checkbox" aria-label="Update ${escape(h.symbol)}"><label>${escape(h.symbol)}<small>Current: ${escape(h.quantity??'unknown')}</small></label><input class="uploadQuantity" type="number" min="0" step="any" aria-label="New total ${escape(h.symbol)}" placeholder="Unchanged">${h.stock?`<input class="uploadCost" type="number" min="0" step="any" aria-label="Average cost ${escape(h.symbol)}" placeholder="Unknown">`:'<span>—</span>'}<small class="uploadMatch"></small></div>`).join('')}</div><label class="uploadLabel">Available PI (separate from total)<input id="uploadPiAvailable" type="number" min="0" step="any" value="${assets.find(h=>h.symbol==='PI')?.available??''}"></label><label class="uploadConfirm"><input id="confirmScreenshotTotals" type="checkbox"> I have checked the selected totals.</label><div class="actions"><button class="primary" id="saveScreenshotTotals" disabled>Save selected totals</button></div></form>`);
 const $=id=>document.getElementById(id),root=$('dialog'),urls=[];let cancelled=false,worker=null,scanning=false;
 root.addEventListener('close',()=>{cancelled=true;for(const url of urls)URL.revokeObjectURL(url);worker?.terminate().catch(()=>{});},{once:true});
 const rows=[...root.querySelectorAll('[data-upload-symbol]')];
 function resetConfirmation(){$('confirmScreenshotTotals').checked=false;$('saveScreenshotTotals').disabled=true;}
 function parse(){resetConfirmation();const detected=detectHoldings($('screenshotText').value,assets);for(const row of rows){const d=detected.find(x=>x.symbol===row.dataset.uploadSymbol);row.querySelector('input[type=checkbox]').checked=!!d&&!d.conflict;row.querySelector('.uploadQuantity').value=d?.quantity??'';row.querySelector('.uploadMatch').textContent=d?.conflict?'Different totals detected; enter the correct total.':d?'Detected — please verify.':'';}$('detectedSummary').textContent=`${detected.filter(d=>!d.conflict).length} totals detected. Unreadable or conflicting quantities need manual entry.`;}
 $('parseScreenshotText').onclick=parse;
 $('confirmScreenshotTotals').onchange=()=>{$('saveScreenshotTotals').disabled=scanning||!$('confirmScreenshotTotals').checked;};
 $('holdingsUploadForm').oninput=e=>{if(e.target.id==='confirmScreenshotTotals')return;resetConfirmation();if(e.target.classList.contains('uploadQuantity'))e.target.closest('.uploadRow').querySelector('input[type=checkbox]').checked=e.target.value!=='';};
 $('holdingsScreenshots').onchange=async e=>{
  const files=[...e.target.files];$('uploadError').textContent='';if(!files.length)return;
  if(files.length>20||files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>15*1024*1024)){$('uploadError').textContent='Choose up to 20 PNG, JPEG or WebP screenshots, each under 15 MB.';return;}
  resetConfirmation();scanning=true;$('holdingsScreenshots').disabled=true;$('parseScreenshotText').disabled=true;
  for(const url of urls)URL.revokeObjectURL(url);urls.length=0;$('screenshotPreviews').replaceChildren();
  for(const file of files){const img=document.createElement('img');const url=URL.createObjectURL(file);urls.push(url);img.src=url;img.alt=file.name;$('screenshotPreviews').append(img);}
  try{const text=await readScreenshots(files,status=>{if(!cancelled)$('scanStatus').textContent=status;},()=>cancelled,w=>worker=w);if(cancelled)return;$('screenshotText').value=text;parse();$('scanStatus').textContent='Scan complete. Review the selected totals before saving.';}catch(err){if(!cancelled)$('uploadError').textContent='Screenshot reader: '+err.message+' You can enter totals manually.';}finally{if(!cancelled){scanning=false;$('holdingsScreenshots').disabled=false;$('parseScreenshotText').disabled=false;}}
 };
 $('holdingsUploadForm').onsubmit=e=>{e.preventDefault();if(scanning||!$('confirmScreenshotTotals').checked)return;try{const updates=rows.filter(r=>r.querySelector('input[type=checkbox]').checked).map(r=>{const value=r.querySelector('.uploadQuantity').value,cost=r.querySelector('.uploadCost')?.value;return {symbol:r.dataset.uploadSymbol,quantity:value===''?null:Number(value),cost:cost==null||cost===''?null:Number(cost)};});if(!updates.length)throw Error('Select at least one holding.');if(updates.some(u=>u.quantity===null||!Number.isFinite(u.quantity)||u.quantity<0||u.cost!==null&&(!Number.isFinite(u.cost)||u.cost<0)))throw Error('Enter valid nonnegative totals and costs.');const available=$('uploadPiAvailable').value;if(available==='')throw Error('Enter the available PI balance.');onSave(updates,Number(available));}catch(err){$('uploadError').textContent=err.message;}};
}
