const fs   = require('fs');
const path = require('path');

// ── Column definitions from PDF ───────────────────────────────────────────────

const SCHEMAS = {
  school_approval: {
    label: 'LOI',
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
      'board (cbse/icse/ib/sb)':      'Board (CBSE/ICSE/IB/ SB)',
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
    // NOTE: "Skillzza UID" removed from required fields per user request —
    // it's still accepted/normalised if present, just no longer mandatory.
    required: [
      'First Name',
      'Last Name',
      'Grade',
      'Section',
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
      // Grade range check removed per user request — any value is now accepted
    },
  },

  teacher_data: {
    label: 'Teacher Data',
    required: [
      'First Name',
      'Last Name',
      'Email ID',
      'School Name',
      'School City',
      'UDISE Code',
    ],
    aliases: {
      'first name':     'First Name',
      'firstname':      'First Name',
      'last name':      'Last Name',
      'lastname':       'Last Name',
      'email id':       'Email ID',
      'email':          'Email ID',
      'teacher email':  'Email ID',
      'teacher email id':'Email ID',
      'school name':    'School Name',
      'school city':    'School City',
      'city':           'School City',
      'udise code':     'UDISE Code',
      'udise':          'UDISE Code',
    },
    validators: {
      'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
      'Email ID':   (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) || 'Invalid email format',
    },
  },

  adobe_student_accounts: {
    label: 'Adobe Student IDs',
    required: ['Name', 'ID', 'PW', 'School Name', 'Class Section', 'UDISE Code', 'School City', 'State'],
    aliases: {
      'name':          'Name',
      'id':            'ID',
      'pw':            'PW',
      'password':      'PW',
      'school name':   'School Name',
      'class section': 'Class Section',
      'classsection':  'Class Section',
      'class':         'Class Section',
      'udise code':    'UDISE Code',
      'udise':         'UDISE Code',
      'school city':   'School City',
      'city':          'School City',
      'state':         'State',
    },
    validators: {
      'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
    },
  },

  adobe_teacher_accounts: {
    label: 'Adobe Teacher IDs',
    required: ['Name', 'ID', 'PW', 'School Name', 'UDISE Code', 'School City', 'State'],
    aliases: {
      'name':        'Name',
      'id':          'ID',
      'pw':          'PW',
      'password':    'PW',
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

// ── Parse file ────────────────────────────────────────────────────────────────
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
  const XLSX = require('xlsx');
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];

  // Read as a raw grid first — some templates have a merged title row
  // (e.g. "School Approval Format") above the real header row, which would
  // otherwise get mistaken for the header row.
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
  if (grid.length === 0) throw new Error('Spreadsheet is empty');

  let headerRowIdx = 0;
  let bestCount    = 0;
  const scanLimit  = Math.min(grid.length, 5);
  for (let i = 0; i < scanLimit; i++) {
    const nonEmpty = grid[i].filter(c => String(c).trim() !== '').length;
    if (nonEmpty > bestCount) {
      bestCount   = nonEmpty;
      headerRowIdx = i;
    }
  }

  const headers = grid[headerRowIdx].map(h => String(h).trim());
  const rows = grid.slice(headerRowIdx + 1)
    .filter(r => r.some(c => String(c).trim() !== ''))
    .map(r => {
      const clean = {};
      headers.forEach((h, idx) => { clean[h] = String(r[idx] ?? '').trim(); });
      return clean;
    });

  if (rows.length === 0) throw new Error('No data rows found');

  return { headers, rows };
};

// ── Validate against an arbitrary schema object (not just the Document SCHEMAS map) ──
const validateAgainstSchema = (parsed, schema) => {
  const { headers, rows } = parsed;

  const normalise = (h) => {
    // Collapse embedded line breaks/extra spaces (common when a header cell
    // word-wraps in Excel, e.g. "Board (CBSE/ICSE/IB/\n SB)") before matching.
    const lower = h.replace(/\s+/g, ' ').trim().toLowerCase();
    return schema.aliases[lower] || h;
  };

  const normalisedHeaders = headers.map(normalise);

  const missing = schema.required.filter(req => !normalisedHeaders.includes(req));
  if (missing.length > 0) {
    return {
      valid:   false,
      errors:  [`Missing required columns: ${missing.join(', ')}`],
      missing,
      rows:    [],
      totalRows: 0,
      validRows: 0,
      headers: normalisedHeaders,
      schema:  schema.label,
    };
  }

  const rowErrors = [];
  const validRows = [];

  rows.forEach((row, idx) => {
    const normRow = {};
    Object.entries(row).forEach(([k, v]) => { normRow[normalise(k)] = v; });

    const errs = [];

    schema.required.forEach(col => {
      if (!normRow[col] && normRow[col] !== 0) {
        errs.push(`Row ${idx + 2}: "${col}" is empty`);
      }
    });

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
      // Preserve the original spreadsheet row number — callers that report per-row
      // results (e.g. bulk school import) need it, since validRows drops any rows
      // filtered out above and would otherwise mislabel rows by their new index.
      Object.defineProperty(normRow, '__rowNum', { value: idx + 2, enumerable: false });
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

const validateFile = (parsed, documentType) => {
  const schema = SCHEMAS[documentType];
  if (!schema) throw new Error(`Unknown document type: ${documentType}`);
  return validateAgainstSchema(parsed, schema);
};

// ── Bulk import schema for Students Activity (Admin/SuperAdmin only) ───────────
// Separate from the Document SCHEMAS above — this drives a School's studentsActivity
// array directly, not a reviewable Document record.
const STUDENTS_ACTIVITY_SCHEMA = {
  label: 'Students Activity',
  required: ['Student Name'],
  columns: [
    'Student Name', 'Class', 'Section', 'Fiscal Year',
    'MAU Q1', 'MAU Q2', 'MAU Q3', 'MAU Q4',
    'DCAIS Jan', 'DCAIS Feb', 'DCAIS Mar', 'DCAIS Apr', 'DCAIS May', 'DCAIS Jun',
    'DCAIS Jul', 'DCAIS Aug', 'DCAIS Sep', 'DCAIS Oct', 'DCAIS Nov', 'DCAIS Dec',
    'Annual Hackathon Participated', 'Certificate Received', 'Certificate Link',
  ],
  aliases: {
    'student name': 'Student Name',
    'name':         'Student Name',
    'class':        'Class',
    'section':      'Section',
    'fiscal year':  'Fiscal Year',
    'mau q1': 'MAU Q1', 'mau q2': 'MAU Q2', 'mau q3': 'MAU Q3', 'mau q4': 'MAU Q4',
    'q1': 'MAU Q1', 'q2': 'MAU Q2', 'q3': 'MAU Q3', 'q4': 'MAU Q4',
    'dcais jan': 'DCAIS Jan', 'dcais feb': 'DCAIS Feb', 'dcais mar': 'DCAIS Mar', 'dcais apr': 'DCAIS Apr',
    'dcais may': 'DCAIS May', 'dcais jun': 'DCAIS Jun', 'dcais jul': 'DCAIS Jul', 'dcais aug': 'DCAIS Aug',
    'dcais sep': 'DCAIS Sep', 'dcais oct': 'DCAIS Oct', 'dcais nov': 'DCAIS Nov', 'dcais dec': 'DCAIS Dec',
    'jan': 'DCAIS Jan', 'feb': 'DCAIS Feb', 'mar': 'DCAIS Mar', 'apr': 'DCAIS Apr',
    'may': 'DCAIS May', 'jun': 'DCAIS Jun', 'jul': 'DCAIS Jul', 'aug': 'DCAIS Aug',
    'sep': 'DCAIS Sep', 'oct': 'DCAIS Oct', 'nov': 'DCAIS Nov', 'dec': 'DCAIS Dec',
    'annual hackathon participated': 'Annual Hackathon Participated',
    'hackathon participated':        'Annual Hackathon Participated',
    'certificate received': 'Certificate Received',
    'certificate link':     'Certificate Link',
  },
};

// ── Bulk import schema for Teachers Activity (Admin/SuperAdmin only) ───────────
const TEACHERS_ACTIVITY_SCHEMA = {
  label: 'Teachers Activity',
  required: ['Teacher Name'],
  columns: [
    'Teacher Name', 'Fiscal Year',
    'CPD Q1', 'CPD Q2', 'CPD Q3', 'CPD Q4',
    'DCAIS Jan', 'DCAIS Feb', 'DCAIS Mar', 'DCAIS Apr', 'DCAIS May', 'DCAIS Jun',
    'DCAIS Jul', 'DCAIS Aug', 'DCAIS Sep', 'DCAIS Oct', 'DCAIS Nov', 'DCAIS Dec',
    'Certificate Received', 'Certificate Link',
  ],
  aliases: {
    'teacher name': 'Teacher Name',
    'name':         'Teacher Name',
    'fiscal year':  'Fiscal Year',
    'cpd q1': 'CPD Q1', 'cpd q2': 'CPD Q2', 'cpd q3': 'CPD Q3', 'cpd q4': 'CPD Q4',
    'q1': 'CPD Q1', 'q2': 'CPD Q2', 'q3': 'CPD Q3', 'q4': 'CPD Q4',
    'dcais jan': 'DCAIS Jan', 'dcais feb': 'DCAIS Feb', 'dcais mar': 'DCAIS Mar', 'dcais apr': 'DCAIS Apr',
    'dcais may': 'DCAIS May', 'dcais jun': 'DCAIS Jun', 'dcais jul': 'DCAIS Jul', 'dcais aug': 'DCAIS Aug',
    'dcais sep': 'DCAIS Sep', 'dcais oct': 'DCAIS Oct', 'dcais nov': 'DCAIS Nov', 'dcais dec': 'DCAIS Dec',
    'jan': 'DCAIS Jan', 'feb': 'DCAIS Feb', 'mar': 'DCAIS Mar', 'apr': 'DCAIS Apr',
    'may': 'DCAIS May', 'jun': 'DCAIS Jun', 'jul': 'DCAIS Jul', 'aug': 'DCAIS Aug',
    'sep': 'DCAIS Sep', 'oct': 'DCAIS Oct', 'nov': 'DCAIS Nov', 'dec': 'DCAIS Dec',
    'certificate received': 'Certificate Received',
    'certificate link':     'Certificate Link',
  },
};

// ── Bulk import schema for creating many Schools at once (Admin/SuperAdmin only) ──
// School Name/UDISE/Email/Phone/City/State are required — same as the single "Add School"
// form (School.address.city and address.state are `required: true` on the model).
const SCHOOLS_BULK_SCHEMA = {
  label: 'Schools',
  required: ['School Name', 'UDISE Code', 'Email', 'Phone', 'City', 'State'],
  columns: [
    'School Name', 'UDISE Code', 'Email', 'Phone', 'Alt Phone', 'Website',
    'Board', 'School Type', 'Student Count', 'Staff Count',
    'Street', 'City', 'District', 'State', 'Pincode',
    'Principal Name', 'Principal Email', 'Principal Phone',
  ],
  aliases: {
    'school name':      'School Name',
    'name':             'School Name',
    'udise code':       'UDISE Code',
    'udise':            'UDISE Code',
    'email':            'Email',
    'school email':     'Email',
    'phone':            'Phone',
    'school phone':     'Phone',
    'alt phone':        'Alt Phone',
    'website':          'Website',
    'board':            'Board',
    'school type':      'School Type',
    'student count':    'Student Count',
    'staff count':      'Staff Count',
    'street':           'Street',
    'street address':   'Street',
    'city':             'City',
    'district':         'District',
    'state':            'State',
    'pincode':          'Pincode',
    'pin code':         'Pincode',
    'principal name':   'Principal Name',
    'principal email':  'Principal Email',
    'principal phone':  'Principal Phone',
  },
  validators: {
    'UDISE Code': (v) => /^\d{11}$/.test(String(v).trim()) || 'UDISE Code must be 11 digits',
    'Email':      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) || 'Invalid email format',
  },
};

module.exports = { parseFile, validateFile, validateAgainstSchema, SCHEMAS, STUDENTS_ACTIVITY_SCHEMA, TEACHERS_ACTIVITY_SCHEMA, SCHOOLS_BULK_SCHEMA };
