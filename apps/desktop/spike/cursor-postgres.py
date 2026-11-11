"""Synthetic PostgreSQL cursor experiment. Never runs application migrations.

Serializing a transactional counter per scope prevents a later writer from
publishing a higher cursor before an earlier writer commits. This validates a
candidate ordering mechanism, not production replication or authorization.
"""
import os
import subprocess
import time
import uuid

url = os.environ.get("DESKTOP_SPIKE_DATABASE_URL")
if not url:
    raise SystemExit("Set DESKTOP_SPIKE_DATABASE_URL to a disposable PostgreSQL database.")
schema = "desktop_spike_" + uuid.uuid4().hex


def psql(sql):
    return subprocess.check_output(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", url, "-c", sql],
        text=True, stderr=subprocess.PIPE, timeout=15,
    ).strip()


def start(sql, name):
    env = dict(os.environ, PGAPPNAME=name)
    return subprocess.Popen(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", url, "-c", sql],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )


def await_condition(sql):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if psql(sql) == "1":
            return
        time.sleep(0.025)
    raise AssertionError("Timed out waiting for transaction choreography")


psql(f"CREATE SCHEMA {schema}; CREATE TABLE {schema}.clock (id int PRIMARY KEY, version bigint NOT NULL);"
     f"INSERT INTO {schema}.clock VALUES (1, 0);"
     f"CREATE TABLE {schema}.changes (version bigint PRIMARY KEY, payload text NOT NULL);")
children = []
try:
    for rollback in [False, True]:
        psql(f"TRUNCATE {schema}.changes; UPDATE {schema}.clock SET version=0;")
        marker = int(uuid.uuid4().hex[:7], 16)
        first_name, second_name = schema + "_a", schema + "_b"
        write = (f"WITH next AS (UPDATE {schema}.clock SET version=version+1 WHERE id=1 RETURNING version) "
                 f"INSERT INTO {schema}.changes SELECT version, 'synthetic' FROM next;")
        first = start(f"BEGIN; {write} SELECT pg_advisory_xact_lock({marker}); "
                      f"SELECT pg_sleep(3); {'ROLLBACK' if rollback else 'COMMIT'};", first_name)
        children.append(first)
        await_condition(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' "
                        f"AND objid={marker} AND granted;")
        second = start(f"BEGIN; {write} COMMIT;", second_name)
        children.append(second)
        await_condition(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{second_name}' "
                        "AND wait_event_type='Lock';")
        # Reader must not see either writer while A is uncommitted and B waits.
        assert psql(f"SELECT count(*) FROM {schema}.changes;") == "0"
        for child in [first, second]:
            stdout, stderr = child.communicate(timeout=15)
            assert child.returncode == 0, stderr
        expected = "1" if rollback else "1\n2"
        assert psql(f"SELECT version FROM {schema}.changes ORDER BY version;") == expected
        print(f"PASS: concurrent cursor writers ({'rollback' if rollback else 'commit'})")
finally:
    for child in children:
        if child.poll() is None:
            child.kill()
            child.communicate()
    psql(f"DROP SCHEMA {schema} CASCADE;")
