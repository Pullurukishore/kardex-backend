# Excel Data Import Script

This script imports customer and asset data from an Excel file into the Kardex database using Prisma.

## Prerequisites

1. Install required dependencies:
```bash
npm install xlsx
```

2. Ensure your Prisma client is generated:
```bash
npx prisma generate
```

3. Make sure you have an admin user in your database (default ID: 1)

## Excel File Format

Your Excel file should have these exact column headers:
- **Name of the Customer** - Company name
- **Place** - Customer address/location
- **Department** - Will be mapped to Asset.model
- **Zone** - Service zone name
- **Serial Number** - Asset serial number (must be unique)

### Example Excel Structure:
| Name of the Customer | Place | Department | Zone | Serial Number |
|---------------------|-------|------------|------|---------------|
| ABC Corp | Mumbai | Manufacturing | West Zone | SN001 |
| XYZ Ltd | Delhi | IT | North Zone | SN002 |
| ABC Corp | Mumbai | Packaging | West Zone | SN003 |

## Usage

### Basic Usage
```bash
node scripts/import-excel-data.js path/to/your/file.xlsx
```

### Using default file location
Place your Excel file at `./data/import-data.xlsx` and run:
```bash
node scripts/import-excel-data.js
```

## Configuration

### Admin User ID
The script uses `ADMIN_USER_ID = 1` by default for the `createdBy` and `updatedBy` fields in Customer records. 

To change this, edit the script:
```javascript
const ADMIN_USER_ID = 1; // Change this to your admin user ID
```

### File Path
You can specify the Excel file path as a command line argument or modify the default:
```javascript
const EXCEL_FILE_PATH = process.argv[2] || './data/import-data.xlsx';
```

## How It Works

### 1. ServiceZone Processing
- Checks if a ServiceZone with the same name already exists (case-insensitive)
- If exists: Reuses the existing zone
- If not exists: Creates a new ServiceZone

### 2. Customer Processing
- Checks if a Customer with the same company name exists in the same ServiceZone
- If exists: Reuses the existing customer
- If not exists: Creates a new Customer linked to the ServiceZone

### 3. Asset Processing
- Creates a new Asset for each row
- Links the Asset to the Customer
- Uses Department as the Asset model
- Generates a unique machineId automatically
- Skips creation if an Asset with the same serial number already exists

### 4. Data Relationships
```
ServiceZone (1) ←→ (Many) Customer (1) ←→ (Many) Asset
```

## Output

The script provides detailed logging and a summary report:

```
=== IMPORT SUMMARY ===
Total rows processed: 100
Successful imports: 98
Errors: 2
ServiceZones created: 3
ServiceZones reused: 97
Customers created: 25
Customers reused: 75
Assets created: 98
=====================
```

## Error Handling

### Common Errors and Solutions

1. **Missing required columns**
   - Ensure your Excel file has all required column headers exactly as specified

2. **Admin user not found**
   - Update the `ADMIN_USER_ID` constant to match an existing user in your database

3. **Duplicate serial numbers**
   - The script will skip assets with duplicate serial numbers and log a warning

4. **Database connection issues**
   - Ensure your `DATABASE_URL` environment variable is correctly set
   - Check that your database is running and accessible

### Validation Rules

- Customer name is required
- Zone name is required  
- Serial number is required
- Department is required
- Place (address) is optional

## Database Schema Mapping

| Excel Column | Database Field | Notes |
|--------------|----------------|-------|
| Name of the Customer | Customer.companyName | Required |
| Place | Customer.address | Optional |
| Zone | ServiceZone.name | Creates/reuses ServiceZone |
| Serial Number | Asset.serialNo | Must be unique |
| Department | Asset.model | Required |
| - | Asset.machineId | Auto-generated unique ID |
| - | Customer.serviceZoneId | Links to ServiceZone |
| - | Asset.customerId | Links to Customer |

## Performance Notes

- The script includes caching to avoid duplicate database queries
- Small delays are added every 10 rows to avoid overwhelming the database
- Uses upsert patterns to handle duplicates efficiently
- Processes rows sequentially to maintain data integrity

## Troubleshooting

### Check Database Connection
```bash
npx prisma db pull
```

### Verify Admin User Exists
```sql
SELECT id, name, email FROM "User" WHERE id = 1;
```

### Check Existing Data
```sql
-- Check ServiceZones
SELECT * FROM "ServiceZone";

-- Check Customers  
SELECT * FROM "Customer";

-- Check Assets
SELECT * FROM "Asset";
```

## Security Notes

- The script requires an existing admin user for audit trails
- All created records are properly linked with foreign keys
- Input data is cleaned and validated before processing
- Database transactions ensure data consistency
