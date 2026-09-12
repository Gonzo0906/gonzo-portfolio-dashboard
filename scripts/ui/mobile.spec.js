import {test,expect} from '@playwright/test';
for(const [width,height] of [[390,844],[360,800],[412,915],[320,568],[844,390]]){
test('mobile holdings fit '+width+'x'+height,async({page})=>{
await page.setViewportSize({width,height});await page.route('**/feed-config.json',r=>r.fulfill({json:{priceEndpoint:null}}));await page.goto('/mobile/');
await expect(page.locator('#coverage')).toContainText('38/38');await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(requestAnimationFrame));
await expect(page.locator('#stocks .holding')).toHaveCount(24);await expect(page.locator('#cryptos .holding')).toHaveCount(14);
const result=await page.evaluate(()=>{const d=document.documentElement;const clipped=[...document.querySelectorAll('.holding b,.holding small')].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none').filter(el=>{const r=document.createRange();r.selectNodeContents(el);const a=r.getBoundingClientRect(),b=el.closest('.holding').getBoundingClientRect();return a.left<b.left-1||a.right>b.right+1||a.top<b.top-1||a.bottom>b.bottom+1;}).map(el=>el.textContent);return {w:d.scrollWidth,h:d.scrollHeight,clipped};});
expect(result.w).toBeLessThanOrEqual(width);expect(result.h).toBeLessThanOrEqual(height);expect(result.clipped).toEqual([]);
});
}
test('mobile and original dashboard share edits on the same browser',async({page})=>{
await page.route('**/feed-config.json',r=>r.fulfill({json:{priceEndpoint:null}}));await page.goto('/mobile/');await expect(page.locator('#coverage')).toContainText('38/38');
await page.locator('[data-symbol="NVDA"]').click();await page.locator('#quantity').fill('55');await page.getByRole('button',{name:'Save changes',exact:true}).click();
await page.goto('/');await expect(page.locator('#coverage')).toContainText('38/38');await page.locator('[data-symbol="NVDA"]').click();await expect(page.locator('#quantity')).toHaveValue('55');
});