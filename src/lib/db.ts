import {createD1Client} from './d1/client';
import {d1Connection} from './cloudflare';
// Native D1 batches with revision checks. No Prisma D1 adapter or SQL engine.
export const db=createD1Client(d1Connection);
