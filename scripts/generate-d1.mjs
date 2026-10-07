import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
const schema=readFileSync('prisma/schema.prisma','utf8');
mkdirSync('prisma/legacy-postgresql',{recursive:true});
if(schema.includes('provider = "postgresql"')&&!existsSync('prisma/legacy-postgresql/schema.prisma'))copyFileSync('prisma/schema.prisma','prisma/legacy-postgresql/schema.prisma');
const models={};
for(const match of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)){
 const [,name,body]=match,fields={},relations={};let primary='id';
 for(const line of body.split(/\r?\n/)){
  const m=line.trim().match(/^(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$/);if(!m)continue;
  const [,field,type,suffix,attributes]=m;
  if(!['String','Int','Boolean','DateTime','Json'].includes(type)){
   const rel=attributes.match(/fields:\s*\[(\w+)\],\s*references:\s*\[(\w+)\]/);
   relations[field]={model:type,many:suffix==='[]',...(rel?{local:rel[1],foreign:rel[2]}:{})};continue;
  }
  if(attributes.includes('@id'))primary=field;
  const def=attributes.match(/@default\(("[^"]*"|true|false|\d+|\w+\(\))\)/)?.[1];
  fields[field]={type,nullable:suffix==='?',...(def?{default:def}:{}),...(attributes.includes('@updatedAt')?{updated:true}:{})};
 }
 models[name]={primary,fields,relations};
}
for(const [name,model] of Object.entries(models))for(const relation of Object.values(model.relations)){
 if(relation.local)continue;
 const reverse=Object.values(models[relation.model].relations).find(r=>r.model===name&&r.local);
 if(!reverse)throw new Error('Missing relation '+name);
 relation.local=reverse.foreign;relation.foreign=reverse.local;
}
mkdirSync('src/lib/d1',{recursive:true});
writeFileSync('src/lib/d1/models.json',JSON.stringify(models,null,2)+'\n');
writeFileSync('prisma/schema.prisma',schema.replace('provider = "postgresql"','provider = "sqlite"').replace('url = env("DATABASE_URL")','url = "file:./type-generation.db"'));
console.log('Generated D1 model metadata; preserved the PostgreSQL schema for export.');
