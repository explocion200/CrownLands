"use strict";
// Compact historical totals are maintained in the job transaction. Health
// checks read these two rows plus the indexed active set, never old payloads.
async function initializeJobStatus(client, schema) {
  if (!/^migration_game_[a-z0-9_]{1,30}$/.test(schema)) throw Error("Invalid job schema");
  await client.query("SET LOCAL lock_timeout='2s'");
  await client.query(`LOCK TABLE ${schema}.work_jobs IN SHARE ROW EXCLUSIVE MODE`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.work_job_totals (
    status text PRIMARY KEY CHECK(status IN ('complete','dead')), total bigint NOT NULL CHECK(total>=0));
    DO $init$ BEGIN
      IF (SELECT count(*) FROM ${schema}.work_job_totals)<2 THEN
        INSERT INTO ${schema}.work_job_totals(status,total)
        SELECT s.status,(SELECT count(*) FROM ${schema}.work_jobs j WHERE j.status=s.status)
        FROM (VALUES('complete'),('dead')) AS s(status) ON CONFLICT(status) DO NOTHING;
      END IF;
    END $init$;
    CREATE OR REPLACE FUNCTION ${schema}.update_job_totals() RETURNS trigger LANGUAGE plpgsql AS $fn$
    DECLARE prior_status text; next_status text;
    BEGIN
      IF TG_OP<>'INSERT' THEN prior_status=OLD.status; END IF;
      IF TG_OP<>'DELETE' THEN next_status=NEW.status; END IF;
      IF prior_status IS DISTINCT FROM next_status THEN
        PERFORM status FROM ${schema}.work_job_totals WHERE status IN (prior_status,next_status) ORDER BY status FOR UPDATE;
        UPDATE ${schema}.work_job_totals SET total=total-1 WHERE status=prior_status;
        UPDATE ${schema}.work_job_totals SET total=total+1 WHERE status=next_status;
      END IF;
      RETURN NULL;
    END $fn$;
    DO $trigger$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='${schema}.work_jobs'::regclass AND tgname='maintain_job_totals') THEN
        CREATE TRIGGER maintain_job_totals AFTER INSERT OR UPDATE OF status OR DELETE ON ${schema}.work_jobs
        FOR EACH ROW EXECUTE FUNCTION ${schema}.update_job_totals();
      END IF;
    END $trigger$;
    REVOKE ALL ON ${schema}.work_job_totals FROM PUBLIC;
    REVOKE ALL ON FUNCTION ${schema}.update_job_totals() FROM PUBLIC;`);
}
async function readJobStatus(queue) {
  const s = queue.schema;
  const rows = (await queue.controlStore.pool.query(`SELECT status,total AS count FROM ${s}.work_job_totals
    UNION ALL SELECT status,count(*) AS count FROM ${s}.work_jobs WHERE status IN ('pending','running') GROUP BY status`)).rows;
  const counts = { pending: 0, running: 0, complete: 0, dead: 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}
module.exports = { initializeJobStatus, readJobStatus };
