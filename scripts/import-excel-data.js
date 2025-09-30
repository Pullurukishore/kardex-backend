const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// Configuration
const EXCEL_FILE_PATH = process.argv[2] || './data/import-data.xlsx';
const ADMIN_USER_ID = 1; // Default admin user ID for createdBy/updatedBy fields

// Logging utility
const log = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
  success: (message) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
};

// Statistics tracking
const stats = {
  serviceZonesCreated: 0,
  serviceZonesReused: 0,
  customersCreated: 0,
  customersReused: 0,
  assetsCreated: 0,
  errorsCount: 0,
  totalRows: 0
};

// Cache for created/found entities
const cache = {
  serviceZones: new Map(),
  customers: new Map()
};

/**
 * Validate required columns in Excel file
 */
function validateColumns(worksheet) {
  const requiredColumns = [
    'Name of the Customer',
    'Place', 
    'Department',
    'Zone',
    'Serial Number'
  ];
  
  const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
  
  // Normalize headers by trimming spaces
  const normalizedHeaders = headers.map(h => h ? h.toString().trim() : '');
  
  const missingColumns = requiredColumns.filter(col => {
    return !normalizedHeaders.includes(col) && !normalizedHeaders.includes(col.trim());
  });
  
  if (missingColumns.length > 0) {
    log.error(`Missing required columns: ${missingColumns.join(', ')}`);
    log.info(`Available columns: ${normalizedHeaders.join(', ')}`);
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }
  
  log.info(`All required columns found: ${requiredColumns.join(', ')}`);
  return true;
}

/**
 * Clean and validate data
 */
function cleanData(row) {
  // Handle column names with potential trailing spaces
  const getColumnValue = (columnName) => {
    // Try exact match first
    if (row[columnName]) return row[columnName];
    
    // Try with trailing space
    if (row[columnName + ' ']) return row[columnName + ' '];
    
    // Try trimmed version of all keys
    const trimmedKey = Object.keys(row).find(key => key.trim() === columnName);
    if (trimmedKey && row[trimmedKey]) return row[trimmedKey];
    
    return '';
  };
  
  return {
    customerName: getColumnValue('Name of the Customer').toString().trim(),
    place: getColumnValue('Place').toString().trim(),
    department: getColumnValue('Department').toString().trim(),
    zone: getColumnValue('Zone').toString().trim(),
    serialNumber: getColumnValue('Serial Number').toString().trim()
  };
}

/**
 * Validate row data
 */
function validateRowData(data, rowIndex) {
  const errors = [];
  
  if (!data.customerName) {
    errors.push(`Row ${rowIndex}: Customer name is required`);
  }
  
  if (!data.zone) {
    errors.push(`Row ${rowIndex}: Zone is required`);
  }
  
  // Serial Number is now optional - generate one if missing
  // if (!data.serialNumber) {
  //   errors.push(`Row ${rowIndex}: Serial Number is required`);
  // }
  
  // Department is now optional - no validation error if empty
  // if (!data.department) {
  //   errors.push(`Row ${rowIndex}: Department is required`);
  // }
  
  return errors;
}

/**
 * Upsert ServiceZone - create if doesn't exist, reuse if exists
 */
async function upsertServiceZone(zoneName) {
  // Check cache first
  if (cache.serviceZones.has(zoneName)) {
    stats.serviceZonesReused++;
    return cache.serviceZones.get(zoneName);
  }
  
  try {
    // Try to find existing zone
    let serviceZone = await prisma.serviceZone.findFirst({
      where: {
        name: {
          equals: zoneName,
          mode: 'insensitive' // Case insensitive search
        }
      }
    });
    
    if (serviceZone) {
      log.info(`Reusing existing ServiceZone: ${zoneName}`);
      cache.serviceZones.set(zoneName, serviceZone);
      stats.serviceZonesReused++;
      return serviceZone;
    }
    
    // Create new zone if not found
    serviceZone = await prisma.serviceZone.create({
      data: {
        name: zoneName,
        description: `Auto-created zone for ${zoneName}`,
        isActive: true
      }
    });
    
    log.success(`Created new ServiceZone: ${zoneName}`);
    cache.serviceZones.set(zoneName, serviceZone);
    stats.serviceZonesCreated++;
    return serviceZone;
    
  } catch (error) {
    log.error(`Failed to upsert ServiceZone '${zoneName}': ${error.message}`);
    throw error;
  }
}

/**
 * Upsert Customer - create if doesn't exist, reuse if exists
 */
async function upsertCustomer(customerName, place, serviceZoneId) {
  const customerKey = `${customerName.toLowerCase()}_${serviceZoneId}`;
  
  // Check cache first
  if (cache.customers.has(customerKey)) {
    stats.customersReused++;
    return cache.customers.get(customerKey);
  }
  
  try {
    // Try to find existing customer
    let customer = await prisma.customer.findFirst({
      where: {
        companyName: {
          equals: customerName,
          mode: 'insensitive'
        },
        serviceZoneId: serviceZoneId
      }
    });
    
    if (customer) {
      log.info(`Reusing existing Customer: ${customerName}`);
      cache.customers.set(customerKey, customer);
      stats.customersReused++;
      return customer;
    }
    
    // Create new customer if not found
    customer = await prisma.customer.create({
      data: {
        companyName: customerName,
        address: place || null,
        industry: null, // Not provided in Excel
        timezone: 'UTC',
        serviceZoneId: serviceZoneId,
        isActive: true,
        createdById: ADMIN_USER_ID,
        updatedById: ADMIN_USER_ID
      }
    });
    
    log.success(`Created new Customer: ${customerName}`);
    cache.customers.set(customerKey, customer);
    stats.customersCreated++;
    return customer;
    
  } catch (error) {
    log.error(`Failed to upsert Customer '${customerName}': ${error.message}`);
    throw error;
  }
}

