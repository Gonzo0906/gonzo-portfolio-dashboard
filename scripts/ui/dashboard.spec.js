import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const raw=JSON.parse(fs.readFileSync(new URL('../../public/holdings.json',import.meta.url)));
const market=JSON.parse(fs.readFileSync(new URL('../../public/data/market.json',import.meta.url)));
for (const [width,height] of [[1440,900],[1366,768],[1920,1080],[768,1024],[390,844],[360,640],[320,568],[844,390],[640,360],[568,320]]){
 test(`no scrolling or clipped holding at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/');await expect(page.locator('#coverage')).toContainText('38/39');
  const bounds=await page.evaluate(()=>{const d=document.documentElement;const panels=[...document.querySelectorAll('.holdings .panel')].map(p=>{const pr=p.getBoundingClientRect(),rows=p.querySelector('.rows').getBoundingClientRect(),nav=p.querySelector('nav').getBoundingClientRect();return {right:pr.right,bottom:pr.bottom,rowBottoms:[...p.querySelectorAll('.holding')].map(r=>r.getBoundingClientRect().bottom),rowsBottom:rows.bottom,navTop:nav.top};});return {w:innerWidth,h:innerHeight,sw:d.scrollWidth,sh:d.scrollHeight,panels};});
  expect(bounds.sw).toBeLessThanOrEqual(width);expect(bounds.sh).toBeLessThanOrEqual(height);
  for(const p of bounds.panels){expect(p.right).toBeLessThanOrEqual(width);expect(p.bottom).toBeLessThanOrEqual(height);for(const b of p.rowBottoms)expect(b).toBeLessThanOrEqual(p.navTop+1);}
  expect(await page.locator('#stocks .holding').count()).toBeGreaterThan(0);expect(await page.locator('#cryptos .holding').count()).toBeGreaterThan(0);
  // Every holding remains reachable using its panel's independent pagination.
  for(const [id,type] of [['stocks','stocks'],['cryptos','crypto']]){const seen=new Set();for(let i=0;i<40;i++){for(const s of await page.locator(`#${id} .asset`).allTextContents())seen.add(s);const next=page.getByRole('button',{name:`Next ${type} page`,exact:true});if(!await next.isEnabled())break;await next.click();}expect([...seen].sort()).toEqual(raw[type].map(r=>r[0]).sort());}
 });
}
test('quantity edits persist, recalculate values and can be restored',async({page})=>{
 await page.goto('/');await page.locator('[data-symbol="VOO"]').click();await page.locator('#quantity').fill('2');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.reload();await expect(page.locator('[data-symbol="VOO"]')).toContainText('2');await page.locator('[data-symbol="VOO"]').click();await expect(page.locator('#dialogBody')).toContainText(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(2*market.quotes.VOO.price));await page.getByRole('button',{name:'Close dialog'}).click();await page.locator('#settings').click();await page.getByRole('button',{name:'Restore screenshot holdings'}).click();await page.getByRole('button',{name:'Restore holdings',exact:true}).click();await expect(page.locator('[data-symbol="VOO"]')).toContainText('0.42788');
});
test('articles are paginated with source, timestamp and HTTPS publisher link',async({page})=>{
 await page.goto('/');await expect(page.locator('#news')).not.toContainText('unavailable');await page.locator('#news button').click();const a=page.locator('#dialogBody a');expect(await a.getAttribute('href')).toMatch(/^https:\/\/news.google.com\//);await expect(page.locator('#dialogBody')).toContainText('Headline-derived');await page.getByRole('button',{name:'Close dialog'}).click();const before=await page.locator('#news').innerText();await page.getByRole('button',{name:'Next news page',exact:true}).click();expect(await page.locator('#news').innerText()).not.toBe(before);
});
test('popup rule triggers once and new snapshots recalculate without repeated spam',async({page})=>{
 let snapshot=structuredClone(market);snapshot.fetchedAt=Date.now()/1000;for(const q of Object.values(snapshot.quotes))q.timestamp=snapshot.fetchedAt;
 await page.route('**/data/market.json*',r=>r.fulfill({json:snapshot}));await page.goto('/');await page.locator('#configureAlerts').click();await page.locator('#ruleSymbol').selectOption('NVDA');await page.locator('#threshold').fill('1');await page.getByRole('button',{name:'Add rule',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();snapshot.fetchedAt+=1;await page.locator('#refresh').click();await expect(page.locator('#alerts')).toContainText('NVDA: price above');await expect(page.locator('#toasts')).toContainText('NVDA');const oldValue=await page.locator('#total').innerText();snapshot.quotes.NVDA.price*=2;snapshot.fetchedAt+=1;await page.locator('#refresh').click();await expect(page.locator('#total')).not.toHaveText(oldValue);await expect(page.locator('#toasts .toast')).toHaveCount(1);await page.reload();await expect(page.locator('#alerts')).toContainText('NVDA: price above');await expect(page.locator('#toasts .toast')).toHaveCount(0);
});
test('failed refresh retains prior data and reports the failure',async({page})=>{
 await page.goto('/');await expect(page.locator('#coverage')).toContainText('38/39');const value=await page.locator('#total').innerText();await page.route('**/data/market.json*',r=>r.fulfill({status:503,body:'Unavailable'}));await page.locator('#refresh').click();await expect(page.locator('#feedTime')).toContainText('Refresh failed');expect(await page.locator('#total').innerText()).toBe(value);
});
