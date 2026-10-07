import {randomUUID,createHash} from 'node:crypto';
import {bindings} from './cloudflare';
export type StoredArchive={storage:'r2';key:string;sha256:string;size:number;version:1};
export async function putArchive(id:string,payload:unknown):Promise<StoredArchive>{
 const body=JSON.stringify(payload),key=`sales-archives/${id}.json`,sha256=createHash('sha256').update(body).digest('hex');
 const {FILES}=await bindings();
 await FILES.put(key,body,{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{sha256}});
 const stored=await FILES.get(key);if(!stored||createHash('sha256').update(await stored.text()).digest('hex')!==sha256)throw new Error('R2 archive verification failed');
 return {storage:'r2',key,sha256,size:new TextEncoder().encode(body).length,version:1};
}
export async function readArchive(pointer:StoredArchive){const {FILES}=await bindings();const object=await FILES.get(pointer.key);if(!object)throw new Error('R2 archive is missing');const body=await object.text();if(createHash('sha256').update(body).digest('hex')!==pointer.sha256)throw new Error('R2 archive checksum mismatch');return JSON.parse(body);}
export async function removeArchive(key:string){const {FILES}=await bindings();await FILES.delete(key);}
export async function putImage(file:File,kind:'products'|'logos'){
 if(!file.size||file.size>2_000_000)throw new Error('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 const extension=png?'png':jpeg?'jpg':webp?'webp':null;
 if(!extension)throw new Error('รองรับเฉพาะภาพ PNG, JPEG และ WebP');
 const key=`${kind}/${randomUUID()}.${extension}`,contentType=png?'image/png':jpeg?'image/jpeg':'image/webp';
 const {FILES}=await bindings();await FILES.put(key,bytes,{httpMetadata:{contentType,cacheControl:'private, max-age=3600'}});
 return {url:`/api/media/${kind}/${key.split('/')[1]}`};
}
