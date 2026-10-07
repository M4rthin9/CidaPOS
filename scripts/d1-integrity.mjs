import {readFileSync,writeFileSync} from 'node:fs';
const models=JSON.parse(readFileSync('src/lib/d1/models.json','utf8'));
const sql=[
`CREATE TABLE _PosRevision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);`,
`INSERT INTO _PosRevision(id,revision) VALUES(1,0);`,
`CREATE TABLE _PosCommit (id TEXT PRIMARY KEY, expectedRevision INTEGER NOT NULL, purpose TEXT NOT NULL, archiveId TEXT);`,
`CREATE TRIGGER pos_revision_guard BEFORE INSERT ON _PosCommit WHEN NEW.expectedRevision != (SELECT revision FROM _PosRevision WHERE id=1) BEGIN SELECT RAISE(ABORT,'POS_CONFLICT'); END;`,
`CREATE TRIGGER pos_revision_advance AFTER INSERT ON _PosCommit BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;`
];
const reset=`EXISTS (SELECT 1 FROM _PosCommit c JOIN SalesResetArchive a ON a.id=c.archiveId WHERE c.purpose='SALES_RESET' AND json_extract(a.payload,'$.storage')='r2')`;
for(const name of ['AuditLog','SalesSnapshot','DailyClosing','Payment','Adjustment','SalesResetArchive','RetiredCheckoutKey']){
 sql.push(`CREATE TRIGGER ${name}_immutable_update BEFORE UPDATE ON "${name}" BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;`);
 const allowReset=['SalesSnapshot','DailyClosing','Payment','Adjustment'].includes(name);
 sql.push(`CREATE TRIGGER ${name}_immutable_delete BEFORE DELETE ON "${name}" ${allowReset?'WHEN NOT '+reset:''} BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;`);
}
for(const [name,allowed] of [['Order',['status','refunded']],['OrderItem',['refunded']]]){
 sql.push(`CREATE TRIGGER ${name}_no_delete BEFORE DELETE ON "${name}" WHEN NOT ${reset} BEGIN SELECT RAISE(ABORT,'Immutable financial/audit record cannot be changed'); END;`);
 const changes=Object.keys(models[name].fields).filter(field=>!allowed.includes(field)).map(field=>`OLD."${field}" IS NOT NEW."${field}"`).join(' OR ');
 sql.push(`CREATE TRIGGER ${name}_snapshot BEFORE UPDATE ON "${name}" WHEN ${changes} BEGIN SELECT RAISE(ABORT,'${name} snapshot cannot be edited'); END;`);
}
const constraints={Product:'NEW.price>=0 AND NEW.cost>=0',Modifier:'NEW.price>=0',Order:'NEW.subtotal>=0 AND NEW.discount>=0 AND NEW.total=NEW.subtotal-NEW.discount AND NEW.refunded BETWEEN 0 AND NEW.total',OrderItem:'NEW.unitPrice>=0 AND NEW.quantity>0 AND NEW.discount>=0 AND NEW.lineTotal=NEW.unitPrice*NEW.quantity-NEW.discount AND NEW.refunded BETWEEN 0 AND NEW.lineTotal',Payment:'NEW.amount>=0 AND NEW.received>=NEW.amount AND NEW.change=NEW.received-NEW.amount',Adjustment:'NEW.amount>=0'};
for(const [name,condition] of Object.entries(constraints))for(const operation of ['INSERT','UPDATE'])sql.push(`CREATE TRIGGER ${name}_money_${operation.toLowerCase()} BEFORE ${operation} ON "${name}" WHEN NOT (${condition}) BEGIN SELECT RAISE(ABORT,'Invalid money values'); END;`);
// Even direct SQL writers change the revision, so an in-flight checkout cannot
// commit against stale data after a migration or administrative SQL statement.
for(const name of Object.keys(models))for(const operation of ['INSERT','UPDATE','DELETE'])sql.push(`CREATE TRIGGER ${name}_revision_${operation.toLowerCase()} AFTER ${operation} ON "${name}" WHEN NOT EXISTS (SELECT 1 FROM _PosCommit) BEGIN UPDATE _PosRevision SET revision=revision+1 WHERE id=1; END;`);
writeFileSync('d1/migrations/0002_integrity.sql',sql.join('\n\n')+'\n');
