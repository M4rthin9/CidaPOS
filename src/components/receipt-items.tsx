import type {PrintBlock} from '@/lib/printer/layout';
import {itemTableColumns} from '@/lib/printer/item-table';

export default function ReceiptItems({block}:{block:PrintBlock}){
 const rows=block.rows??[];
 return <div className={block.kind==='details'?`receipt-details receipt-details-${block.detailMode}`:'receipt-items'} style={{gridTemplateColumns:itemTableColumns(rows,block.detailMode),paddingTop:`${block.before??0}lh`,paddingBottom:`${block.after??0}lh`}}>{rows.map((row,index)=><div className="receipt-item" key={index}>{block.kind!=='details'&&<span className="receipt-item-quantity">{row.quantity}</span>}<span className="receipt-item-name">{row.name}</span><span className="receipt-item-amount">{row.amount}</span></div>)}</div>;
}
