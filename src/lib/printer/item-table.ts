import type {PrintBlock,PrintItemRow} from './layout';

// Share the same columns in the settings preview and browser print document.
export const receiptItemStyles=`.receipt-items,.receipt-details{display:grid;column-gap:.6em;text-align:left;white-space:normal;font-variant-numeric:tabular-nums}.receipt-item{display:contents}.receipt-item-quantity,.receipt-item-amount{white-space:nowrap}.receipt-item-name{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}.receipt-item-amount{text-align:right}.receipt-details-metadata .receipt-item-amount{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}.receipt-details{break-inside:avoid}`;
export function itemTableColumns(rows:PrintItemRow[],detailMode?:PrintBlock['detailMode']){
 const quantity=Math.max(1,...rows.map(row=>row.quantity.length));
 const amount=Math.max(4,...rows.map(row=>row.amount.length));
 return detailMode==='metadata'?'4.5em minmax(0,1fr)':detailMode==='amounts'?`minmax(0,1fr) ${amount}ch`:`${quantity}ch minmax(0,1fr) ${amount}ch`;
}
export function appendItemTable(container:HTMLElement,block:PrintBlock){
 const rows=block.rows??[],doc=container.ownerDocument;
 container.classList.add(block.kind==='details'?'receipt-details':'receipt-items');if(block.detailMode)container.classList.add(`receipt-details-${block.detailMode}`);container.style.gridTemplateColumns=itemTableColumns(rows,block.detailMode);
 container.style.paddingTop=`${block.before??0}lh`;container.style.paddingBottom=`${block.after??0}lh`;
 for(const row of rows){
  const item=doc.createElement('div');item.className='receipt-item';
  for(const column of ['quantity','name','amount'] as const){if(column==='quantity'&&block.kind==='details')continue;const cell=doc.createElement('span');cell.className=`receipt-item-${column}`;cell.textContent=row[column];item.append(cell);}
  container.append(item);
 }
}

// Measure whole graphemes so Thai vowels and tone marks stay with their base.
export function wrapMeasuredText(text:string,width:number,measure:(text:string)=>number){
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){
  let line='';
  for(const {segment} of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(paragraph)){
   if(line&&measure(line+segment)>width){lines.push(line);line='';}
   line+=segment;
  }
  lines.push(line);
 }
 return lines;
}
