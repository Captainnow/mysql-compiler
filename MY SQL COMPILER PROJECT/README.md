# 🗄️ MySQL Web Compiler Platform

A lightning-fast, local web-based SQL compilation environment built with React, Node.js, and SQLite. This platform allows developers and data analysts to cleanly compile, execute, and preview complex SQL scripts without the need for heavy desktop database management systems.

## ✨ Features

- **Interactive SQL Editor**: Powered by the Monaco Editor, featuring syntax highlighting, error detection, and native IDE shortcuts (`Ctrl + Enter` to execute queries/selections).
- **Universal Dataset Support**: Instantly import, parse, and scaffold databases using `.csv`, `.xlsx`, `.xls`, `.xml`, or raw `.sql` file formats.
- **Dataset Manager**: A floating contextual interface allowing intuitive click-to-preview querying and interactive right-click management.
- **Smart Execution Engine**: Bypasses simplistic `db.exec` behavior by parsing semi-colon separated script blocks, automatically routing structural commands safely while returning your data blocks sequentially.
- **SQL Data Exports**: Easily export compiled datasets directly into fully structured `INSERT INTO / CREATE TABLE` local `.sql` syntax dumps.

## 🚀 Tech Stack

- **Frontend**: React.js, Vite, Axios, Lucide-React, Monaco Editor
- **Backend**: Node.js, Express.js
- **Database Proxy Engine**: SQLite3
- **Parsers**: `multer`, `csv-parser`, `xlsx`, `xml2js`

## 🛠️ Installation & Usage

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Captainnow/mysql-compiler.git
   ```

2. **Initialize the Backend:**
   ```bash
   cd ./backend
   npm install
   node server.js
   ```

3. **Initialize the Frontend:**
   ```bash
   cd ./frontend
   npm install
   npm run dev
   ```

4. Open your browser and navigate to the localhost port provided by Vite (typically `http://localhost:5173`).

---
_Developed for streamlined Data Analytics & Database Prototyping._

**Author:-**
V.KARTHIKEYAN
