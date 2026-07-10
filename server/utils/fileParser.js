const fs   = require('fs');
const path = require('path');

// ── Column definitions from PDF

const SCHEMAS = {
  school_approval: {
    label: 'School Approval',
    required: [
      'SL NO',
      'School Name',
      'City/ District',
      'STATE',
      'UDISE CODE',
      'Board (CBSE/ICSE/IB/ SB)',
      'Student Count (6-12)',
      'Teacher Count (6-12)',
      'SPOC Name',
      'SPOC Mobile',
      'SPOC Email',
    ],
    // Normalised aliases (handles slight spacing / case variations)
    aliases: {
      'sl no':                        'SL NO',
      'slno':                         'SL NO',
      'school name':                  'School Name',
      'city/ district':               'City/ District',
      'city/district':                'City/ District',
      'city district':                'City/ District',
      'district':                     'City/ District',
      'state':                        'STATE',
      'udise code':                   'UDISE CODE',
      'udise':                        'UDISE CODE',
      'board (cbse/icse/ib/ sb)':     'Board (CBSE/ICSE/IB/ SB)',
      'board':                        'Board (CBSE/ICSE/IB/ SB)',
      'student count (6-12)':         'Student Count (6-12)',
      'student count':                'Student Count (6-12)',
      'students':                     'Student Count (6-12)',
      'teacher count (6-12)':         'Teacher Count (6-12)',
      'teacher count':                'Teacher Count (6-12)',
      'teachers':                     'Teacher Count (6-12)',
      'spoc name':                    'SPOC Name',
      'spoc mobile':                  'SPOC Mobile',
      'spoc email':                   'SPOC Email',
    },
    validators: {
      'UDISE CODE':              (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
      'SPOC Email':              (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) || 'Invalid email format',
      'Student Count (6-12)':   (v) => !isNaN(Number(v)) || 'Must be a number',
      'Teacher Count (6-12)':   (v) => !isNaN(Number(v)) || 'Must be a number',
      'Board (CBSE/ICSE/IB/ SB)':(v) => ['CBSE','ICSE','IB','SB'].includes(String(v).trim().toUpperCase()) || 'Board must be CBSE, ICSE, IB, or SB',
    },
  },

  student_data: {
    label: 'Student Data',
    required: [
      'First Name',
      'Last Name',
      'Grade',
      'Section',
      'Skillzza UID',
      'School Name',
      'School City,State',
      'UDISE Code',
    ],
    aliases: {
      'first name':        'First Name',
      'firstname':         'First Name',
      'last name':         'Last Name',
      'lastname':          'Last Name',
      'grade':             'Grade',
      'class':             'Grade',
      'section':           'Section',
      'skillzza uid':      'Skillzza UID',
      'uid':               'Skillzza UID',
      'skillzzauid':       'Skillzza UID',
      'school name':       'School Name',
      'school city,state': 'School City,State',
      'school city state': 'School City,State',
      'city,state':        'School City,State',
      'udise code':        'UDISE Code',
      'udise':             'UDISE Code',
    },
    validators: {
      'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
      'Grade':      (v) => {
        const g = Number(v);
        return (Number.isInteger(g) && g >= 6 && g <= 12) || 'Grade must be between 6 and 12';
      },
    },
  },

  teacher_data: {
    label: 'Teacher Data',
    required: [
      'First Name',
      'Last Name',
      'School Name',
      'School City',
      'UDISE Code',
    ],
    aliases: {
      'first name':   'First Name',
      'firstname':    'First Name',
      'last name':    'Last Name',
      'lastname':     'Last Name',
      'school name':  'School Name',
      'school city':  'School City',
      'city':         'School City',
      'udise code':   'UDISE Code',
      'udise':        'UDISE Code',
    },
    validators: {
      'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
    },
  },

  adobe_student_accounts: {
    label: 'Adobe Student Accounts',
    required: ['Name', 'ID', 'Password', 'School Name', 'Class', 'UDISE Code', 'School City', 'State'],
    aliases: {
      'name':        'Name',
      'id':          'ID',
      'password':    'Password',
      'school name': 'School Name',
      'class':       'Class',
      'udise code':  'UDISE Code',
      'udise':       'UDISE Code',
      'school city': 'School City',
      'city':        'School City',
      'state':       'State',
    },
    validators: {
      'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
    },
  },

  adobe_teacher_accounts: {
    label: 'Adobe Teacher Accounts',
    required: ['Name', 'ID', 'Password', 'School Name', 'UDISE Code', 'School City', 'State'],
    aliases: {
      'name':        'Name',
      'id':          'ID',
      'password':    'Password',
      'school name': 'School Name',
      'udise code':  'UDISE Code',
      'udise':       'UDISE Code',
      'school city': 'School City',
      'city':        'School City',
      'state':       'State',
    },
    validators: {
      'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
    },
  },
};

// ── Parse file
const parseFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return parseCSV(filePath);
  } else if (ext === '.xls' || ext === '.xlsx') {
    return parseXLS(filePath);
  }
  throw new Error('Unsupported file type');
};

