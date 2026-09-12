import test from 'node:test';
import assert from 'node:assert/strict';
import {detectHoldings} from '../public/holdings-upload.js';
const assets=[{symbol:'NVDA'},{symbol:'SOL',name:'Solana'},{symbol:'JitoSOL',name:'Jito Staked SOL'},{symbol:'PI',name:'Pi Network'}];
test('reads explicit quantities and multi-line labels, ignoring dollar values',()=>{
 const result=detectHoldings('NVDA\nMarket value $7,200\nShares\n52.52645\nAverage cost $14.10\nSOL\n15.934 SOL\nPI\nAvailable balance 1,036.66\nTotal balance 1,037.65',assets);
 assert.deepEqual(result.map(r=>[r.symbol,r.quantity]),[['NVDA',52.52645],['SOL',15.934],['PI',1037.65]]);
});
test('repeated screenshot totals are idempotent and conflicts require correction',()=>{
 assert.equal(detectHoldings('NVDA 52 shares\nNVDA 52 shares',assets)[0].quantity,52);
 assert.deepEqual(detectHoldings('NVDA 52 shares\nNVDA 53 shares',assets)[0],{symbol:'NVDA',quantity:null,conflict:true});
});
test('unknown symbols and screenshot boundaries cannot inherit previous assets',()=>{
 assert.deepEqual(detectHoldings('NVDA\nETH\n10 coins\n===SCREENSHOT===\nBalance 20',assets),[]);
 assert.deepEqual(detectHoldings('SOL\n$101.20\n24h +3.2%\nPrice 103.1\nAvailable 20 coins',assets),[]);
});
test('staked SOL stays separate and zero balances are accepted',()=>{
 assert.deepEqual(detectHoldings('Jito Staked SOL\n31.76 JitoSOL\nSolana\n0 SOL',assets).map(r=>[r.symbol,r.quantity]),[['SOL',0],['JitoSOL',31.76]]);
});

test('signed changes and malformed grouped numbers are not totals',()=>{assert.deepEqual(detectHoldings('SOL\n+15 SOL\n123,45 SOL',assets),[]);});
