# Google Cloud Production Deployment Guide - KardexCare Backend

## Overview
This guide provides step-by-step instructions to deploy your KardexCare backend to Google Cloud Platform using Cloud Run and Cloud SQL.

## Architecture
- **Cloud Run**: Containerized backend service
- **Cloud SQL**: PostgreSQL database
- **Cloud Storage**: File uploads storage
- **Cloud Build**: CI/CD pipeline

## Prerequisites

### 1. Install Google Cloud CLI
```bash
# Download and install from: https://cloud.google.com/sdk/docs/install
# After installation, authenticate:
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 2. Enable Required APIs
```bash
gcloud services enable run.googleapis.com
gcloud services enable sql-component.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage-component.googleapis.com
```

## Step-by-Step Deployment

### Step 1: Setup Google Cloud SQL (PostgreSQL)

#### 1.1 Create Cloud SQL Instance
```bash
# Create PostgreSQL instance
gcloud sql instances create kardexcare-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=YOUR_STRONG_PASSWORD \
    --storage-size=20GB \
    --storage-type=SSD \
    --backup-start-time=02:00

# Create database
gcloud sql databases create kardexcare --instance=kardexcare-db

# Create user (optional, can use postgres user)
gcloud sql users create kardexcare-user \
    --instance=kardexcare-db \
    --password=YOUR_USER_PASSWORD
```

#### 1.2 Get Connection Details
```bash
# Get connection name
gcloud sql instances describe kardexcare-db --format="value(connectionName)"
# Output: PROJECT_ID:REGION:INSTANCE_NAME
```

### Step 2: Setup Cloud Storage for File Uploads

```bash
# Create storage bucket for uploads
gsutil mb gs://kardexcare-uploads-YOUR_PROJECT_ID

# Set bucket permissions (adjust as needed)
gsutil iam ch allUsers:objectViewer gs://kardexcare-uploads-YOUR_PROJECT_ID
```

### Step 3: Configure Environment Variables

#### 3.1 Update .env.production
Replace placeholders in `.env.production`:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@/kardexcare?host=/cloudsql/YOUR_PROJECT_ID:us-central1:kardexcare-db"
JWT_SECRET=your_very_strong_jwt_secret_32_chars_minimum
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
LOCATIONIQ_KEY=your_locationiq_key
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_STORAGE_BUCKET=kardexcare-uploads-YOUR_PROJECT_ID
```

### Step 4: Test Locally with Docker

```bash
# Build and test locally
docker-compose up --build

# Test the health endpoint
curl http://localhost:5000/api/health
```

### Step 5: Deploy to Cloud Run

#### 5.1 Build and Push Container
```bash
# Set project ID
export PROJECT_ID=your-project-id

# Build container
docker build -t gcr.io/$PROJECT_ID/kardexcare-backend .

# Push to Container Registry
docker push gcr.io/$PROJECT_ID/kardexcare-backend
```

#### 5.2 Deploy to Cloud Run
```bash
gcloud run deploy kardexcare-backend \
    --image gcr.io/$PROJECT_ID/kardexcare-backend \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 5000 \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 10 \
    --add-cloudsql-instances $PROJECT_ID:us-central1:kardexcare-db \
    --set-env-vars NODE_ENV=production \
    --set-env-vars PORT=5000 \
    --set-env-vars "DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@/kardexcare?host=/cloudsql/$PROJECT_ID:us-central1:kardexcare-db" \
    --set-env-vars JWT_SECRET=your_jwt_secret \
    --set-env-vars JWT_EXPIRES_IN=90d \
    --set-env-vars JWT_COOKIE_EXPIRES_IN=90 \
    --set-env-vars TWILIO_ACCOUNT_SID=your_sid \
    --set-env-vars TWILIO_AUTH_TOKEN=your_token \
    --set-env-vars TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886 \
    --set-env-vars LOCATIONIQ_KEY=your_key \
    --set-env-vars GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID \
    --set-env-vars GOOGLE_CLOUD_STORAGE_BUCKET=kardexcare-uploads-$PROJECT_ID
```

