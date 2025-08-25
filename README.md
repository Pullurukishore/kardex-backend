# KardexCare - Asset Management System

A comprehensive asset management system built with Next.js (App Router), Node.js (Express), and PostgreSQL with JWT-based authentication.

## Role-Based Asset Management

The system implements comprehensive role-based permissions for asset management:

### User Roles
- **Admin**: Full access to all assets across all customers
- **CustomerOwner**: Can manage assets only for their own customer
- **CustomerContact**: Read-only access to their customer's assets
- **ServicePerson**: Can only view assets linked to tickets assigned to them

### Backend Implementation

#### Middleware (`backend/src/middleware/auth.middleware.ts`)
- **`canManageAssets`**: New middleware that enforces role-based asset management permissions
  - Admin: Full access to all assets
  - CustomerOwner: Can only manage assets for their own customerId
  - CustomerContact & ServicePerson: Cannot manage assets

#### Asset Controller (`backend/src/controllers/asset.controller.ts`)
- **Role-based filtering** in `listAssets`:
  - Admin: Can view all assets with optional customerId filter
  - CustomerOwner/CustomerContact: Only their own customer's assets
  - ServicePerson: Only assets linked to tickets assigned to them
- **Access control** in `getAsset`:
  - Validates user permissions before returning asset details
- **Serial number validation**: Ensures serialNo is unique per customer

#### Asset Routes (`backend/src/routes/asset.routes.ts`)
- **GET `/api/assets`**: Role-based access for all user types
- **POST `/api/assets`**: Admin and CustomerOwner only (with `canManageAssets` middleware)
- **PUT `/api/assets/:id`**: Admin and CustomerOwner only (with `canManageAssets` middleware)
- **DELETE `/api/assets/:id`**: Admin only

### Frontend Implementation

#### Asset Service (`frontend/src/services/assetService.ts`)
- **Permission helpers**:
  - `canManageAssets(userRole)`: Returns true for Admin and CustomerOwner
  - `canDeleteAssets(userRole)`: Returns true for Admin only
  - `canViewAssets(userRole)`: Returns true for all roles
- **Updated API calls** to work with new role-based endpoints

#### Asset Add Page (`frontend/src/app/(dashboard)/admin/assets/add/page.tsx`)
- **Role-based form behavior**:
  - Admin: Shows customer dropdown with all customers
  - CustomerOwner: Auto-fills customerId from JWT, hides dropdown
  - CustomerContact/ServicePerson: Access denied
- **Validation**: Ensures CustomerOwner can only create assets for their own customer

#### Asset List Page (`frontend/src/app/(dashboard)/admin/assets/page.tsx`)
- **Role-based UI**:
  - Admin: Full access to all features including customer filter
  - CustomerOwner: Can manage their assets, no customer filter
  - CustomerContact/ServicePerson: Read-only view, no management buttons
- **Conditional rendering** of Add/Edit/Delete buttons based on permissions

#### Updated Types (`frontend/src/types/asset.d.ts`)
- **Asset interface** updated to match database schema
- **AssetFormData** updated for new field structure
- **User interface** updated to include customerId and customer relation

### Database Schema

#### Asset Model (`backend/prisma/schema.prisma`)
- **Unique constraint**: `@@unique([serialNo, customerId])` ensures serial numbers are unique per customer
- **Fields**: machineId, model, serialNo, purchaseDate, warrantyStart/End, amcStart/End, location, status, customerId

### Key Features

1. **Serial Number Validation**: Enforced at both database and application levels
2. **Role-Based Access Control**: Comprehensive permissions system
3. **Customer Isolation**: Users can only access assets for their assigned customer
4. **Service Person Filtering**: ServicePerson can only see assets related to their assigned tickets
5. **UI Adaptation**: Interface adapts based on user role and permissions

### Security Features

- **JWT-based authentication** with role validation
- **Middleware-based authorization** for all asset operations
- **Customer-level data isolation** preventing cross-customer access
- **Input validation** and sanitization
- **Error handling** with appropriate HTTP status codes

### API Endpoints

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/assets` | All | List assets (role-filtered) |
| GET | `/api/assets/:id` | All | Get asset details (role-validated) |
| POST | `/api/assets` | Admin, CustomerOwner | Create asset |
| PUT | `/api/assets/:id` | Admin, CustomerOwner | Update asset |
| DELETE | `/api/assets/:id` | Admin | Delete asset |

### Usage Examples

#### Admin User
- Can view all assets across all customers
- Can create, edit, and delete any asset
- Has access to customer filter dropdown
- Can manage assets for any customer

#### CustomerOwner User
- Can only view and manage assets for their own customer
- CustomerId is auto-filled in forms
- Cannot access other customers' assets
- Can create and edit assets for their customer

#### CustomerContact User
- Read-only access to their customer's assets
- Cannot create, edit, or delete assets
- No management buttons shown in UI

#### ServicePerson User
- Can only view assets linked to tickets assigned to them
- Read-only access
- No management capabilities

This implementation provides a secure, role-based asset management system that ensures data isolation and appropriate access control based on user roles and customer assignments.
