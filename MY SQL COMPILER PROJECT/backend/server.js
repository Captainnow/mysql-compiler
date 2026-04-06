const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const xml2js = require('xml2js');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

// Database connection (Persistent Database)
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database (Acting as MySQL Proxy).');
  }
});

const sanitizeSql = (sql) => {
  return sql
    .replace(/AUTO_INCREMENT/gi, '')
    .replace(/ENGINE\s*=\s*\w+/gi, '')
    .replace(/DEFAULT CHARSET\s*=\s*\w+/gi, '')
    .replace(/COLLATE\s*=\s*\w+/gi, '')
    .replace(/CHARACTER SET\s*\w+/gi, '')
    .replace(/int\([0-9]+\)/gi, 'INTEGER')
    .replace(/tinyint\([0-9]+\)/gi, 'INTEGER')
    .replace(/bigint\([0-9]+\)/gi, 'INTEGER');
};

const runAll = (query) => new Promise((resolve, reject) => {
  db.all(query, [], (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const runExec = (query) => new Promise((resolve, reject) => {
  db.exec(query, function(err) {
    if (err) reject(err);
    else resolve(this.changes || 0);
  });
});

app.post('/api/execute', async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ success: false, message: 'Query is missing or invalid' });
  }

  console.log(`\n========================================`);
  console.log(`[SQL COMPILER] Compiling Sequential Multi-Query:`);
  console.log(`----------------------------------------`);
  console.log(`${query.trim()}`);
  console.log(`----------------------------------------`);

  const safeQuery = sanitizeSql(query);
  const statements = safeQuery.split(';')
    .map(s => s.trim())
    .filter(s => {
       const noComments = s.replace(/--.*(?:\n|$)/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
       return noComments.length > 0;
    });
  
  let lastResult = null;
  let isLastResultSelect = false;

  try {
    for (const stmt of statements) {
      const isSel = /^\s*(?:--.*?\n\s*|\/\*[\s\S]*?\*\/\s*)*(SELECT|PRAGMA|EXPLAIN)/i.test(stmt);
      if (isSel) {
        lastResult = await runAll(stmt);
        isLastResultSelect = true;
      } else {
        lastResult = await runExec(stmt);
        isLastResultSelect = false;
      }
    }
    
    console.log(`[SQL COMPILER] SUCCESS: Processed ${statements.length} queries.`);
    console.log(`========================================\n`);

    if (isLastResultSelect) {
      res.json({
        success: true,
        data: lastResult,
        columns: lastResult.length > 0 ? Object.keys(lastResult[0]) : []
      });
    } else {
      res.json({
        success: true,
        data: { changes: lastResult || 0, message: "Query executed successfully" },
        columns: []
      });
    }
  } catch (err) {
    console.error(`[SQL COMPILER] ERROR: ${err.message}`);
    console.log(`========================================\n`);
    res.status(500).json({ success: false, message: err.message, code: 'SQLITE_ERROR' });
  }
});

const processInsertRows = (results, tableName, filePath, res) => {
  if (!results || results.length === 0) {
    fs.unlink(filePath, () => {});
    return res.status(400).json({ success: false, message: 'Empty Dataset' });
  }
  
  const headers = Object.keys(results[0]);
  const safeHeaders = headers.map((h, i) => {
    let safe = h.replace(/[^a-zA-Z0-9_]/g, '').trim();
    if (!safe) safe = 'col_' + i;
    return safe;
  });
  
  const createTableSql = `CREATE TABLE IF NOT EXISTS ${tableName} (${safeHeaders.map(h => `${h} TEXT`).join(', ')});`;
  
  console.log(`\n========================================`);
  console.log(`[SQL COMPILER] Importing dataset to table: ${tableName} (${results.length} rows)`);
  console.log(`========================================\n`);
  
  db.exec(createTableSql, (err) => {
    if (err) {
      fs.unlink(filePath, () => {});
      return res.status(500).json({ success: false, message: err.message });
    }
    
    const placeholders = safeHeaders.map(() => '?').join(',');
    const insertSql = `INSERT INTO ${tableName} (${safeHeaders.join(',')}) VALUES (${placeholders})`;
    const stmt = db.prepare(insertSql);
    
    db.serialize(() => {
      results.forEach(row => {
        const values = headers.map(h => row[h] !== undefined && row[h] !== null ? String(row[h]) : null);
        stmt.run(values);
      });
      stmt.finalize((err) => {
         fs.unlink(filePath, () => {}); 
         if (err) return res.status(500).json({ success: false, message: err.message });
         res.json({ success: true, message: `Successfully imported ${results.length} rows into table '${tableName}'` });
      });
    });
  });
};

app.post('/api/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  let tableName = req.file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const ext = req.file.originalname.split('.').pop().toLowerCase();
  if (/^[0-9]/.test(tableName)) tableName = 't_' + tableName;

  if (ext === 'csv') {
    const results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => processInsertRows(results, tableName, req.file.path, res));
  } else if (ext === 'xlsx' || ext === 'xls') {
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
      processInsertRows(data, tableName, req.file.path, res);
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ success: false, message: 'Error parsing Excel file' });
    }
  } else if (ext === 'xml') {
    try {
      const xmlContent = fs.readFileSync(req.file.path, 'utf8');
      const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
      parser.parseString(xmlContent, (err, result) => {
        if (err) {
          fs.unlink(req.file.path, () => {});
          return res.status(500).json({ success: false, message: 'Error parsing XML file' });
        }
        
        let data = [];
        const traverse = (node) => {
          if (Array.isArray(node)) {
            if (node.length > 0 && typeof node[0] === 'object') data = node;
            return;
          }
          if (typeof node === 'object' && node !== null) {
            Object.values(node).forEach(traverse);
          }
        };
        traverse(result);
        if (data.length === 0) data = [result]; // fallback
        
        processInsertRows(data, tableName, req.file.path, res);
      });
    } catch (err) {
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ success: false, message: 'Error reading XML file' });
    }
  } else {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: `Unsupported dataset format: .${ext}` });
  }
});

app.post('/api/import-sql', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  console.log(`\n========================================`);
  console.log(`[SQL COMPILER] Importing & Executing SQL File: ${req.file.originalname}`);
  console.log(`========================================\n`);

  fs.readFile(req.file.path, 'utf8', (err, sql) => {
    if (err) {
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ success: false, message: 'Failed to read SQL file' });
    }

    const safeSql = sanitizeSql(sql);
    db.exec(safeSql, function(err) {
      fs.unlink(req.file.path, () => {});
      if (err) {
        return res.status(500).json({ success: false, message: err.message, code: 'SQLITE_ERROR' });
      }
      res.json({ success: true, message: 'SQL file executed successfully.' });
    });
  });
});

app.get('/api/setup', (req, res) => {
  const setupQueries = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    INSERT INTO users (username, email) VALUES 
    ('alice_dev', 'alice@example.com'),
    ('bob_admin', 'bob@example.com'),
    ('charlie_data', 'charlie@example.com');
  `;
  
  db.exec(setupQueries, (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: 'Setup completed. Run SELECT * FROM users;' });
  });
});

// Fetch all imported tables
app.get('/api/tables', (req, res) => {
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    const tables = rows.map(r => r.name);
    res.json({ success: true, tables });
  });
});

// Delete a specific table
app.delete('/api/tables/:tableName', (req, res) => {
  const tableName = req.params.tableName;
  // Basic validation to prevent SQL injection in DROP TABLE since it can't be parameterized
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return res.status(400).json({ success: false, message: 'Invalid table name' });
  }

  db.exec(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: `Table ${tableName} deleted successfully` });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
