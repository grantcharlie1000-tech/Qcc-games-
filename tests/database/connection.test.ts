import {it,expect} from 'vitest';
import {connectionOptions} from '../../scripts/db-connection.mjs';
import {spawnSync} from 'node:child_process';
it('requires server URL and enforces verified TLS remotely despite URL sslmode',()=>{
 expect(()=>connectionOptions(undefined)).toThrow();
 const remote=connectionOptions('postgres://example.invalid/app?sslmode=disable');
 expect(remote.ssl).toEqual({rejectUnauthorized:true});expect(remote.max).toBeLessThanOrEqual(2);expect(remote.keepAlive).toBe(false);expect(remote.idleTimeoutMillis).toBeLessThanOrEqual(2000);
 for(const host of ['localhost','127.0.0.1','[::1]'])expect(connectionOptions(`postgres://${host}/app`).ssl).toBe(false);
});
it('build migration fails without production URL; preview opt-out requires explicit flag and context',()=>{
 const run=(context:string,expected:string,allow:string)=>spawnSync(process.execPath,['scripts/db-migrate.mjs','--expect-env',expected],{env:{...process.env,DATABASE_URL:'',CONTEXT:context,QCC_ALLOW_NO_DB:allow},encoding:'utf8'});
 expect(run('production','production','1').status).toBe(1);
 expect(run('deploy-preview','preview','').status).toBe(1);
 const allowed=run('deploy-preview','preview','1');expect(allowed.status).toBe(0);expect(allowed.stderr).toContain('Warning');
 expect(run('dev','development','1').status).toBe(1);
});
