const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'db', 'renders.db');
const schemaPath = path.join(__dirname, '..', 'db', 'init.sql');

// Đảm bảo thư mục db tồn tại
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Xóa database cũ nếu tồn tại
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

// Tạo database mới
const db = new sqlite3.Database(dbPath);

// Đọc và thực thi schema
const schema = fs.readFileSync(schemaPath, 'utf8');
db.serialize(() => {
    db.exec(schema, (err) => {
        if (err) {
            console.error('Error initializing database:', err);
            process.exit(1);
        }
        console.log('Database initialized successfully');
        db.close();
    });
}); 