const parseCSV = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV file must have at least a header row and one data row');

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.every(v => !v.trim())) continue; // skip empty rows
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }

  return { headers, rows };
};

const parseCSVLine = (line) => {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
};

const parseXLS = (filePath) => {
  // Dynamic require — xlsx must be installed
  const XLSX = require('xlsx');
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

  if (data.length === 0) throw new Error('Spreadsheet is empty');

  const headers = Object.keys(data[0]);
  const rows    = data.map(row => {
    const clean = {};
    Object.entries(row).forEach(([k, v]) => { clean[k.trim()] = String(v).trim(); });
    return clean;
  });

  return { headers, rows };
};

// ── Validate 
const validateFile = (parsed, documentType) => {
  const schema = SCHEMAS[documentType];
  if (!schema) throw new Error(`Unknown document type: ${documentType}`);

  const { headers, rows } = parsed;

  // Normalise incoming headers using aliases
  const normalise = (h) => {
    const lower = h.toLowerCase().trim();
    return schema.aliases[lower] || h;
  };

  const normalisedHeaders = headers.map(normalise);

  // Check required columns
  const missing = schema.required.filter(req => !normalisedHeaders.includes(req));
  if (missing.length > 0) {
    return {
      valid:   false,
      errors:  [`Missing required columns: ${missing.join(', ')}`],
      missing,
      rows:    [],
      headers: normalisedHeaders,
    };
  }

  // Validate rows
  const rowErrors = [];
  const validRows = [];

  rows.forEach((row, idx) => {
    const normRow = {};
    Object.entries(row).forEach(([k, v]) => { normRow[normalise(k)] = v; });

    const errs = [];

    // Check required fields not empty
    schema.required.forEach(col => {
      if (!normRow[col] && normRow[col] !== 0) {
        errs.push(`Row ${idx + 2}: "${col}" is empty`);
      }
    });

    // Run field validators
    if (schema.validators) {
      Object.entries(schema.validators).forEach(([col, fn]) => {
        if (normRow[col]) {
          const result = fn(normRow[col]);
          if (result !== true) {
            errs.push(`Row ${idx + 2}: ${result}`);
          }
        }
      });
    }

    if (errs.length > 0) {
      rowErrors.push(...errs);
    } else {
      validRows.push(normRow);
    }
  });

  return {
    valid:      rowErrors.length === 0,
    errors:     rowErrors,
    warnings:   rowErrors.length > 0 && validRows.length > 0 ? [`${rowErrors.length} rows had errors and were skipped`] : [],
    rows:       validRows,
    totalRows:  rows.length,
    validRows:  validRows.length,
    headers:    normalisedHeaders,
    schema:     schema.label,
  };
};

module.exports = { parseFile, validateFile, SCHEMAS };
