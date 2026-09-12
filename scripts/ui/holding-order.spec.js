import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const market=JSON.parse(fs.readFileSync(new URL('../../public/data/market.json',import.meta.url)));
for(const path of ['/','/mobile/','/friends/','/friends/mobile/']){
test('holdings descend by value and reorder after edits: '+path,async({page})=>{
await page.route('**/feed-config.json',r=>r.fulfill({json:{priceEndpoint:null}}));await page.route('**/data/market.json*',r=>r.fulfill({json:market}));
if(path.includes('friends')){
await page.addInitScript(()=>localStorage.setItem('gonzo.friends.portfolio.v1',JSON.stringify({holdings:{stocks:[{symbol:'AAPL',quantity:1,cost:null},{symbol:'MSFT',quantity:3,cost:null}],crypto:[{symbol:'BTC',id:'bitcoin',quantity:.1,cost:null},{symbol:'ETH',id:'ethereum',quantity:2,cost:null}],metadata:{}},rules:[]})));
await page.route('**/friends/api/**',r=>r.fulfill({json:{schema:1,fetchedAt:Date.now()/1000,news:[],newsStatus:'connected',quotes:{AAPL:{price:10,timestamp:Date.now()/1000},MSFT:{price:10,timestamp:Date.now()/1000},BTC:{price:100,timestamp:Date.now()/1000},ETH:{price:100,timestamp:Date.now()/1000}},issues:[]}}));
}
await page.goto(path);await expect(page.locator('#coverage')).toContainText('valued');
async function ordered(){for(const id of ['stocks','cryptos']){const values=await page.locator('#'+id+' .holding div:nth-child(3) b').allTextContents();const numbers=values.filter(v=>v.startsWith('$')).map(v=>Number(v.replace(/[^0-9.]/g,'')));expect(numbers).toEqual([...numbers].sort((a,b)=>b-a));}}
await ordered();const symbol=path.includes('friends')?'AAPL':'NVDA';await page.locator('[data-symbol="'+symbol+'"]').click();await page.locator('#quantity').fill('999999');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('#stocks .holding').first()).toHaveAttribute('data-symbol',symbol);await ordered();
});}
