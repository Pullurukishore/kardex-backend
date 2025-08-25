# KardexCare Customer & Asset Management Implementation

This document outlines the complete implementation of the customer, contact, and asset management system for the KardexCare application.

## Overview

The system implements role-based access control with four user roles:
- **ADMIN**: Full access to all customers, contacts, and assets
- **CUSTOMER_OWNER**: Can manage their own customer's assets and contacts
- **CUSTOMER_CONTACT**: View-only access to their customer's assets
- **SERVICE_PERSON**: View-only access to assets linked to assigned tickets

## Backend Implementation

### 1. Database Schema Updates

#### Prisma Schema Changes
- Updated `UserRole` enum: `CUSTOMER_ACCOUNT_OWNER` → `CUSTOMER_OWNER`
- Added `passwordHash` field to `Contact` model
- Maintained existing unique constraints and relationships

#### Key Models
```prisma
model User {
  id: Int
  email: String @unique
  password: String
  role: UserRole
  customerId: Int?
  customer: Customer?
}

model Customer {
  id: Int
  companyName: String
  address: String?
  industry: String?
  timezone: String
  isActive: Boolean
  contacts: Contact[]
  assets: Asset[]
  users: User[]
}

model Contact {
  id: Int
  name: String
  email: String @unique
  phone: String?
  role: ContactRole
  customerId: Int
  passwordHash: String?
  customer: Customer
}

model Asset {
  id: Int
  machineId: String @unique
  model: String?
  serialNo: String?
  customerId: Int
  status: String
  // ... warranty, AMC, location fields
  @@unique([serialNo, customerId])
}
```

### 2. Middleware Implementation

#### Customer Management Middleware (`backend/src/middleware/customer.middleware.ts`)
- `canManageCustomers`: Only ADMIN can create/update/delete customers
- `canManageContacts`: ADMIN can manage any contacts, CUSTOMER_OWNER can manage their own
- `canViewCustomers`: Role-based customer viewing permissions

#### Asset Management Middleware (`backend/src/middleware/auth.middleware.ts`)
- `canManageAssets`: ADMIN has full access, CUSTOMER_OWNER can manage their own customer's assets
- Prevents unauthorized asset operations

### 3. Controller Updates

#### Customer Controller (`backend/src/controllers/customer.controller.ts`)
- **Create Customer**: Single endpoint that creates customer + owner user + owner contact in one transaction
- **List Customers**: Role-based filtering (ADMIN sees all, others see only their own)
- **Get Customer**: Role-based access control
- **Update/Delete**: Admin-only operations

#### Contact Controller (`backend/src/controllers/contact.controller.ts`)
- **Create Contact**: Creates contact and optionally a user account with password
- **List Contacts**: Role-based filtering per customer
- **Update/Delete**: Role-based permissions

#### Asset Controller (`backend/src/controllers/asset.controller.ts`)
- **List Assets**: Role-based filtering with search and pagination
- **Create Asset**: ADMIN can create for any customer, CUSTOMER_OWNER only for their own
- **Update Asset**: Role-based permissions with customer ID validation
- **Delete Asset**: Prevents deletion if related tickets exist

### 4. API Routes

#### Customer Routes (`backend/src/routes/customer.routes.ts`)
- `POST /api/customers` - Create customer + owner (Admin only)
- `GET /api/customers` - List customers (Role-based access)
- `GET /api/customers/:id` - Get customer details
- `PUT /api/customers/:id` - Update customer (Admin only)
- `DELETE /api/customers/:id` - Delete customer (Admin only)

#### Contact Routes (`backend/src/routes/contact.routes.ts`)
- `GET /api/customers/:id/contacts` - List contacts for customer
- `POST /api/customers/:id/contacts` - Create contact (Admin/Owner)
- `PUT /api/customers/:id/contacts/:contactId` - Update contact
- `DELETE /api/customers/:id/contacts/:contactId` - Delete contact

#### Asset Routes (`backend/src/routes/asset.routes.ts`)
- `GET /api/assets` - List assets (Role-based filtering)
- `POST /api/assets` - Create asset (Admin/Owner)
- `GET /api/assets/:id` - Get asset details
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset

## Frontend Implementation

### 1. Admin Pages

#### Customer Management (`frontend/src/app/(dashboard)/admin/customers/`)
- **List Page**: Search, pagination, status filtering, CRUD operations
- **Create Page**: Form for customer + owner creation with validation
- **Edit Page**: Update customer information
- **View Page**: Detailed customer view with assets, contacts, tickets

