# eScholr — Backup & Restore Runbook

> **Audience:** Platform admin / Lusaka Oaktree IT lead  
> **Updated:** April 2026

---

## 1. Architecture Overview

| Layer | Technology | Where data lives |
|---|---|---|
| Database | Supabase Postgres (hosted) | `ap-southeast-2` region |
| File storage | Supabase Storage | `school-assets` bucket (student photos, receipts) |
| Backups | `export-school-data` edge function | Exports to downloadable JSON |
| Logs | `audit_logs` table | Postgres, included in backup |

---

## 2. Automated Export (In-App)

The **export-school-data** edge function produces a school-scoped JSON snapshot.

### Trigger (Platform Admin)
1. Log in as platform admin → **Schools** tab
2. Select a school → tap **Export Data**
3. The app calls `supabase.functions.invoke('export-school-data', { body: { school_id } })`
4. Download link is returned — save to a secure location

### What's included
- `students` — all fields except `auth_user_id`
- `staff` — all fields
- `grades`, `streams`, `semesters`
- `reports`, `marks`, `attendance_records`
- `audit_logs`
- `announcements`
- `finance_records`

### What's NOT included
- Supabase Auth users table (managed by Supabase — backed up separately)
- Raw file blobs (photos, PDFs — see Storage Backup below)

---

## 3. Database Backup

### 3a. Supabase Dashboard (Point-in-Time)
Supabase Pro plan includes automated daily backups with 7-day retention.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **eScholr project**
2. **Database** → **Backups**
3. Select a restore point → click **Restore**
4. ⚠️ Restores are destructive — confirm with school before proceeding

### 3b. Manual pg_dump (Full Snapshot)
Run from a machine with `psql` and the database password from Supabase project settings:

```bash
pg_dump \
  "postgresql://postgres:[DB_PASSWORD]@db.spdcrywlannmrzwtbsyq.supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-acl \
  -F c \
  -f escholr_backup_$(date +%Y%m%d).dump
```

Store the `.dump` file in a secure location (encrypted drive or Google Drive restricted folder).

### 3c. Restore from pg_dump
```bash
pg_restore \
  --clean --if-exists \
  -d "postgresql://postgres:[DB_PASSWORD]@db.spdcrywlannmrzwtbsyq.supabase.co:5432/postgres" \
  escholr_backup_20260101.dump
```
⚠️ This overwrites all data. Always take a fresh backup before restoring.

---

## 4. Storage Backup (Photos & PDFs)

### 4a. Download all school assets
Using the Supabase CLI:

```bash
supabase storage ls school-assets/[SCHOOL_ID]/
supabase storage download school-assets/[SCHOOL_ID]/ --local-dir ./storage-backup/
```

Replace `[SCHOOL_ID]` with the school's UUID from the `schools` table.

### 4b. Restore storage files
```bash
supabase storage upload school-assets/ ./storage-backup/ --recursive
```

---

## 5. Recommended Backup Schedule

| Backup type | Frequency | Owner | Storage |
|---|---|---|---|
| Supabase automated | Daily (auto) | Supabase platform | Supabase servers |
| pg_dump full snapshot | Weekly (Friday night) | IT lead | Encrypted external drive + Google Drive |
| In-app JSON export | Before each term end | School admin | School Google Drive folder |
| Storage files | Monthly | IT lead | Google Drive |

---

## 6. Disaster Recovery Procedure

### Scenario: Database corruption / accidental bulk delete

1. **Stop the app** — put maintenance notice via announcement system if partially working
2. Identify last known-good backup date from Supabase dashboard
3. Restore from Supabase point-in-time backup (preferred) or pg_dump
4. Verify data integrity:
   ```sql
   SELECT COUNT(*) FROM students WHERE school_id = '[SCHOOL_ID]';
   SELECT COUNT(*) FROM reports WHERE school_id = '[SCHOOL_ID]';
   SELECT MAX(created_at) FROM audit_logs WHERE school_id = '[SCHOOL_ID]';
   ```
5. Notify affected school admin of data recovery window (what may have been lost)
6. Re-run any migrations applied after the backup date:
   ```bash
   supabase db push
   ```

### Scenario: Edge function failure (generate-receipt / release-report)

1. Check function logs: Supabase Dashboard → **Edge Functions** → select function → **Logs**
2. Common causes: Supabase env secret missing, PDF generation timeout
3. Redeploy the function:
   ```bash
   supabase functions deploy generate-receipt
   supabase functions deploy release-report
   ```

### Scenario: App crashes on launch (bad build pushed)

1. Log in to EAS: `eas build:list`
2. Identify last stable build ID
3. Roll back via `eas update` to the last stable update channel:
   ```bash
   eas update --branch production --message "rollback to stable"
   ```

---

## 7. Key Credentials & Locations

> Store securely — do NOT commit to git.

| Credential | Where to find |
|---|---|
| Supabase DB password | Supabase Dashboard → Project Settings → Database |
| Supabase service role key | Supabase Dashboard → Project Settings → API |
| EAS project ID | `app.json` → `expo.extra.eas.projectId` or `eas.json` |
| Apple Team ID | Apple Developer Portal → Membership |
| Google Play service account key | Google Play Console → Setup → API access |

---

## 8. Contacts

| Role | Responsibility |
|---|---|
| Platform admin | Triggering exports, managing Supabase project |
| IT lead | Running pg_dump, storage backups, disaster recovery |
| School admin | Triggering term-end JSON exports from the app |
