# Excel Data Import Guide

This guide will help you import customer and asset data from Excel files into your Kardex database.

## Quick Start

### 1. Create Sample Excel Files
```bash
npm run create:sample-excel
```
This creates:
- `data/sample-import-data.xlsx` - Example with sample data
- `data/import-template.xlsx` - Empty template for your data

### 2. Prepare Your Data
Use the template or follow this format:

| Name of the Customer | Place | Department | Zone | Serial Number |
|---------------------|-------|------------|------|---------------|
| ABC Corp | Mumbai | Manufacturing | West Zone | SN001 |
| XYZ Ltd | Delhi | IT | North Zone | SN002 |

### 3. Import Your Data
```bash
# Using default location (data/import-data.xlsx)
npm run import:excel

# Using custom file path
npm run import:excel path/to/your/file.xlsx
```

## Data Mapping

Your Excel data will be imported as follows:

### ServiceZone Creation/Reuse
- **Excel Column**: Zone
- **Database**: ServiceZone table
- **Logic**: Creates new zones or reuses existing ones (case-insensitive)

### Customer Creation/Reuse  
- **Excel Columns**: Name of the Customer + Place
- **Database**: Customer table
- **Logic**: Creates new customers or reuses existing ones per zone
- **Fields**:
  - `companyName` ← Name of the Customer
  - `address` ← Place
  - `serviceZoneId` ← Links to ServiceZone

### Asset Creation
- **Excel Columns**: Serial Number + Department
- **Database**: Asset table  
- **Logic**: Creates new asset for each row (skips duplicates)
- **Fields**:
  - `serialNo` ← Serial Number (must be unique)
  - `model` ← Department
  - `machineId` ← Auto-generated unique ID
  - `customerId` ← Links to Customer

## Important Rules

### Duplicate Handling
1. **ServiceZones**: Reused if same name exists (case-insensitive)
2. **Customers**: Reused if same company name exists in same zone
3. **Assets**: Skipped if serial number already exists

### Required Fields
- Name of the Customer ✅ Required
- Zone ✅ Required  
- Serial Number ✅ Required
- Department ✅ Required
- Place ⚠️ Optional

### Data Relationships
```
ServiceZone (1) ←→ (Many) Customer (1) ←→ (Many) Asset
```

## Example Scenarios

### Scenario 1: New Customer with Multiple Assets
```
Row 1: ABC Corp | Mumbai | Production | West Zone | SN001
Row 2: ABC Corp | Mumbai | Packaging | West Zone | SN002
```
**Result**: 
- 1 ServiceZone (West Zone)
- 1 Customer (ABC Corp)  
- 2 Assets (SN001, SN002)

### Scenario 2: Multiple Customers in Same Zone
```
Row 1: ABC Corp | Mumbai | Production | West Zone | SN001
Row 2: XYZ Ltd | Pune | Manufacturing | West Zone | SN002
```
**Result**:
- 1 ServiceZone (West Zone)
- 2 Customers (ABC Corp, XYZ Ltd)
- 2 Assets (SN001, SN002)

### Scenario 3: Same Customer in Different Zones
```
Row 1: ABC Corp | Mumbai | Production | West Zone | SN001  
Row 2: ABC Corp | Delhi | IT | North Zone | SN002
```
**Result**:
- 2 ServiceZones (West Zone, North Zone)
- 2 Customers (ABC Corp in each zone)
- 2 Assets (SN001, SN002)

## Configuration

### Admin User Setup
The script requires an admin user for audit trails. Default is user ID 1.

To change this, edit `scripts/import-excel-data.js`:
```javascript
const ADMIN_USER_ID = 1; // Change to your admin user ID
```

### File Paths
Default file location: `data/import-data.xlsx`

You can specify custom paths:
```bash
node scripts/import-excel-data.js /path/to/your/file.xlsx
```

## Error Handling

### Common Issues

1. **Missing Admin User**
   ```
   Error: Admin user with ID 1 not found
   ```
   **Solution**: Update `ADMIN_USER_ID` or create admin user

2. **Missing Required Columns**
   ```
   Error: Missing required columns: Zone, Serial Number
   ```
   **Solution**: Ensure Excel has exact column headers

3. **Duplicate Serial Numbers**
   ```
   Warning: Asset with serial number 'SN001' already exists. Skipping.
   ```
   **Solution**: Use unique serial numbers or remove duplicates

4. **Database Connection**
   ```
   Error: Can't reach database server
   ```
   **Solution**: Check DATABASE_URL and database status

### Validation Rules
- Customer name cannot be empty
- Zone name cannot be empty
- Serial number cannot be empty
- Department cannot be empty
- Serial numbers must be unique across all assets

## Output Example

```
[INFO] 2024-01-15T10:30:00.000Z - Starting Excel data import...
[INFO] 2024-01-15T10:30:00.100Z - Reading Excel file: data/import-data.xlsx
[INFO] 2024-01-15T10:30:00.200Z - Found 100 rows to process
[SUCCESS] 2024-01-15T10:30:01.000Z - Created new ServiceZone: West Zone
[SUCCESS] 2024-01-15T10:30:01.100Z - Created new Customer: ABC Corp
[SUCCESS] 2024-01-15T10:30:01.200Z - Created Asset: SN001 for customer ID 1
[INFO] 2024-01-15T10:30:01.300Z - Reusing existing Customer: ABC Corp
[SUCCESS] 2024-01-15T10:30:01.400Z - Created Asset: SN002 for customer ID 1

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

## Database Verification

After import, verify your data:

```sql
-- Check ServiceZones
SELECT id, name, description FROM "ServiceZone";

-- Check Customers
SELECT id, "companyName", address, "serviceZoneId" FROM "Customer";

-- Check Assets  
SELECT id, "machineId", model, "serialNo", "customerId" FROM "Asset";

-- Check relationships
SELECT 
  c."companyName",
  sz.name as zone_name,
  a.model,
  a."serialNo"
FROM "Customer" c
JOIN "ServiceZone" sz ON c."serviceZoneId" = sz.id  
JOIN "Asset" a ON a."customerId" = c.id
ORDER BY sz.name, c."companyName", a."serialNo";
```

## Performance Tips

1. **Large Files**: For files with 1000+ rows, consider splitting into smaller batches
2. **Database Load**: The script includes automatic delays to prevent overwhelming the database
3. **Memory Usage**: Large Excel files are processed row by row to minimize memory usage
4. **Caching**: The script caches ServiceZones and Customers to avoid duplicate queries

## Troubleshooting

### Check Prerequisites
```bash
# Verify Prisma client
npx prisma generate

# Check database connection
npx prisma db pull

# Verify admin user exists
npx prisma studio
```

### Test with Sample Data
```bash
# Create sample files
npm run create:sample-excel

# Test import with sample data
cp data/sample-import-data.xlsx data/import-data.xlsx
npm run import:excel
```

### Debug Mode
For detailed debugging, modify the script to add more logging:
```javascript
// Add this for more verbose output
console.log('Processing row:', JSON.stringify(data, null, 2));
```

## Support

If you encounter issues:
1. Check the error logs for specific error messages
2. Verify your Excel file format matches the requirements
3. Ensure database connectivity and admin user setup
4. Test with the provided sample data first
