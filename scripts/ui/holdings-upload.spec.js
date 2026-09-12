import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/feed-config.json',r=>r.fulfill({json:{priceEndpoint:null,priceRefreshSeconds:120}}));});
test('real text reader recognizes a clear holdings screenshot',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');await page.getByRole('button',{name:'Update holdings from screenshots'}).click();
 const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=350;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,350);ctx.fillStyle='black';ctx.font='48px Arial';ctx.fillText('NVDA',50,80);ctx.fillText('52.52645 shares',50,150);ctx.fillText('SOL',50,230);ctx.fillText('15.934 SOL',50,300);return canvas.toDataURL('image/png').split(',')[1];});
 await page.locator('#holdingsScreenshots').setInputFiles({name:'clear-holdings.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('#scanStatus')).toContainText('Scan complete',{timeout:100000});
 await expect(page.getByRole('spinbutton',{name:'New total NVDA',exact:true})).toHaveValue('52.52645');
 await expect(page.getByRole('spinbutton',{name:'New total SOL',exact:true})).toHaveValue('15.934');
});
test('uploads screenshots, reviews totals and replaces quantities without double counting',async({page})=>{
 await page.addInitScript(()=>{window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:'NVDA\n52.52645 shares\nSOL\n15.934 SOL'}}),terminate:async()=>{}})};});
 await page.goto('/');await expect(page.locator('#coverage')).toContainText('38/38');
 await page.getByRole('button',{name:'Update holdings from screenshots'}).click();
 await page.locator('#holdingsScreenshots').setInputFiles({name:'holdings.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lAAAAABJRU5ErkJggg==','base64')});
 await expect(page.locator('#scanStatus')).toContainText('Scan complete');
 await expect(page.getByRole('spinbutton',{name:'New total NVDA',exact:true})).toHaveValue('52.52645');
 await expect(page.locator('#saveScreenshotTotals')).toBeDisabled();
 await page.getByRole('spinbutton',{name:'Average cost NVDA',exact:true}).fill('14.2');
 await page.locator('#confirmScreenshotTotals').check();await page.locator('#saveScreenshotTotals').click();
 await expect(page.locator('[data-symbol="NVDA"]')).toContainText('52.52645');
 await page.reload();await expect(page.locator('[data-symbol="SOL"]')).toContainText('15.934');
 await page.getByRole('button',{name:'Update holdings from screenshots'}).click();
 await page.getByText('Review or correct extracted text',{exact:true}).click();await page.locator('#screenshotText').fill('NVDA 52.52645 shares\nSOL 15.934 SOL');await page.locator('#parseScreenshotText').click();await page.locator('#confirmScreenshotTotals').check();await page.locator('#saveScreenshotTotals').click();
 await expect(page.locator('[data-symbol="NVDA"]')).toContainText('52.52645');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('gonzo.portfolio.v1')));expect(state.holdings.stocks.find(h=>h.symbol==='NVDA').cost).toBe(14.2);
});
test('conflicting reads need correction and PI validation prevents partial writes',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Update holdings from screenshots'}).click();
 await page.getByText('Review or correct extracted text',{exact:true}).click();await page.locator('#screenshotText').fill('NVDA 52 shares\nNVDA 53 shares\nPI\nTotal balance 1,000');await page.locator('#parseScreenshotText').click();
 await expect(page.getByRole('checkbox',{name:'Update NVDA',exact:true})).not.toBeChecked();
 await page.getByRole('spinbutton',{name:'New total NVDA',exact:true}).fill('53');await page.locator('#confirmScreenshotTotals').check();await page.locator('#saveScreenshotTotals').click();
 await expect(page.locator('#uploadError')).toContainText('Available PI cannot exceed');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('gonzo.portfolio.v1')).holdings.stocks.find(h=>h.symbol==='NVDA').quantity)).toBe(50.52645);
 await page.locator('#uploadPiAvailable').fill('999');await page.locator('#confirmScreenshotTotals').check();await page.locator('#saveScreenshotTotals').click();await expect(page.locator('[data-symbol="NVDA"]')).toContainText('53');
});
