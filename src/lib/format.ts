import { Currency } from './types';
export const money=(amount:number,currency:Currency)=>new Intl.NumberFormat(currency==='NGN'?'en-NG':'en-US',{style:'currency',currency,maximumFractionDigits:currency==='NGN'?0:2}).format(amount);