### Step 6: Run Database Migration

#### 6.1 Connect to Cloud SQL and Run Migrations
```bash
# Install Cloud SQL Proxy
curl -o cloud_sql_proxy https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64
chmod +x cloud_sql_proxy

# Start proxy in background
./cloud_sql_proxy -instances=$PROJECT_ID:us-central1:kardexcare-db=tcp:5432 &

# Update DATABASE_URL for migration
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/kardexcare?schema=public"

# Run migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### Step 7: Setup CI/CD with Cloud Build

#### 7.1 Connect Repository
```bash
# Connect your GitHub/GitLab repository to Cloud Build
gcloud builds submit --config cloudbuild.yaml .
```

#### 7.2 Create Build Trigger
```bash
# Create trigger for automatic deployments
gcloud builds triggers create github \
    --repo-name=kardex-backend \
    --repo-owner=YOUR_GITHUB_USERNAME \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml
```

## Security Configuration

### 1. Service Account Setup
```bash
# Create service account for Cloud Run
gcloud iam service-accounts create kardexcare-backend \
    --display-name="KardexCare Backend Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:kardexcare-backend@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:kardexcare-backend@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"
```

### 2. Update Cloud Run Service
```bash
gcloud run services update kardexcare-backend \
    --service-account kardexcare-backend@$PROJECT_ID.iam.gserviceaccount.com \
    --region us-central1
```

## Monitoring and Logging

### 1. Enable Logging
```bash
# Logs are automatically available in Cloud Logging
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=kardexcare-backend" --limit=50
```

### 2. Setup Monitoring
```bash
# Create uptime check
gcloud alpha monitoring uptime create \
    --display-name="KardexCare Backend Health Check" \
    --http-check-path="/api/health" \
    --hostname=YOUR_CLOUD_RUN_URL
```

## Environment-Specific Configurations

### Production Optimizations

1. **Database Connection Pooling**: Update Prisma configuration
```javascript
// In your Prisma client initialization
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
```

2. **File Upload to Cloud Storage**: Update multer configuration
```javascript
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

const bucket = storage.bucket(process.env.GOOGLE_CLOUD_STORAGE_BUCKET);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Verify Cloud SQL instance is running
   - Check connection string format
   - Ensure Cloud SQL connector is properly configured

2. **Memory Issues**
   - Increase Cloud Run memory allocation
   - Optimize Prisma queries
   - Implement proper connection pooling

3. **File Upload Issues**
   - Verify Cloud Storage bucket permissions
   - Check service account permissions
   - Ensure bucket exists and is accessible

### Useful Commands

```bash
# View Cloud Run logs
gcloud run services logs tail kardexcare-backend --region=us-central1

# Check service status
gcloud run services describe kardexcare-backend --region=us-central1

# Update environment variables
gcloud run services update kardexcare-backend \
    --update-env-vars KEY=VALUE \
    --region=us-central1

# Scale service
gcloud run services update kardexcare-backend \
    --max-instances=20 \
    --region=us-central1
```

## Cost Optimization

1. **Cloud Run**: Pay per request, scales to zero
2. **Cloud SQL**: Use appropriate tier (f1-micro for development)
3. **Cloud Storage**: Lifecycle policies for old files
4. **Monitoring**: Set up budget alerts

## Next Steps

1. **Domain Setup**: Configure custom domain for Cloud Run
2. **SSL Certificate**: Automatic with custom domain
3. **CDN**: Setup Cloud CDN for static assets
4. **Backup Strategy**: Automated Cloud SQL backups
5. **Disaster Recovery**: Multi-region deployment

## Support

For issues specific to your deployment:
1. Check Cloud Run logs
2. Verify environment variables
3. Test database connectivity
4. Review service account permissions

Your KardexCare backend should now be successfully deployed to Google Cloud Platform!