/**
 * Create Asset linked to Customer
 */
async function createAsset(serialNumber, department, customerId) {
  try {
    // Handle missing serial number - generate unique one
    let finalSerialNumber = serialNumber && serialNumber.trim() ? serialNumber.trim() : null;
    
    if (!finalSerialNumber) {
      // Generate unique serial number if missing
      finalSerialNumber = `AUTO_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      log.warn(`Generated serial number '${finalSerialNumber}' for asset with missing serial number`);
    }
    
    // Check if asset with this serial number already exists
    const existingAsset = await prisma.asset.findUnique({
      where: {
        serialNo: finalSerialNumber
      }
    });
    
    if (existingAsset) {
      log.warn(`Asset with serial number '${finalSerialNumber}' already exists. Skipping.`);
      return existingAsset;
    }
    
    // Generate unique machineId (required field)
    const machineId = `MACHINE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Handle empty department - use default value or null
    const assetModel = department && department.trim() ? department.trim() : 'Not Specified';
    
    const asset = await prisma.asset.create({
      data: {
        machineId: machineId,
        model: assetModel,
        serialNo: finalSerialNumber,
        status: 'ACTIVE',
        customerId: customerId,
        location: null, // Not provided in Excel
        purchaseDate: null,
        warrantyEnd: null,
        amcEnd: null
      }
    });
    
    log.success(`Created Asset: ${finalSerialNumber} (Model: ${assetModel}) for customer ID ${customerId}`);
    stats.assetsCreated++;
    return asset;
    
  } catch (error) {
    log.error(`Failed to create Asset '${finalSerialNumber || 'UNKNOWN'}': ${error.message}`);
    throw error;
  }
}

/**
 * Process a single row of data
 */
async function processRow(rowData, rowIndex) {
  try {
    // Clean and validate data
    const data = cleanData(rowData);
    const validationErrors = validateRowData(data, rowIndex);
    
    if (validationErrors.length > 0) {
      validationErrors.forEach(error => log.error(error));
      stats.errorsCount++;
      return false;
    }
    
    log.info(`Processing row ${rowIndex}: ${data.customerName} - ${data.serialNumber}`);
    
    // Step 1: Upsert ServiceZone
    const serviceZone = await upsertServiceZone(data.zone);
    
    // Step 2: Upsert Customer
    const customer = await upsertCustomer(data.customerName, data.place, serviceZone.id);
    
    // Step 3: Create Asset
    await createAsset(data.serialNumber, data.department, customer.id);
    
    return true;
    
  } catch (error) {
    log.error(`Failed to process row ${rowIndex}: ${error.message}`);
    stats.errorsCount++;
    return false;
  }
}

/**
 * Main import function
 */
async function importExcelData() {
  try {
    log.info('Starting Excel data import...');
    
    // Check if file exists
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      throw new Error(`Excel file not found: ${EXCEL_FILE_PATH}`);
    }
    
    // Read Excel file
    log.info(`Reading Excel file: ${EXCEL_FILE_PATH}`);
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Validate columns
    validateColumns(worksheet);
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    stats.totalRows = jsonData.length;
    
    log.info(`Found ${stats.totalRows} rows to process`);
    
    // Verify admin user exists
    const adminUser = await prisma.user.findUnique({
      where: { id: ADMIN_USER_ID }
    });
    
    if (!adminUser) {
      throw new Error(`Admin user with ID ${ADMIN_USER_ID} not found. Please update ADMIN_USER_ID in the script.`);
    }
    
    log.info(`Using admin user: ${adminUser.name || adminUser.email} (ID: ${ADMIN_USER_ID})`);
    
    // Process each row
    let successCount = 0;
    for (let i = 0; i < jsonData.length; i++) {
      const success = await processRow(jsonData[i], i + 2); // +2 because Excel rows start at 1 and we skip header
      if (success) {
        successCount++;
      }
      
      // Add small delay to avoid overwhelming the database
      if (i % 10 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Print summary
    log.success('Import completed!');
    console.log('\n=== IMPORT SUMMARY ===');
    console.log(`Total rows processed: ${stats.totalRows}`);
    console.log(`Successful imports: ${successCount}`);
    console.log(`Errors: ${stats.errorsCount}`);
    console.log(`ServiceZones created: ${stats.serviceZonesCreated}`);
    console.log(`ServiceZones reused: ${stats.serviceZonesReused}`);
    console.log(`Customers created: ${stats.customersCreated}`);
    console.log(`Customers reused: ${stats.customersReused}`);
    console.log(`Assets created: ${stats.assetsCreated}`);
    console.log('=====================\n');
    
  } catch (error) {
    log.error(`Import failed: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Cleanup function for graceful shutdown
 */
process.on('SIGINT', async () => {
  log.info('Received SIGINT, cleaning up...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.info('Received SIGTERM, cleaning up...');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the import
if (require.main === module) {
  importExcelData().catch(console.error);
}

module.exports = {
  importExcelData,
  upsertServiceZone,
  upsertCustomer,
  createAsset
};
