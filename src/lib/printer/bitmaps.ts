'use client';
import type {PrintBlock} from './layout';
import {wrapMeasuredText} from './item-table';
import {receiptFontFamily} from './appearance';

export async function itemTableBitmap(block:PrintBlock,width:number,size:number,lineSpacing:number){
 await document.fonts.load(`${block.bold?'bold ':''}${size}px "Receipt Sarabun"`);await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,rows=block.rows??[];
 const font=(fontSize:number)=>`${block.bold?'bold ':''}${fontSize}px ${receiptFontFamily}`;
 ctx.font=font(size);
 const measure=(text:string)=>ctx.measureText(text).width;
 const isDetails=block.kind==='details',isMetadata=block.detailMode==='metadata';
 const quantityWidth=isDetails?0:Math.max(size*.6,...rows.map(row=>measure(row.quantity)));
 const amountWidth=Math.max(size*2.4,...rows.map(row=>measure(row.amount)));
 // Keep room for a readable name even at large configured font sizes.
 size*=Math.min(1,width/(isMetadata?size*9.1:quantityWidth+amountWidth+size*4));ctx.font=font(size);
 const gap=size*.6;
 const amountSpace=isMetadata?width-size*4.5-gap:Math.max(size*2.4,...rows.map(row=>measure(row.amount)));
 const actualNameX=isDetails?0:Math.max(size*.6,...rows.map(row=>measure(row.quantity)))+gap;
 const nameWidth=width-actualNameX-amountSpace-gap,lineHeight=size*1.65*lineSpacing;
 const wrapped=rows.map(row=>({...row,lines:wrapMeasuredText(row.name,nameWidth,measure),values:isMetadata?wrapMeasuredText(row.amount,amountSpace,measure):[row.amount]}));
 canvas.width=width;canvas.height=Math.ceil(((block.before??0)+(block.after??0)+wrapped.reduce((sum,row)=>sum+Math.max(row.lines.length,row.values.length),0))*lineHeight+size*.5);
 ctx.fillStyle='white';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='black';ctx.font=font(size);
 let y=(block.before??0)*lineHeight+size*1.3;
 for(const row of wrapped){ctx.textAlign='left';if(!isDetails)ctx.fillText(row.quantity,0,y);row.lines.forEach((line,index)=>ctx.fillText(line,actualNameX,y+index*lineHeight));ctx.textAlign='right';row.values.forEach((line,index)=>ctx.fillText(line,width,y+index*lineHeight));y+=Math.max(row.lines.length,row.values.length)*lineHeight;}
 return canvas.toDataURL('image/png');
}
export async function imageBitmap(source:string,width:number){const img=new Image();img.src=source;await img.decode();const scale=Math.min(1,(width*0.65)/img.width,120/img.height);const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<pixels.data.length;i+=4){const value=pixels.data[i]*.299+pixels.data[i+1]*.587+pixels.data[i+2]*.114<160?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');}
export async function textBitmap(block:PrintBlock,width:number,size:number,lineSpacing:number){
 await document.fonts.load(`${block.bold?'bold ':''}${size}px "Receipt Sarabun"`);await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!,font=`${block.bold?'bold ':''}${size}px ${receiptFontFamily}`;
 ctx.font=font;const lines=wrapMeasuredText(block.text,width,text=>ctx.measureText(text).width),lineHeight=size*1.5*lineSpacing;
 canvas.width=width;canvas.height=Math.ceil(lines.length*lineHeight+size*.5);
 ctx.fillStyle='white';ctx.fillRect(0,0,width,canvas.height);ctx.fillStyle='black';ctx.font=font;
 ctx.textAlign=block.align==='CENTER'?'center':block.align==='RIGHT'?'right':'left';
 lines.forEach((line,index)=>ctx.fillText(line,block.align==='CENTER'?width/2:block.align==='RIGHT'?width:0,size*1.3+index*lineHeight));
 return canvas.toDataURL('image/png');
}