#### Asset Management (`frontend/src/app/(dashboard)/admin/assets/`)
- **List Page**: Search, pagination, customer filtering
- **Create Page**: Asset creation form with customer selection
- **Edit Page**: Asset update form
- **View Page**: Asset details with related tickets

### 2. Customer Owner Pages

#### Assets (`frontend/src/app/(dashboard)/customer/assets/`)
- **List Page**: View and manage own assets with search/filtering
- **Create Page**: Add new assets (customer ID auto-filled)
- **Edit Page**: Update asset information
- **View Page**: Asset details and history

#### Contacts (`frontend/src/app/(dashboard)/customer/contacts/`)
- **List Page**: Manage contacts for their customer
- **Create Page**: Add new contacts
- **Edit Page**: Update contact information

### 3. API Integration

#### Frontend API Routes
- `/api/customers` - Customer CRUD operations
- `/api/assets` - Asset CRUD operations
- `/api/contacts` - Contact management

#### React Query Integration
- Data fetching with loading states
- Optimistic updates for better UX
- Error handling and retry logic

## Key Features

### 1. Role-Based Access Control
- **ADMIN**: Full system access
- **CUSTOMER_OWNER**: Manage own customer's assets and contacts
- **CUSTOMER_CONTACT**: View-only access to customer data
- **SERVICE_PERSON**: Access to assigned ticket assets

### 2. Data Integrity
- Unique email constraints across all users
- Unique machine ID per asset
- Unique serial number per customer
- Transaction-based customer creation
- Referential integrity checks

### 3. Security Features
- JWT-based authentication
- Role-based middleware
- Input validation and sanitization
- SQL injection prevention via Prisma

### 4. User Experience
- Responsive design with Tailwind CSS
- Real-time search and filtering
- Pagination for large datasets
- Loading states and error handling
- Toast notifications for user feedback

## Database Migrations

### Required Migration
```sql
-- Update UserRole enum
ALTER TYPE "UserRole" RENAME VALUE 'CUSTOMER_ACCOUNT_OWNER' TO 'CUSTOMER_OWNER';

-- Add passwordHash to Contact table
ALTER TABLE "Contact" ADD COLUMN "passwordHash" TEXT;
```

### Running Migrations
```bash
cd backend
npx prisma migrate dev --name update_user_roles_and_contact_structure
npx prisma generate
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL="postgresql://username:password@localhost:5432/kardexcare"
JWT_SECRET="your-secret-key-here"
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

## Testing the Implementation

### 1. Create Admin User
```bash
cd backend
node scripts/create-test-user.js
```

### 2. Test Customer Creation
1. Login as admin
2. Navigate to `/admin/customers/create`
3. Fill out customer and owner information
4. Submit form
5. Verify customer, owner user, and owner contact are created

### 3. Test Role-Based Access
1. Login as different user types
2. Verify appropriate access levels
3. Test CRUD operations per role

### 4. Test Asset Management
1. Create assets as admin for different customers
2. Login as customer owner and manage own assets
3. Verify role-based restrictions

## Troubleshooting

### Common Issues

#### 1. Database Migration Errors
- Ensure PostgreSQL is running
- Check database connection string
- Verify Prisma schema syntax

#### 2. Role Permission Errors
- Check JWT token validity
- Verify user role in database
- Check middleware configuration

#### 3. Frontend API Errors
- Verify backend server is running
- Check API endpoint URLs
- Verify authentication headers

### Debug Mode
Enable debug logging in backend:
```typescript
// backend/src/utils/logger.ts
export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
};
```

## Future Enhancements

### 1. Advanced Features
- Asset maintenance scheduling
- Warranty/AMC expiry notifications
- Bulk asset import/export
- Asset performance analytics

### 2. Performance Optimizations
- Database query optimization
- Redis caching for frequently accessed data
- Image optimization for asset photos
- Lazy loading for large datasets

### 3. Security Enhancements
- Two-factor authentication
- Audit logging for all operations
- Rate limiting for API endpoints
- Data encryption at rest

## Support

For technical support or questions about this implementation:
1. Check the troubleshooting section above
2. Review the code comments and documentation
3. Check the GitHub issues for known problems
4. Contact the development team

---

**Last Updated**: December 2024
**Version**: 1.0.0
**Compatibility**: Node.js 18+, PostgreSQL 13+, Next.js 13+
