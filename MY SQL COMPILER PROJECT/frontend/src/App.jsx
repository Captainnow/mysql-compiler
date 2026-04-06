import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, Database, AlertCircle, Clock, Upload, Download,
  Trash2, Code, ChevronRight, Activity, HardDrive, FileJson
} from 'lucide-react';
import axios from 'axios';
import './index.css';

const API_BASE_URL = 'http://localhost:3000/api';

function App() {
  const [query, setQuery] = useState('-- Download the SQL file below to populate the database\nSELECT * FROM users LIMIT 10;\n');
  const [results, setResults] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState(0);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('query_editor');

  const [isFabOpen, setIsFabOpen] = useState(false);
  const [tablesList, setTablesList] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const sqlFileInputRef = useRef(null);

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      let currentText = editor.getModel().getValueInRange(editor.getSelection());
      if (!currentText || !currentText.trim()) {
        currentText = editor.getValue();
      }
      executeQuery(currentText);
    });
  }

  const executeQuery = async (queryText) => {
    const textToRun = typeof queryText === 'string' ? queryText : query;
    if (!textToRun.trim()) return;

    setIsExecuting(true);
    const startTime = performance.now();

    try {
      const response = await axios.post(`${API_BASE_URL}/execute`, { query: textToRun });
      setResults({ type: 'success', data: response.data.data, columns: response.data.columns });
    } catch (err) {
      setResults({
        type: 'error',
        error: err.response?.data?.message || err.message,
        code: err.response?.data?.code || 'UNKNOWN_ERROR',
        sqlState: err.response?.data?.sqlState || ''
      });
    } finally {
      const endTime = performance.now();
      setExecutionTime((endTime - startTime).toFixed(2));
      setTimeout(() => setIsExecuting(false), 200); // small delay for UX
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      executeQuery();
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setIsExecuting(true);
    setShowImportMenu(false);

    try {
      const res = await axios.post(`${API_BASE_URL}/import`, formData);
      alert(res.data.message);

      let initialTableName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      if (/^[0-9]/.test(initialTableName)) initialTableName = 't_' + initialTableName;

      const newQuery = `SELECT * FROM ${initialTableName} LIMIT 50;`;
      setQuery(newQuery);

      const response = await axios.post(`${API_BASE_URL}/execute`, { query: newQuery });
      setResults({ type: 'success', data: response.data.data, columns: response.data.columns });
    } catch (err) {
      alert("Error importing CSV: " + (err.response?.data?.message || err.message));
    } finally {
      setIsExecuting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportSql = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setIsExecuting(true);
    setShowImportMenu(false);

    try {
      const res = await axios.post(`${API_BASE_URL}/import-sql`, formData);
      alert(res.data.message);
      setResults({ type: 'success', data: { changes: "SQL File executed successfully." }, columns: [] });
    } catch (err) {
      alert("Error importing SQL: " + (err.response?.data?.message || err.message));
    } finally {
      setIsExecuting(false);
      if (sqlFileInputRef.current) sqlFileInputRef.current.value = '';
    }
  };

  const exportSQL = () => {
    if (!results || results.type !== 'success' || !Array.isArray(results.data) || results.data.length === 0) return;

    const tableName = 'exported_results';
    const columns = results.columns.join(', ');

    let sqlContent = `-- MySQL Compiler Platform Export\n`;
    sqlContent += `-- Generated Dataset\n\n`;

    sqlContent += `CREATE TABLE IF NOT EXISTS ${tableName} (\n  `;
    sqlContent += results.columns.map(c => `\`${c}\` TEXT`).join(',\n  ');
    sqlContent += `\n);\n\n`;

    results.data.forEach(row => {
      const values = results.columns.map(col => {
        let val = row[col];
        if (val === null) return 'NULL';
        if (typeof val === 'object') val = JSON.stringify(val);
        return typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
      }).join(', ');

      sqlContent += `INSERT INTO ${tableName} (${results.columns.map(c => `\`${c}\``).join(', ')}) VALUES (${values});\n`;
    });

    const blob = new Blob([sqlContent], { type: 'text/sql;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "exported_dataset.sql");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearEditor = () => {
    setQuery('');
    setResults(null);
  };

  const affectedRowsCount = results?.data?.changes !== undefined
    ? results.data.changes
    : (Array.isArray(results?.data) ? results.data.length : 0);

  const fetchTables = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/tables`);
      setTablesList(res.data.tables || []);
    } catch (err) {
      console.error('Error fetching tables', err);
    }
  };

  const toggleFab = () => {
    if (!isFabOpen) fetchTables();
    setIsFabOpen(!isFabOpen);
    setContextMenu(null);
  };

  const handleContextMenu = (e, tableName) => {
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, tableName });
  };

  const handlePreviewTable = (tableName) => {
    setIsFabOpen(false);
    setContextMenu(null);
    const newQuery = `SELECT * FROM ${tableName};`;
    setQuery(newQuery);
    executeQuery(newQuery);
  };

  const handleDeleteTable = async (tableName) => {
    setContextMenu(null);
    try {
      await axios.delete(`${API_BASE_URL}/tables/${tableName}`);
      fetchTables();
    } catch (err) {
      alert("Error deleting table");
    }
  };

  return (
    <div className="main-container" onKeyDown={handleKeyDown} onClick={() => setContextMenu(null)}>
      {/* HEADER SECTION */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-box">
            <Database className="logo-icon-purple" size={20} />
          </div>
          <div className="title-group">
            <div className="title-row">
              <h1 className="logo-text">MySQL Comp...</h1>
              <span className="badge-light">Download HTML</span>
            </div>
            <span className="subtitle-text">Real-time SQL Execution Platform</span>
          </div>
        </div>

        <div className="header-right">
          <div className="status-indicator">
            <span className="dot dot-green"></span>
            Connected
          </div>
          <button className="btn-primary" onClick={executeQuery} disabled={isExecuting}>
            <Play size={16} fill="white" />
            {isExecuting ? 'Running...' : 'Run Query'}
          </button>
          <div className="status-indicator">
            <span className="dot dot-green"></span>
            Real-time
          </div>
        </div>
      </header>

      {/* TABS SECTION */}
      <div className="tabs-container">
        <button className={`tab-item ${activeTab === 'query_editor' ? 'active' : ''}`} onClick={() => setActiveTab('query_editor')}>
          <ChevronRight size={18} className="tab-icon" /> Query Editor
        </button>
        <button className={`tab-item ${activeTab === 'datasets' ? 'active' : ''}`} onClick={() => setActiveTab('datasets')}>
          <HardDrive size={18} className="tab-icon" /> Datasets
        </button>
        <button className={`tab-item ${activeTab === 'activity_log' ? 'active' : ''}`} onClick={() => setActiveTab('activity_log')}>
          <Activity size={18} className="tab-icon" /> Activity Log
        </button>
      </div>

      {/* PAGE CONTENT */}
      <div className="page-content">
        {activeTab === 'query_editor' && (
          <div className="query-editor-layout">

            {/* EDITOR SECTION */}
            <div className="section-header">
              <h2>Query Editor</h2>
              <div className="section-actions">
                <div className="import-dropdown-container">
                  <button className="action-btn" onClick={() => setShowImportMenu(!showImportMenu)} disabled={isExecuting}>
                    <Upload size={16} /> Import
                  </button>
                  {showImportMenu && (
                    <div className="dropdown-menu">
                      <button onClick={() => { sqlFileInputRef.current?.click(); setShowImportMenu(false); }}>SQL File</button>
                      <button onClick={() => { fileInputRef.current?.click(); setShowImportMenu(false); }}>Dataset</button>
                    </div>
                  )}
                </div>

                <input type="file" accept=".csv,.xlsx,.xls,.xml" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImport} />
                <input type="file" accept=".sql" style={{ display: 'none' }} ref={sqlFileInputRef} onChange={handleImportSql} />

                <button className="action-btn" onClick={exportSQL} disabled={!results || results.type !== 'success' || !Array.isArray(results.data)}>
                  <Download size={16} /> Export as .sql
                </button>
                <button className="action-btn" onClick={clearEditor}>
                  <Trash2 size={16} /> Clear
                </button>
              </div>
            </div>

            <div className="editor-card">
              <div className="editor-card-header">
                <span className="editor-card-title">SQL Editor</span>
                <div className="tag-group">
                  <span className="tag-blue">MySQL</span>
                  <span className="tag-green">v8.0</span>
                </div>
                <div className="language-indicator">
                  <Code size={14} /> MySQL Language Detected
                </div>
              </div>
              <div className="editor-wrapper">
                <Editor
                  height="100%"
                  defaultLanguage="sql"
                  theme="vs-light"
                  value={query}
                  onChange={setQuery}
                  onMount={handleEditorDidMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineHeight: 24,
                    padding: { top: 16, bottom: 16 },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    renderLineHighlight: "none",
                    hideCursorInOverviewRuler: true,
                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                    overviewRulerBorder: false,
                  }}
                />
              </div>
            </div>

            {/* RESULTS SECTION */}
            <div className="section-header" style={{ marginTop: '24px' }}>
              <h2>Query Results</h2>
            </div>

            <div className="results-card">
              <div className="results-card-header">
                <span className="results-card-title">Results</span>
                <span className="results-card-meta">
                  {affectedRowsCount} rows affected • {executionTime} ms
                </span>
              </div>

              <div className="results-wrapper">
                {isExecuting ? (
                  <div className="empty-state">
                    <Clock className="empty-icon-spin" size={48} />
                    <p>Executing query...</p>
                  </div>
                ) : !results ? (
                  <div className="empty-state">
                    <Code className="empty-icon" size={48} />
                    <p>Execute a query to see results here</p>
                  </div>
                ) : results.type === 'error' ? (
                  <div className="error-state">
                    <AlertCircle size={24} className="error-icon" />
                    <div className="error-content">
                      <h4>Execution Error</h4>
                      <p>{results.error}</p>
                      <code>Code: {results.code}</code>
                    </div>
                  </div>
                ) : (
                  <div className="table-container">
                    {Array.isArray(results.data) && results.data.length > 0 ? (
                      <table className="results-table">
                        <thead>
                          <tr>
                            {results.columns?.map((col, idx) => <th key={idx}>{col}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {results.data.map((row, rowIdx) => (
                            <tr key={rowIdx}>
                              {results.columns?.map((col, colIdx) => (
                                <td key={colIdx}>
                                  {row[col] === null ? (
                                    <span className="null-value">NULL</span>
                                  ) : (
                                    typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col])
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="empty-state success-msg">
                        {results.data?.changes !== undefined
                          ? `Query executed successfully.`
                          : "Query returned 0 rows."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Floating Database Icon - present in the user mockup */}
      <div className="floating-fab" onClick={toggleFab}>
        <Database size={24} color="white" />
      </div>

      {isFabOpen && (
        <div className="fab-popup" onClick={(e) => e.stopPropagation()}>
          <div className="fab-popup-header">Active Datasets</div>
          <div className="fab-popup-content">
            {tablesList.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No datasets imported yet.
              </div>
            ) : (
              tablesList.map(table => (
                <div
                  key={table}
                  className="dataset-item"
                  onClick={() => handlePreviewTable(table)}
                  onContextMenu={(e) => handleContextMenu(e, table)}
                >
                  <FileJson size={16} />
                  {table}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {contextMenu !== null && (
        <div
          className="context-menu"
          style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => handlePreviewTable(contextMenu.tableName)}>
            <Play size={14} /> Preview
          </button>
          <button className="context-menu-item delete" onClick={() => handleDeleteTable(contextMenu.tableName)}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
