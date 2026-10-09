/** Legacy raster command used by ESC/POS-compatible receipt printers. */
export function rasterPackets(pixels:Uint8ClampedArray,width:number,height:number){
 if(!Number.isSafeInteger(width)||width<1||width>576||!Number.isSafeInteger(height)||height<1||height>30000||pixels.length!==width*height*4)throw new Error('Invalid receipt bitmap');
 const stride=Math.ceil(width/8),packets:Uint8Array<ArrayBuffer>[]=[];
 // Keep each command below the TP-3260VL's 8 KB receive buffer.
 for(let start=0;start<height;start+=48){
  const rows=Math.min(48,height-start),packet=new Uint8Array(8+stride*rows);
  packet.set([0x1d,0x76,0x30,0,stride&255,stride>>8,rows&255,rows>>8]);
  for(let y=0;y<rows;y++)for(let x=0;x<width;x++){
   const i=((start+y)*width+x)*4,alpha=pixels[i+3]/255;
   const luminance=(pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)*alpha+255*(1-alpha);
   if(luminance<170)packet[8+y*stride+(x>>3)]|=0x80>>(x&7);
  }
  packets.push(packet);
 }
 return packets;
}
