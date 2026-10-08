import type {Profile} from '../config';

export const receiptFontFamily='"Receipt Sarabun",Tahoma,sans-serif';
export const receiptFontFaces=[['Regular',400],['Medium',500],['Bold',700]].map(([file,weight])=>`@font-face{font-family:"Receipt Sarabun";src:url('/fonts/Sarabun-${file}.ttf') format('truetype');font-weight:${weight};font-style:normal}`).join('');
export const receiptSizeScale={SMALL:.85,NORMAL:1,LARGE:1.2,EXTRA_LARGE:1.65};

export function receiptGeometry(profile:Profile){
 const paperMm=Number(profile.paperMm);
 // Browser paper size is independent of the native printer's dot width.
 const insetMm=2.5+profile.margin/8;
 return {paperMm,insetMm,contentMm:paperMm-insetMm*2,fontMm:profile.fontSize/8,feedMm:profile.feed/8};
}
export const receiptPreviewStyles=`${receiptFontFaces}.receipt-paper{font-family:${receiptFontFamily};color:#000;font-variant-numeric:tabular-nums;padding:18px 12.5px}.receipt-paper>div{line-height:1.5;margin-bottom:3px}.receipt-paper .receipt-divider{margin:8px 0;border-top:1px dashed #555}.receipt-paper img{display:block;margin-inline:auto}`;
