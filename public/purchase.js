export function purchaseUpdate(holding,amount,price=null,currentQuantity=holding.quantity){
 if(!Number.isFinite(amount)||amount<=0)throw Error('Enter a quantity greater than zero.');
 if(!Number.isFinite(currentQuantity)||currentQuantity<0)throw Error('Enter your existing quantity first.');
 if(price!==null&&(!Number.isFinite(price)||price<0))throw Error('Enter a valid purchase price or leave it blank.');
 const quantity=currentQuantity+amount;
 if(!Number.isFinite(quantity)||quantity<=currentQuantity)throw Error('Quantity is too large or too small.');
 const cost=currentQuantity===0?price:price!==null&&Number.isFinite(holding.cost)?(currentQuantity*holding.cost+amount*price)/quantity:null;
 if(cost!==null&&!Number.isFinite(cost))throw Error('Purchase cost is too large.');
 return {quantity,cost};
}
