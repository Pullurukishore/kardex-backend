const XLSX = require('xlsx');
const fs = require('fs');

const EXCEL_FILE_PATH = process.argv[2] || './data/import-data.xlsx';

function validateExcelFile() {
  try {
    console.log('🔍 Validating Excel file...\n');
    
    // Check if file exists
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      console.error(`❌ File not found: ${EXCEL_FILE_PATH}`);
      console.log('💡 Make sure your Excel file is at the correct location');
      return false;
    }
    
    console.log(`✅ File found: ${EXCEL_FILE_PATH}`);
    
    // Read Excel file
    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log(`✅ Sheet found: ${sheetName}`);
    
    // Get headers
    const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
    console.log(`✅ Headers found: ${headers.length} columns`);
    
    // Required columns
    const requiredColumns = [
      'Name of the Customer',
      'Place',
      'Department', 
      'Zone',
      'Serial Number'
    ];
    
    // Normalize headers by trimming spaces
    const normalizedHeaders = headers.map(h => h ? h.toString().trim() : '');
    
    console.log('\n📋 Column Validation:');
    let allColumnsValid = true;
    
    requiredColumns.forEach(col => {
      const found = normalizedHeaders.includes(col) || headers.includes(col);
      if (found) {
        console.log(`  ✅ "${col}" - Found`);
      } else {
        console.log(`  ❌ "${col}" - Missing`);
        allColumnsValid = false;
      }
    });
    
    // Show actual headers
    console.log('\n📝 Your Excel Headers:');
    headers.forEach((header, index) => {
      const isRequired = requiredColumns.includes(header);
      const status = isRequired ? '✅' : '⚠️';
      console.log(`  ${status} Column ${index + 1}: "${header}"`);
    });
    
    // Get data preview
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`\n📊 Data Summary:`);
    console.log(`  Total rows: ${jsonData.length}`);
    
    if (jsonData.length > 0) {
      console.log('\n🔍 First 3 rows preview:');
      jsonData.slice(0, 3).forEach((row, index) => {
        console.log(`\n  Row ${index + 1}:`);
        requiredColumns.forEach(col => {
          // Handle column names with potential trailing spaces
          let value = row[col];
          if (!value && row[col + ' ']) {
            value = row[col + ' '];
          }
          if (!value) {
            const trimmedKey = Object.keys(row).find(key => key.trim() === col);
            if (trimmedKey) value = row[trimmedKey];
          }
          value = value || '[EMPTY]';
          console.log(`    ${col}: ${value}`);
        });
      });
    }
    
    // Validation summary
    console.log('\n' + '='.repeat(50));
    if (allColumnsValid && jsonData.length > 0) {
      console.log('🎉 VALIDATION PASSED!');
      console.log('✅ Your Excel file is ready for import');
      console.log('\n🚀 To import, run:');
      console.log(`   npm run import:excel "${EXCEL_FILE_PATH}"`);
    } else {
      console.log('❌ VALIDATION FAILED!');
      if (!allColumnsValid) {
        console.log('🔧 Fix: Make sure all required column headers are exactly as shown above');
      }
      if (jsonData.length === 0) {
        console.log('🔧 Fix: Add data rows to your Excel file');
      }
    }
    console.log('='.repeat(50));
    
    return allColumnsValid && jsonData.length > 0;
    
  } catch (error) {
    console.error(`❌ Error validating file: ${error.message}`);
    return false;
  }
}

// Run validation
if (require.main === module) {
  const isValid = validateExcelFile();
  process.exit(isValid ? 0 : 1);
}

module.exports = { validateExcelFile };
