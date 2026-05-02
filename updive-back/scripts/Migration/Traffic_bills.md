# Traffic Bill Mirgation from Observium

This Document describes how to migrate the **traffic bills** from Observium to UpdiveNSM

### Assumptions

* The UpdiveNSM installation is complete and migration has taken place except for the traffic bills and traffic bill history.
* The old DB is called ``observium`` and new DB is called ``UpdiveNSM``. If both DBs are not on the same DB Server, create a DB called ``observium`` on the target DB-Server run mysqldump & co to copy the data.
*  **No traffic bills** have been created in UpdiveNSM.
*  The scripts have been tested on UpdiveNSM version Version 22.1.0 and DB Schema "2021_11_29_165436_improve_ports_search_index (229)"

### Precaution
backup your databases first:
*  ``mysqldump observium > observium.sql``
*  ``mysqldump UpdiveNSM > UpdiveNSM.sql``

### Warning: traffic bills will be deleted from UpdiveNSM and imported from observium!

### Initial Import

```mysql
\u observium

LOCK TABLES UpdiveNSM.bill_history UpdiveNSM.bills UpdiveNSM.bill_data WRITE, observium.bill_data WRITE, observium.bill_history READ, observium.bills READ ;

--
-- The columns bill_polled, bill_contact, bill_threshold and bill_notify are not present in the observium data model
--
TRUNCATE TABLE UpdiveNSM.bills;
INSERT INTO UpdiveNSM.bills
        ( bill_id, bill_name, bill_type, bill_cdr, bill_day, bill_quota, rate_95th_in, rate_95th_out, rate_95th, dir_95th, total_data, total_data_in, total_data_out, rate_average_in, rate_average_out, rate_average, bill_last_calc, bill_custid, bill_ref, bill_notes, bill_autoadded )
    SELECT
        bill_id, bill_name, bill_type, bill_cdr, bill_day, bill_quota, rate_95th_in, rate_95th_out, rate_95th, dir_95th, total_data, total_data_in, total_data_out, rate_average_in, rate_average_out, rate_average, bill_last_calc, bill_custid, bill_ref, bill_notes, bill_autoadded
    FROM observium.bills
    ;

--
--  the columns bill_peak_out, bill_peak_in are not present in the observium data model
--
TRUNCATE TABLE UpdiveNSM.bill_history;
INSERT INTO UpdiveNSM.bill_history
        ( bill_hist_id, bill_id, updated, bill_datefrom, bill_dateto, bill_type, bill_allowed, bill_used, bill_overuse, bill_percent, rate_95th_in, rate_95th_out, rate_95th, dir_95th, rate_average, rate_average_in, rate_average_out, traf_in, traf_out, traf_total, pdf )
    SELECT
        bill_hist_id, bill_id, updated, bill_datefrom, bill_dateto, bill_type, bill_allowed, bill_used, bill_overuse, bill_percent, rate_95th_in, rate_95th_out, rate_95th, dir_95th, rate_average, rate_average_in, rate_average_out, traf_in, traf_out, traf_total, pdf
    FROM observium.bill_history
    ;


--
-- There is a Primary key on bill_id and timestamp, to in case of duplicate primary keys we use the recorrd with the greatest bill_data.delta. ( see "ON DUPLICATE KEY UPDATE ...")
--
SELECT COUNT(bill_id) FROM observium.bill_data;
TRUNCATE TABLE UpdiveNSM.bill_data;
INSERT INTO UpdiveNSM.bill_data
        ( bill_id, timestamp, period, delta, in_delta, out_delta )
    SELECT
        bill_id, timestamp, period, delta, in_delta, out_delta from observium.bill_data
    ON DUPLICATE KEY UPDATE
        UpdiveNSM.bill_data.delta=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.delta, VALUES(UpdiveNSM.bill_data.delta) ),
        UpdiveNSM.bill_data.in_delta=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.in_delta, VALUES(UpdiveNSM.bill_data.in_delta) ),
        UpdiveNSM.bill_data.out_delta=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.out_delta, VALUES(UpdiveNSM.bill_data.out_delta) ),
        UpdiveNSM.bill_data.period=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.period, VALUES(UpdiveNSM.bill_data.period) )
    ;
COMMIT;
SELECT COUNT(bill_id) FROM UpdiveNSM.bill_data;
UNLOCK TABLES;

-- Please compare if the count(bill_id) values are reasonable
```

### Go to the WEB UI

Now check if everything worked OK and reconnect the switchports in the GUI.

### Second import:
Replay the data collecetd on observium since before the last copy, to avoid loosing billing records.


```mysql
\u observium

LOCK TABLES UpdiveNSM.bill_data WRITE, observium.bill_data WRITE ;
SELECT COUNT(bill_id) FROM observium.bill_data;
TRUNCATE TABLE UpdiveNSM.bill_data;

INSERT INTO UpdiveNSM.bill_data
        ( bill_id, timestamp, period, delta, in_delta, out_delta )
    SELECT
        bill_id, timestamp, period, delta, in_delta, out_delta from observium.bill_data
    ON DUPLICATE KEY UPDATE
        UpdiveNSM.bill_data.delta=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.delta, VALUES(UpdiveNSM.bill_data.delta) ),
        UpdiveNSM.bill_data.in_delta=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.in_delta, VALUES(UpdiveNSM.bill_data.in_delta) ),
        UpdiveNSM.bill_data.out_delta=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.out_delta, VALUES(UpdiveNSM.bill_data.out_delta) ),
        UpdiveNSM.bill_data.period=
            IF ( UpdiveNSM.bill_data.delta >= VALUES(UpdiveNSM.bill_data.delta), UpdiveNSM.bill_data.period, VALUES(UpdiveNSM.bill_data.period) )
    ;
COMMIT ;
SELECT COUNT(bill_id) FROM UpdiveNSM.bill_data;
UNLOCK TABLES;
SELECT "The next query should return an empty set" AS "Information";
SELECT t1.bill_id AS "unrefferenced bill_data.bill_id records", t1.timestamp FROM bill_data AS t1 LEFT JOIN bills t2 ON t1.bill_id = t2.bill_id WHERE t2.bill_id IS NULL LIMIT 100;
```
