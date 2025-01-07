const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục db tồn tại
const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)){
    fs.mkdirSync(dbDir);
}

// Tạo kết nối database
const dbPath = path.join(dbDir, 'renders.db');
const db = new sqlite3.Database(dbPath);

// Khởi tạo bảng
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS renders (
        id TEXT PRIMARY KEY,
        input_code TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err);
        } else {
            console.log('Database initialized successfully');
        }
        db.close();
    });
}); 