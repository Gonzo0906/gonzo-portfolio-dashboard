import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const initial=JSON.parse(fs.readFileSync(new URL('../../public/data/market.json',import.meta.url)));
test('configured minute feed fetches providers on the 120-second timer and updates valuation',async({page})=>{
 await page.clock.install();let requests=0;
 await page.route('**/feed-config.json',r=>r.fulfill({json:{priceEndpoint:'https://quote-backend.example.test/prices',priceRefreshSeconds:120}}));
 await page.route('https://quote-backend.example.test/prices',r=>{requests++;const d=structuredClone(initial);d.fetchedAt=initial.fetchedAt+requests*120;d.refreshSeconds=120;d.quotes.NVDA.price=initial.quotes.NVDA.price+requests;return r.fulfill({json:d});});
 await page.goto('/');await expect(page.locator('#coverage')).toContainText('38/38');await expect(page.locator('#feedTime')).toContainText('2m prices');const total=await page.locator('#total').innerText();expect(requests).toBe(1);
 await page.clock.fastForward(119000);expect(requests).toBe(1);await page.clock.fastForward(2000);await expect.poll(()=>requests).toBe(2);await expect(page.locator('#total')).not.toHaveText(total);
});
test('unconfigured backend does not advertise two-minute provider fetches',async({page})=>{
 await page.route('**/feed-config.json',r=>r.fulfill({json:{priceEndpoint:null,priceRefreshSeconds:120}}));await page.goto('/');await expect(page.locator('#coverage')).toContainText('38/38');await expect(page.locator('#feedTime')).toContainText('15m snapshot');await page.locator('#feedDetails').click();await expect(page.locator('#dialogBody')).toContainText('Two-minute price backend is not connected yet');
});
