const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Sample data for demonstration
const sampleData = [
  {
    'Name of the Customer': 'ABC Manufacturing Ltd',
    'Place': 'Mumbai, Maharashtra',
    'Department': 'Production Line A',
    'Zone': 'West Zone',
    'Serial Number': 'SN001-ABC-2024'
  },
  {
    'Name of the Customer': 'XYZ Industries',
    'Place': 'Delhi, NCR',
    'Department': 'Quality Control',
    'Zone': 'North Zone', 
    'Serial Number': 'SN002-XYZ-2024'
  },
  {
    'Name of the Customer': 'ABC Manufacturing Ltd',
    'Place': 'Mumbai, Maharashtra',
    'Department': 'Packaging Unit',
    'Zone': 'West Zone',
    'Serial Number': 'SN003-ABC-2024'
  },
  {
    'Name of the Customer': 'TechCorp Solutions',
    'Place': 'Bangalore, Karnataka',
    'Department': 'IT Infrastructure',
    'Zone': 'South Zone',
    'Serial Number': 'SN004-TECH-2024'
  },
  {
    'Name of the Customer': 'Global Textiles',
    'Place': 'Chennai, Tamil Nadu',
    'Department': 'Weaving Department',
    'Zone': 'South Zone',
    'Serial Number': 'SN005-GT-2024'
  },
  {
    'Name of the Customer': 'XYZ Industries',
    'Place': 'Delhi, NCR',
    'Department': 'Assembly Line',
    'Zone': 'North Zone',
    'Serial Number': 'SN006-XYZ-2024'
  }
];

function createSampleExcel() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('Created data directory');
    }
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Data');
    
    // Write to file
    const filePath = path.join(dataDir, 'sample-import-data.xlsx');
    XLSX.writeFile(workbook, filePath);
    
    console.log(`Sample Excel file created: ${filePath}`);
    console.log('This file contains sample data showing the required format.');
    console.log('You can use this as a template for your actual data.');
    
    // Also create an empty template
    const templateData = [{
      'Name of the Customer': '',
      'Place': '',
      'Department': '',
      'Zone': '',
      'Serial Number': ''
    }];
    
    const templateWorkbook = XLSX.utils.book_new();
    const templateWorksheet = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(templateWorkbook, templateWorksheet, 'Template');
    
    const templatePath = path.join(dataDir, 'import-template.xlsx');
    XLSX.writeFile(templateWorkbook, templatePath);
    
    console.log(`Empty template created: ${templatePath}`);
    console.log('Use this template to add your actual data.');
    
  } catch (error) {
    console.error('Error creating sample Excel file:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  createSampleExcel();
}

module.exports = { createSampleExcel };
