-- Run once as postgres after confirming this role does not already exist.
-- Unix peer authentication maps the package's netdata OS user to this role.
CREATE ROLE netdata LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
    CONNECTION LIMIT 3;
GRANT pg_monitor TO netdata;
GRANT CONNECT ON DATABASE crownlands_migration TO netdata;
ALTER ROLE netdata SET default_transaction_read_only = on;
ALTER ROLE netdata SET statement_timeout = '2s';
ALTER ROLE netdata SET idle_in_transaction_session_timeout = '5s';
