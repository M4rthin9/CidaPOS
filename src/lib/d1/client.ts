import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import modelData from './models.json';

type Row=Record<string,any>;
type Args={where?:Row;data?:Row;create?:Row;update?:Row;include?:Row;select?:Row;orderBy?:Row|Row[];take?:number;skip?:number};
type Field={type:string;nullable:boolean;default?:string;updated?:boolean};
type Model={primary:string;fields:Record<string,Field>;relations:Record<string,{model:string;many:boolean;local:string;foreign:string}>};
const models=modelData as Record<string,Model>;
export type Statement={sql:string;params:unknown[]};
export interface D1Connection {all(sql:string,params?:unknown[]):Promise<Row[]>;batch(statements:Statement[]):Promise<void>}
export class DatabaseError extends Error {constructor(public code:string,message:string){super(message);}}
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const scalar=(value:any)=>value instanceof Date?value.getTime():typeof value==='boolean'?Number(value):value;
const clone=<T>(value:T):T=>structuredClone(value);
function encode(value:any,field:Field){return value===null?null:field.type==='Json'?JSON.stringify(value):scalar(value);}
function decode(row:Row,model:Model){const result:Row={};for(const [key,field] of Object.entries(model.fields)){const value=row[key];result[key]=value==null?null:field.type==='Json'?JSON.parse(value):field.type==='Boolean'?Boolean(value):field.type==='DateTime'?new Date(typeof value==='number'?value:value.includes('T')?value:value.replace(' ','T')+'Z'):value;}return result;}
function fieldValue(value:any,field:Field){if(value===undefined){if(field.updated||field.default==='now()')return new Date();if(field.default==='cuid()')return randomUUID();if(field.default!==undefined)return JSON.parse(field.default);if(field.nullable)return null;throw new DatabaseError('P2012','Missing required field');}return clone(value);}
function compareValue(actual:any,test:any):boolean{
 if(test===undefined)return true;
 if(test===null||typeof test!=='object'||test instanceof Date)return scalar(actual)===scalar(test);
 return Object.entries(test).every(([op,value]:[string,any])=>{
  const a=scalar(actual),v=scalar(value);
  if(op==='equals')return a===v;if(op==='not')return !compareValue(actual,value);
  if(op==='in'||op==='notIn'){const found=value.some((x:any)=>scalar(x)===a);return op==='in'?found:!found;}
  if(op==='gte')return a>=v;if(op==='gt')return a>v;if(op==='lte')return a<=v;if(op==='lt')return a<v;
  if(op==='contains')return String(actual??'').toLowerCase().includes(String(value).toLowerCase());
  if(op==='startsWith')return String(actual??'').toLowerCase().startsWith(String(value).toLowerCase());
  if(op==='mode')return true;throw new Error('Unsupported predicate '+op);
 });
}
function whereSql(name:string,where:Row={},params:unknown[]=[],alias=name):string{
 const model=models[name],parts:string[]=[];
 for(const [key,value] of Object.entries(where)){
  if(value===undefined)continue;
  if(['AND','OR','NOT'].includes(key)){const entries=Array.isArray(value)?value:[value];const expression=entries.map((v:Row)=>'('+whereSql(name,v,params,alias)+')').join(key==='OR'?' OR ':' AND ');parts.push(key==='NOT'?'NOT ('+(expression||'1')+')':expression|| (key==='OR'?'0':'1'));continue;}
  const relation=model.relations[key];
  if(relation){const nested=relation.many?(value.some??value.none??value.every):value.is??value;const childAlias=alias+'_'+key;const condition=whereSql(relation.model,nested,params,childAlias);const all=relation.many&&value.every!==undefined;const exists=`EXISTS (SELECT 1 FROM ${quote(relation.model)} ${quote(childAlias)} WHERE ${quote(childAlias)}.${quote(relation.foreign)}=${quote(alias)}.${quote(relation.local)} AND ${all?'NOT ('+condition+')':condition})`;parts.push(value.none!==undefined||all?'NOT '+exists:exists);continue;}
  if(!model.fields[key]){if(key.includes('_')&&typeof value==='object'){parts.push(whereSql(name,value,params,alias));continue;}throw new Error('Unknown column '+name+'.'+key);}
  const column=quote(alias)+'.'+quote(key),field=model.fields[key];
  const predicate=(op:string,v:any):string=>{
   if(op==='mode')return '1';
   if(op==='not')return 'NOT ('+(v!==null&&typeof v==='object'&&!(v instanceof Date)?Object.entries(v).map(([o,x])=>predicate(o,x)).join(' AND '):predicate('equals',v))+')';
   if(op==='in'||op==='notIn'){params.push(JSON.stringify(v.map((x:any)=>encode(x,field))));return `${column} ${op==='notIn'?'NOT ':''}IN (SELECT value FROM json_each(?))`;}
   if(v===null)return column+(op==='equals'?' IS NULL':' IS NOT NULL');
   if(op==='contains'||op==='startsWith'){params.push((op==='contains'?'%':'')+String(v).replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%');return `${column} LIKE ? ESCAPE '\\'`;}
   const operators:Record<string,string>={equals:'=',gt:'>',gte:'>=',lt:'<',lte:'<='};if(!operators[op])throw new Error('Unsupported predicate '+op);params.push(encode(v,field));return column+' '+operators[op]+' ?';
  };
  parts.push(value!==null&&typeof value==='object'&&!(value instanceof Date)?Object.entries(value).map(([op,v])=>predicate(op,v)).join(' AND '):predicate('equals',value));
 }
 return parts.filter(Boolean).join(' AND ')||'1';
}
function sortRows(rows:Row[],orderBy?:Row|Row[]){for(const order of (Array.isArray(orderBy)?orderBy:[orderBy]).filter(Boolean).reverse())for(const [field,direction] of Object.entries(order!))rows.sort((a,b)=>{const x=scalar(a[field]),y=scalar(b[field]);return (x===y?0:x==null?-1:y==null?1:x<y?-1:1)*(direction==='desc'?-1:1);});return rows;}
class Transaction {
 private pending=new Map<string,Map<string,Row|null>>();
 private cache=new Map<string,Map<string,Row|null>>();
 private complete=new Set<string>();
 private statements:Statement[]=[];
 private rollback:Array<()=>Promise<void>>=[];
 private purpose='NORMAL';private archiveId:string|null=null;
 readonly facade:PrismaClient;
 constructor(private connection:D1Connection,private revision:number){
  const delegates:Row={};for(const name of Object.keys(models)){const methods:Row={};for(const method of ['findMany','findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','count','create','update','updateMany','delete','deleteMany','upsert','createMany'])methods[method]=(args:Args={})=>this.call(name,method,args);delegates[name[0].toLowerCase()+name.slice(1)]=methods;}
  delegates.$queryRaw=(strings:TemplateStringsArray,...values:any[])=>this.raw(strings,values,false);
  delegates.$executeRaw=(strings:TemplateStringsArray,...values:any[])=>this.raw(strings,values,true);
  delegates.$resetPurpose=(id:string)=>{this.purpose='SALES_RESET';this.archiveId=id;};
  delegates.$onRollback=(callback:()=>Promise<void>)=>this.rollback.push(callback);
  this.facade=delegates as PrismaClient;
 }
 private state(name:string){let map=this.pending.get(name);if(!map){map=new Map();this.pending.set(name,map);}return map;}
 private remember(name:string,rows:Row[]){let map=this.cache.get(name);if(!map){map=new Map();this.cache.set(name,map);}for(const row of rows)map.set(String(row[models[name].primary]),clone(row));}
 private async matches(name:string,row:Row,where:Row={}):Promise<boolean>{
  for(const [key,value] of Object.entries(where)){
   if(value===undefined)continue;
   if(['AND','OR','NOT'].includes(key)){const tests=await Promise.all((Array.isArray(value)?value:[value]).map((w:Row)=>this.matches(name,row,w)));if(key==='OR'?!tests.some(Boolean):key==='NOT'?tests.every(Boolean):!tests.every(Boolean))return false;continue;}
   const relation=models[name].relations[key];
   if(relation){const related=await this.find(name,key,row);const list=relation.many?related:related?[related]:[];const nested=relation.many?(value.some??value.none??value.every):value.is??value;const tests=await Promise.all(list.map((r:Row)=>this.matches(relation.model,r,nested)));if(value.none!==undefined?tests.some(Boolean):value.every!==undefined?!tests.every(Boolean):!tests.some(Boolean))return false;}
   else if(!models[name].fields[key]&&key.includes('_')){if(!await this.matches(name,row,value))return false;}
   else if(!compareValue(row[key],value))return false;
  }return true;
 }
 private async rows(name:string,where:Row={},options?:Args){
  if(this.complete.has(name)){
   const current=new Map(this.cache.get(name));for(const [id,row] of this.pending.get(name)??[])current.set(id,row);
   const values:Row[]=[];for(const row of current.values())if(row&&await this.matches(name,row,where))values.push(clone(row));
   return options?sortRows(values,options.orderBy).slice(options.skip??0,options.take===undefined?undefined:(options.skip??0)+options.take):values;
  }
  const primary=models[name].primary;
  if(Object.keys(where).length===1&&where[primary]!=null&&typeof where[primary]!=='object'){
   const id=String(where[primary]),pending=this.pending.get(name),cache=this.cache.get(name);
   if(pending?.has(id)||cache?.has(id)){const row=pending?.has(id)?pending.get(id):cache?.get(id);return row?[clone(row)]:[];}
  }
  const params:unknown[]=[],paging=options&&!this.pending.get(name)?.size;
  let sql=`SELECT * FROM ${quote(name)} WHERE ${whereSql(name,where,params)}`;
  if(paging){
   const order=(Array.isArray(options.orderBy)?options.orderBy:[options.orderBy]).filter(Boolean).flatMap(row=>Object.entries(row!)).map(([field,direction])=>{if(!models[name].fields[field]||!['asc','desc'].includes(String(direction)))throw new Error('Invalid ordering');return quote(field)+' '+direction;});
   if(order.length)sql+=' ORDER BY '+order.join(',');
   if(options.take!==undefined||options.skip!==undefined){sql+=' LIMIT ? OFFSET ?';params.push(options.take??-1,options.skip??0);}
  }
  const rows=(await this.connection.all(sql,params)).map(row=>decode(row,models[name]));
  this.remember(name,rows);
  if(!Object.keys(where).length&&options?.take===undefined&&!options?.skip)this.complete.add(name);
  const state=this.pending.get(name);if(!state?.size)return rows;
  const result=new Map(rows.map(row=>[String(row[models[name].primary]),row]));
  for(const [id,row] of state){result.delete(id);if(row&&await this.matches(name,row,where))result.set(id,clone(row));}
  const values=[...result.values()];return options?sortRows(values,options.orderBy).slice(options.skip??0,options.take===undefined?undefined:(options.skip??0)+options.take):values;
 }
 private async find(name:string,key:string,row:Row){const relation=models[name].relations[key];const result=await this.rows(relation.model,{[relation.foreign]:row[relation.local]});return relation.many?result:result[0]??null;}
 private async project(name:string,rows:Row[],args:Args){
  const relations=Object.entries(args.include??args.select??{}).filter(([key,value])=>value&&models[name].relations[key]);
  // Eager-load each relation once for all parents; no query per historical bill.
  const loaded=new Map<string,Row[]>();
  if(rows.length&&relations.length){
   const reads=relations.map(([key])=>{const rel=models[name].relations[key],params:unknown[]=[];const where={[rel.foreign]:{in:[...new Set(rows.map(row=>row[rel.local]))]}};return {key,model:rel.model,where,params,sql:whereSql(rel.model,where,params)};});
   const sql=reads.map((read,i)=>{const fields=Object.keys(models[read.model].fields);const chunks=[];for(let n=0;n<fields.length;n+=15)chunks.push('json_object('+fields.slice(n,n+15).map(f=>`'${f}',${quote(f)}`).join(',')+')');const object=chunks.reduce((a,b)=>`json_patch(${a},${b})`);return `SELECT ${i} AS relation,${object} AS data FROM ${quote(read.model)} WHERE ${read.sql}`;}).join(' UNION ALL ');
   const data=await this.connection.all(sql,reads.flatMap(read=>read.params));
   for(const [i,read] of reads.entries()){
    const decoded=data.filter(r=>Number(r.relation)===i).map(r=>decode(JSON.parse(r.data),models[read.model]));this.remember(read.model,decoded);
    const result=new Map(decoded.map(row=>[String(row[models[read.model].primary]),row] as const));
    for(const [id,row] of this.pending.get(read.model)??[]){result.delete(id);if(row&&await this.matches(read.model,row,read.where))result.set(id,clone(row));}
    loaded.set(read.key,[...result.values()]);
   }
  }
  const result:Row[]=[];
  for(const row of rows){const value=args.select?Object.fromEntries(Object.entries(args.select).filter(([key,v])=>v&&models[name].fields[key]).map(([key])=>[key,row[key]])):clone(row);
   for(const [key,options] of relations){const relation=models[name].relations[key];const opts:Args=options===true?{}:options;let children=(loaded.get(key)??[]).filter(child=>child[relation.foreign]===row[relation.local]);if(opts.where){const match=await Promise.all(children.map(child=>this.matches(relation.model,child,opts.where)));children=children.filter((_,i)=>match[i]);}children=sortRows(children,opts.orderBy).slice(opts.skip??0,opts.take===undefined?undefined:(opts.skip??0)+opts.take);const projected=await this.project(relation.model,children,opts);value[key]=relation.many?projected:projected[0]??null;}
   result.push(value);
  }return result;
 }
 private async insert(name:string,data:Row):Promise<Row>{
  const model=models[name],row:Row={};for(const [key,field] of Object.entries(model.fields))row[key]=fieldValue(data[key],field);
  const keys=Object.keys(model.fields);this.statements.push({sql:`INSERT INTO ${quote(name)} (${keys.map(quote).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,params:keys.map(key=>encode(row[key],model.fields[key]))});this.state(name).set(String(row[model.primary]),row);
  for(const [key,relation] of Object.entries(model.relations)){if(!data[key])continue;if(!relation.many)throw new Error('Nested to-one writes are unsupported');const creates=data[key].create;for(const child of Array.isArray(creates)?creates:[creates])if(child)await this.insert(relation.model,{...child,[relation.foreign]:row[relation.local]});}
  return row;
 }
 private async updateRow(name:string,row:Row,data:Row){
  const model=models[name],next=clone(row),changed:string[]=[];
  for(const [key,value] of Object.entries(data)){if(value===undefined)continue;if(!model.fields[key])throw new Error('Unknown update column '+key);if(key===model.primary&&value!==row[key])throw new Error('Primary keys cannot change');const field=model.fields[key];next[key]=field.type!=='Json'&&value!==null&&typeof value==='object'&&!(value instanceof Date)?value.increment!==undefined?row[key]+value.increment:value.decrement!==undefined?row[key]-value.decrement:value.set:clone(value);changed.push(key);}
  for(const [key,field] of Object.entries(model.fields))if(field.updated){next[key]=new Date();if(!changed.includes(key))changed.push(key);}
  if(changed.length)this.statements.push({sql:`UPDATE ${quote(name)} SET ${changed.map(key=>quote(key)+'=?').join(',')} WHERE ${quote(model.primary)}=?`,params:[...changed.map(key=>encode(next[key],model.fields[key])),row[model.primary]]});this.state(name).set(String(row[model.primary]),next);return next;
 }
 async call(name:string,method:string,args:Args):Promise<any>{
  if(method==='create'){const row=await this.insert(name,args.data??{});return (await this.project(name,[row],args))[0];}
  if(method==='createMany'){let count=0;for(const data of (Array.isArray(args.data)?args.data:[args.data])){if(data){await this.insert(name,data);count++;}}return {count};}
  if(method==='upsert'){const row=(await this.rows(name,args.where))[0];const next=row?await this.updateRow(name,row,args.update??{}):await this.insert(name,args.create??{});return (await this.project(name,[next],args))[0];}
  if(method==='count'&&!this.pending.get(name)?.size&&!this.complete.has(name)){const params:unknown[]=[];const [row]=await this.connection.all(`SELECT count(*) AS count FROM ${quote(name)} WHERE ${whereSql(name,args.where,params)}`,params);return Number(row.count);}
  let rows=await this.rows(name,args.where,method.startsWith('find')?args:undefined);if(method==='count')return rows.length;
  if(method==='update'||method==='updateMany'){if(method==='update'&&!rows.length)throw new DatabaseError('P2025','Record not found');const updated=[];for(const row of method==='update'?rows.slice(0,1):rows)updated.push(await this.updateRow(name,row,args.data??{}));return method==='updateMany'?{count:updated.length}:(await this.project(name,updated,args))[0];}
  if(method==='delete'||method==='deleteMany'){if(method==='delete'&&!rows.length)throw new DatabaseError('P2025','Record not found');const deleted=method==='delete'?rows.slice(0,1):rows;const key=models[name].primary;if(deleted.length)this.statements.push({sql:`DELETE FROM ${quote(name)} WHERE ${quote(key)} IN (SELECT value FROM json_each(?))`,params:[JSON.stringify(deleted.map(row=>row[key]))]});for(const row of deleted)this.state(name).set(String(row[key]),null);return method==='deleteMany'?{count:deleted.length}:deleted[0];}
  if(method!=='findMany'){if(!rows.length&&method.endsWith('OrThrow'))throw new DatabaseError('P2025','Record not found');return (await this.project(name,rows.slice(0,1),args))[0]??null;}
  return this.project(name,rows,args);
 }
 private async raw(strings:TemplateStringsArray,params:unknown[],write:boolean){const sql=strings.join('?');if(write){this.statements.push({sql,params:params.map(scalar)});return 0;}if(this.statements.length)throw new Error('Raw reads after staged writes are unsupported');return this.connection.all(sql,params.map(scalar));}
 async abort(){for(const callback of this.rollback)await callback().catch(()=>{});}
 async commit(){
  if(!this.statements.length){const [row]=await this.connection.all('SELECT revision FROM _PosRevision WHERE id=1');if(Number(row.revision)!==this.revision)throw new Error('POS_CONFLICT');return;}
  const id=randomUUID();
  const statements:Statement[]=[];
  // Pack consecutive inserts into a JSON-backed INSERT SELECT. A 100-line
  // receipt therefore uses one item statement and stays below D1 query limits.
  for(let i=0;i<this.statements.length;i++){
   const statement=this.statements[i],match=statement.sql.match(/^INSERT INTO ("\w+") \((.+)\) VALUES \((.+)\)$/);
   if(!match){
    const update=statement.sql.match(/^UPDATE ("\w+") SET (.+) WHERE ("\w+")=\?$/);
    if(!update){statements.push(statement);continue;}
    const group=[statement.params];while(i+1<this.statements.length&&this.statements[i+1].sql===statement.sql&&JSON.stringify(group).length<70_000)group.push(this.statements[++i].params);
    if(group.length===1){statements.push(statement);continue;}
    const columns=update[2].split(',').map(value=>value.replace('=?','')),last=statement.params.length-1;
    statements.push({sql:`WITH _pos_values AS (SELECT ${statement.params.map((_,n)=>`json_extract(value,'$[${n}]') AS v${n}`).join(',')} FROM json_each(?)) UPDATE ${update[1]} SET (${columns.join(',')})=(SELECT ${columns.map((_,n)=>'v'+n).join(',')} FROM _pos_values WHERE v${last}=${update[1]}.${update[3]}) WHERE ${update[3]} IN (SELECT v${last} FROM _pos_values)`,params:[JSON.stringify(group)]});continue;
   }
   const group=[statement.params];while(i+1<this.statements.length&&this.statements[i+1].sql===statement.sql&&JSON.stringify(group).length<70_000)group.push(this.statements[++i].params);
   if(group.length===1){statements.push(statement);continue;}
   statements.push({sql:`INSERT INTO ${match[1]} (${match[2]}) SELECT ${statement.params.map((_,n)=>`json_extract(value,'$[${n}]')`).join(',')} FROM json_each(?)`,params:[JSON.stringify(group)]});
  }
  await this.connection.batch([{sql:'INSERT INTO _PosCommit (id,expectedRevision,purpose,archiveId) VALUES (?,?,?,?)',params:[id,this.revision,this.purpose,this.archiveId]},...statements,{sql:'DELETE FROM _PosCommit WHERE id=?',params:[id]}]);
 }
}
export function resetTransaction(tx:unknown,id:string,rollback:()=>Promise<void>){const control=tx as {$resetPurpose(id:string):void;$onRollback(fn:()=>Promise<void>):void};control.$resetPurpose(id);control.$onRollback(rollback);}
function mapError(error:unknown):never{const message=String(error);if(message.includes('UNIQUE constraint failed'))throw new DatabaseError('P2002','Duplicate record');throw error;}
export function createD1Client(getConnection:()=>Promise<D1Connection>):PrismaClient {
 const transaction=async<T>(callback:(tx:PrismaClient)=>Promise<T>):Promise<T>=>{
  const connection=await getConnection();
  for(let attempt=0;attempt<8;attempt++){
   const [row]=await connection.all('SELECT revision FROM _PosRevision WHERE id=1');const tx=new Transaction(connection,Number(row.revision));
   try{const result=await callback(tx.facade);await tx.commit();return result;}catch(error){await tx.abort();if(String(error).includes('POS_CONFLICT')){await new Promise(resolve=>setTimeout(resolve,Math.min(5*2**attempt,100)));continue;}mapError(error);}
  }
  const error=new Error('ข้อมูลมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่') as Error&{status:number};error.status=409;throw error;
 };
 const facade:Row={$transaction:transaction,$disconnect:async()=>{},$queryRaw:(strings:TemplateStringsArray,...values:unknown[])=>transaction(tx=>(tx.$queryRaw as any)(strings,...values)),$executeRaw:(strings:TemplateStringsArray,...values:unknown[])=>transaction(tx=>(tx.$executeRaw as any)(strings,...values))};
 for(const name of Object.keys(models)){const key=name[0].toLowerCase()+name.slice(1);facade[key]={};for(const method of ['findMany','findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','count','create','update','updateMany','delete','deleteMany','upsert','createMany'])facade[key][method]=(args:Args={})=>transaction(tx=>(tx as any)[key][method](args));}
 return facade as PrismaClient;
}
