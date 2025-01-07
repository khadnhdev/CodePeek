const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'renders.db');
const dbExists = fs.existsSync(dbPath);

// Tạo thư mục db nếu chưa tồn tại
if (!fs.existsSync(__dirname)) {
    fs.mkdirSync(__dirname, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Khởi tạo database nếu chưa tồn tại
db.serialize(() => {
    // Drop table nếu cần recreate (chỉ khi database mới được tạo)
    if (!dbExists) {
        db.run(`DROP TABLE IF EXISTS renders`);
    }

    // Tạo bảng với đầy đủ các cột
    db.run(`CREATE TABLE IF NOT EXISTS renders (
        id TEXT PRIMARY KEY,
        input_code TEXT NOT NULL,
        type TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Xử lý lỗi database
db.on('error', (err) => {
    console.error('Database error:', err);
});

module.exports = db; 