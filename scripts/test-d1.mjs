import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--import','tsx','--test','tests/integration.test.ts','tests/d1.test.ts'],{env:{...process.env,RUN_DB_TESTS:'true'},stdio:'inherit'});
process.exitCode=result.status??1;
