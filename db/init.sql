CREATE TABLE IF NOT EXISTS renders (
    id TEXT PRIMARY KEY,
    input_code TEXT NOT NULL,
    type TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    rendered_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
); 