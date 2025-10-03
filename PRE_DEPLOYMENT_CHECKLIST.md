# 🚨 Pre-Deployment Checklist - CRITICAL

## **BEFORE DEPLOYING TO PRODUCTION:**

### ✅ **1. Generate Initial Migration (REQUIRED)**
```bash
cd backend

# Generate the initial migration from your current schema
npx prisma migrate dev --name init

# Verify migration file was created
ls prisma/migrations/
```

### ✅ **2. Test Migration Locally**
```bash
# Test with local database
docker-compose up postgres -d

# Run migration
npx prisma migrate deploy

# Verify tables were created
npx prisma studio
```

### ✅ **3. Backup Existing Data (If Any)**
```bash
# If you have existing data in Cloud SQL
gcloud sql export sql kardexcare-db gs://your-backup-bucket/backup-$(date +%Y%m%d).sql
```

### ✅ **4. Environment Variables Check**
Ensure these are set in Cloud Run:
- `DATABASE_URL` - Cloud SQL connection string
- `JWT_SECRET` - Strong secret key
- `NODE_ENV=production`
- `FORCE_MIGRATE=true` (for first deployment)

### ✅ **5. Database Connection String Format**
```env
# Correct format for Cloud SQL
DATABASE_URL="postgresql://postgres:PASSWORD@/kardexcare?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME"
```

## **⚠️ Known Issues & Solutions:**

### **Issue 1: Empty Migrations Directory**
- **Problem**: No migration files exist
- **Solution**: Run `npx prisma migrate dev --name init`
- **Impact**: Deployment will fail without this

### **Issue 2: Complex Foreign Key Dependencies**
- **Problem**: Your schema has 20+ interconnected models
- **Risk**: Migration order issues
- **Solution**: Prisma handles this automatically, but test locally first

### **Issue 3: Large Schema Size**
- **Problem**: 648 lines of schema with complex relationships
- **Risk**: Long migration time
- **Solution**: Increase Cloud Run timeout to 15 minutes

### **Issue 4: Decimal Precision**
- **Models affected**: `Attendance`, `OnsiteVisitLog`, `ActivityStage`
- **Fields**: `latitude`, `longitude` with `@db.Decimal(10, 7)`
- **Risk**: Precision loss if not handled correctly
- **Solution**: Verify decimal handling in PostgreSQL

## **🔧 Migration Command Sequence:**

### **Local Development:**
```bash
npx prisma migrate dev --name init
npx prisma generate
npm run build
npm start
```

### **Production Deployment:**
```bash
# Automatic via Docker container:
# 1. npx prisma migrate deploy
# 2. node dist/server.js
```

## **🚨 Emergency Rollback Plan:**

### **If Migration Fails:**
```bash
# 1. Stop Cloud Run service
gcloud run services update kardexcare-backend --region=us-central1 --max-instances=0

# 2. Restore database from backup
gcloud sql import sql kardexcare-db gs://your-backup-bucket/backup-YYYYMMDD.sql

# 3. Deploy previous working version
gcloud run deploy kardexcare-backend --image gcr.io/PROJECT_ID/kardexcare-backend:PREVIOUS_SHA
```

## **📊 Expected Migration Results:**

After successful migration, your database will have:
- **20+ tables** created
- **50+ indexes** for performance
- **Complex foreign key relationships** established
- **Enum types** for status fields
- **Decimal precision** fields for coordinates

## **⏱️ Estimated Migration Time:**
- **Fresh database**: 2-5 minutes
- **With existing data**: 10-30 minutes (depending on data volume)

## **🔍 Post-Migration Verification:**

```bash
# Check if all tables exist
npx prisma studio

# Verify key relationships
curl https://your-backend.run.app/api/health

# Test critical endpoints
curl https://your-backend.run.app/api/users
curl https://your-backend.run.app/api/tickets
```

## **❌ DO NOT DEPLOY WITHOUT:**
1. ✅ Migration files generated
2. ✅ Local testing completed
3. ✅ Database backup created (if existing data)
4. ✅ Environment variables configured
5. ✅ Rollback plan ready

**Your schema is complex - take time to test thoroughly!**
