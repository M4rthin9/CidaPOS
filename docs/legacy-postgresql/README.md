# Archived PostgreSQL deployment

These files record the previous PostgreSQL/Node/Docker setup. They are retained for reference with the PostgreSQL schema and migrations under `prisma/legacy-postgresql/`.

The current application uses D1/R2 and cannot be deployed using these Compose/Docker files. The last PostgreSQL application is Git commit `748449a`. Existing PostgreSQL data has not been deleted; use a separate checkout of that commit for a rollback, reconcile any sales recorded after migration, and restore credentials privately.
