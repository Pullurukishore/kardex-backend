# Quick Start - Import Your Real Excel Data

## Step 1: Prepare Your Excel File

Make sure your Excel file has these **exact** column headers:
- `Name of the Customer`
- `Place` 
- `Department`
- `Zone`
- `Serial Number`

## Step 2: Place Your Excel File

Put your Excel file in one of these locations:
- `c:\KardexCare\backend\data\import-data.xlsx` (default location)
- Or any path you prefer (you'll specify it in the command)

## Step 3: Check Admin User

The script needs an admin user ID for audit trails. Check your database:

```sql
SELECT id, name, email FROM "User" WHERE role = 'ADMIN' LIMIT 1;
```

If your admin user ID is not 1, edit `scripts/import-excel-data.js` line 8:
```javascript
const ADMIN_USER_ID = 1; // Change this to your admin user ID
```

## Step 4: Run the Import

### Option A: Default location
```bash
# Place your file at: data/import-data.xlsx
npm run import:excel
```

### Option B: Custom location  
```bash
npm run import:excel "C:\path\to\your\excel\file.xlsx"
```

## Step 5: Monitor the Output

The script will show:
- ✅ ServiceZones created/reused
- ✅ Customers created/reused  
- ✅ Assets created
- ❌ Any errors with specific row numbers
- 📊 Final summary report

## What Happens During Import

1. **ServiceZones**: Creates new zones or reuses existing ones
2. **Customers**: Creates new customers or links to existing ones in the same zone
3. **Assets**: Creates new assets linked to customers (skips duplicates by serial number)

## Example Output
```
[INFO] Starting Excel data import...
[INFO] Found 150 rows to process
[SUCCESS] Created new ServiceZone: North Zone
[SUCCESS] Created new Customer: ABC Manufacturing
[SUCCESS] Created Asset: SN12345 for customer ID 1
[INFO] Reusing existing ServiceZone: North Zone
[SUCCESS] Created new Customer: XYZ Industries  
[SUCCESS] Created Asset: SN12346 for customer ID 2

=== IMPORT SUMMARY ===
Total rows processed: 150
Successful imports: 148
Errors: 2
ServiceZones created: 4
ServiceZones reused: 146
Customers created: 45
Customers reused: 105
Assets created: 148
=====================
```

## If You Get Errors

### Missing Columns Error
```
Error: Missing required columns: Zone
```
**Fix**: Check your Excel column headers match exactly

### Admin User Error  
```
Error: Admin user with ID 1 not found
```
**Fix**: Update `ADMIN_USER_ID` in the script or create admin user

### Duplicate Serial Number
```
Warning: Asset with serial number 'SN001' already exists. Skipping.
```
**Fix**: This is normal - duplicates are automatically skipped

## Ready to Import?

1. ✅ Excel file has correct column headers
2. ✅ File is accessible at chosen location  
3. ✅ Admin user ID is correct in script
4. ✅ Database is running and accessible

Run the command and watch the magic happen! 🚀
