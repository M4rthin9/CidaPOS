import {getCloudflareContext} from '@opennextjs/cloudflare';
import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import type {D1Connection} from './d1/client';
export type CloudflareBindings={DB:D1Database;FILES:R2Bucket;APP_ORIGIN?:string;COOKIE_SECURE?:string};
let override:CloudflareBindings|undefined;
export function useTestBindings(bindings:CloudflareBindings){if(process.env.RUN_DB_TESTS!=='true')throw new Error('Test bindings are restricted to the isolated test runner');override=bindings;}
export async function bindings():Promise<CloudflareBindings>{return override??(await getCloudflareContext({async:true})).env as unknown as CloudflareBindings;}
export async function d1Connection():Promise<D1Connection>{
 const {DB}=await bindings();
 return {all:async(sql,params=[])=>{const result=await DB.prepare(sql).bind(...params).all();return result.results as Record<string,any>[];},batch:async statements=>{await DB.batch(statements.map(({sql,params})=>DB.prepare(sql).bind(...params)));}};
}
