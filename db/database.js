const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'renders.db'));

// Khởi tạo database
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS renders (
        id TEXT PRIMARY KEY,
        input_code TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db; 