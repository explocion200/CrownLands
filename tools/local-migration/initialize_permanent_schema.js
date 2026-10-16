"use strict";
// Run once as PostgreSQL administrator. Only empty targets are created; there is
// deliberately no import, activation, subscription replay or scheduler startup.
const {Store}=require('../../local-backend/store');
const {AuthService}=require('../../local-backend/auth');
const {AuthMailDispatcher}=require('../../local-backend/auth-mail');
const {JobQueue}=require('../../local-backend/jobs');
const {GAME,AUTH,COMPONENTS,readControl}=require('../../local-backend/deployment-policy');
function grants(){const role=n=>'"crownlands-'+n+'"';const sql=[];
 for(const n of COMPONENTS)sql.push(`GRANT CONNECT ON DATABASE crownlands_migration TO ${role(n)}; GRANT USAGE ON SCHEMA crownlands_control TO ${role(n)}; GRANT EXECUTE ON FUNCTION crownlands_control.assert_active(text) TO ${role(n)};`);
 sql.push(`GRANT USAGE ON SCHEMA ${AUTH} TO ${role('auth')},${role('mail')},${role('game')};
 GRANT SELECT,INSERT,UPDATE,DELETE ON ${AUTH}.accounts,${AUTH}.auth_sessions,${AUTH}.auth_limits,${AUTH}.auth_actions,${AUTH}.auth_mail,${AUTH}.auth_oauth TO ${role('auth')};
 GRANT SELECT ON ${AUTH}.accounts,${AUTH}.auth_sessions TO ${role('game')};
 GRANT SELECT,INSERT,UPDATE,DELETE ON ${AUTH}.auth_limits TO ${role('game')};
 GRANT SELECT,UPDATE ON ${AUTH}.auth_mail TO ${role('mail')};
 GRANT SELECT ON ${AUTH}.auth_actions,${AUTH}.auth_mail_accounts TO ${role('mail')};
 GRANT SELECT,INSERT,UPDATE ON ${AUTH}.auth_mail_delivery TO ${role('mail')};`);
 for(const n of ['game','worker','push','payments'])sql.push(`GRANT USAGE ON SCHEMA ${GAME} TO ${role(n)};
 GRANT SELECT,INSERT,UPDATE,DELETE ON ${GAME}.documents TO ${role(n)};
 GRANT SELECT,INSERT ON ${GAME}.changes TO ${role(n)}; GRANT USAGE ON SEQUENCE ${GAME}.changes_id_seq TO ${role(n)};`);
 sql.push(`GRANT UPDATE ON ${GAME}.changes TO ${role('worker')};
 GRANT SELECT,INSERT,UPDATE ON ${GAME}.work_jobs,${GAME}.work_schedules TO ${role('worker')};
 GRANT USAGE ON SEQUENCE ${GAME}.work_jobs_id_seq TO ${role('worker')};`);
 return sql.join('\n');}
const gateSql=`CREATE OR REPLACE FUNCTION crownlands_control.assert_active(expected text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $gate$
 DECLARE matched boolean;
 BEGIN
   SELECT true INTO matched FROM crownlands_control.deployment WHERE singleton=true AND phase='active' AND epoch=expected FOR SHARE;
   IF matched IS DISTINCT FROM true THEN RAISE EXCEPTION 'Crownlands maintenance' USING ERRCODE='55000'; END IF;
   RETURN true;
 END $gate$;
 REVOKE ALL ON FUNCTION crownlands_control.assert_active(text) FROM PUBLIC;
 CREATE OR REPLACE FUNCTION crownlands_control.fence_writes() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fence$
 BEGIN
   IF session_user IN ('crownlands-auth','crownlands-game','crownlands-worker','crownlands-mail','crownlands-push','crownlands-payments') THEN
     PERFORM crownlands_control.assert_active(current_setting('crownlands.runtime_epoch',true));
   END IF;
   RETURN NULL;
 END $fence$;
 REVOKE ALL ON FUNCTION crownlands_control.fence_writes() FROM PUBLIC;`;
async function initialize({pool,control:read=readControl}={}){const store=new Store({schema:GAME,pool}),authStore=new Store({schema:AUTH,pool:store.pool});
 try{const control=read();if(control.phase!=='standby')throw Error('Empty installation must remain in standby');
  if((await store.pool.query('SELECT current_user')).rows[0].current_user!=='postgres')throw Error('Administrator schema owner required');
  if((await store.pool.query('SELECT 1 FROM pg_namespace WHERE nspname=ANY($1::text[])',[[GAME,AUTH,'crownlands_control']])).rowCount)throw Error('Existing permanent database targets preserved');
  await store.initialize();await store.pool.query(`CREATE SCHEMA ${AUTH};REVOKE ALL ON SCHEMA ${AUTH} FROM PUBLIC;`);
  await new AuthService({store:authStore,rateKey:require('node:crypto').randomBytes(32)}).initialize();
  await new AuthMailDispatcher({store:authStore,sender:{send:async()=>{throw Error('No mail during setup');}}}).initialize();
  await new JobQueue({store,routes:[]}).initialize();
  await store.pool.query(`CREATE SCHEMA crownlands_control;REVOKE ALL ON SCHEMA crownlands_control FROM PUBLIC;
   CREATE TABLE crownlands_control.deployment(singleton boolean PRIMARY KEY CHECK(singleton),phase text NOT NULL CHECK(phase IN ('standby','active','maintenance')),epoch text NOT NULL CHECK(epoch ~ '^[a-f0-9]{32}$'),snapshot_receipt text,firebase_fence_receipt text,activated_at timestamptz, CHECK(phase<>'active' OR (snapshot_receipt ~ '^[a-f0-9]{64}$' AND firebase_fence_receipt ~ '^[a-f0-9]{64}$' AND snapshot_receipt IS NOT NULL AND firebase_fence_receipt IS NOT NULL AND activated_at IS NOT NULL)));
   REVOKE ALL ON crownlands_control.deployment FROM PUBLIC;`);
  await store.pool.query("INSERT INTO crownlands_control.deployment(singleton,phase,epoch) VALUES(true,'standby',$1)",[control.epoch]);
  await store.pool.query(gateSql);
  const tables=(await store.pool.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1::text[])",[[GAME,AUTH]])).rows;
  for(const t of tables)await store.pool.query(`CREATE TRIGGER runtime_write_fence BEFORE INSERT OR UPDATE OR DELETE ON ${t.schemaname}.${t.tablename} FOR EACH STATEMENT EXECUTE FUNCTION crownlands_control.fence_writes();`);
  for(const [collection,field] of [['cities','ownerUid'],['camps','holderUid']])await store.pool.query(`CREATE INDEX live_${collection}_owner ON ${GAME}.documents (${GAME}.query_sort_key(body #> '{fields,${field}}')) WHERE collection_id='${collection}';`);
  await store.pool.query(grants());console.log('Empty permanent schemas initialized; runtime writes remain fenced in standby.');
 }finally{await store.close();}}
if(require.main===module){if(process.argv[2]!=='--empty-only'){console.error('Explicit empty-only initialization required');process.exitCode=1;}else initialize().catch(()=>{console.error('Empty schema initialization stopped; existing data preserved; inspect partial targets.');process.exitCode=1;});}
module.exports={grants,gateSql,initialize};
