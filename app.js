const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const db = require('./db/database');
const logger = require('./utils/logger');

const app = express();

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Middleware để disable cache cho tất cả các API routes
app.use('/api', (req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
});

// Routes
app.get('/', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.render('index', { baseUrl });
});

// Hàm detect loại content
function detectContentType(code) {
    if (!code || typeof code !== 'string') return 'unknown';
    
    const trimmedCode = code.trim();
    
    // Kiểm tra Mermaid
    const mermaidKeywords = [
        'graph ',
        'flowchart ',
        'sequenceDiagram',
        'classDiagram',
        'stateDiagram',
        'gantt',
        'pie',
        'gitGraph'
    ];

    // Kiểm tra HTML
    const isHTML = (
        // Có DOCTYPE
        trimmedCode.toLowerCase().includes('<!doctype html') ||
        // Hoặc có thẻ html
        trimmedCode.toLowerCase().includes('<html') ||
        // Hoặc có cấu trúc thẻ HTML cơ bản
        (trimmedCode.startsWith('<') && 
         trimmedCode.includes('>') && 
         (trimmedCode.includes('</') || trimmedCode.includes('/>')))
    );

    // Kiểm tra Mermaid
    const isMermaid = mermaidKeywords.some(keyword => 
        trimmedCode.toLowerCase().startsWith(keyword.toLowerCase())
    );

    // Log để debug
    console.log('\nContent Detection:');
    console.log('Content preview:', trimmedCode.substring(0, 100));
    console.log('Is HTML:', isHTML);
    console.log('Is Mermaid:', isMermaid);
    
    // Quyết định loại content
    if (isMermaid) {
        return 'mermaid';
    } else if (isHTML) {
        return 'html';
    } else {
        // Nếu không phải cả hai, wrap trong HTML
        return 'combined';
    }
}

app.post('/render', (req, res) => {
    const { code } = req.body;
    const type = detectContentType(code);
    const id = uuidv4();
    
    db.run('INSERT INTO renders (id, input_code, type) VALUES (?, ?, ?)',
        [id, code, type],
        (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id });
        }
    );
});

app.get('/view/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM renders WHERE id = ?', [id], (err, render) => {
        if (err) {
            res.status(500).send('Database error');
            return;
        }
        if (!render) {
            res.status(404).send('Not found');
            return;
        }
        res.render('view', { render });
    });
});

app.get('/render-content/:id', (req, res) => {
    db.get('SELECT rendered_content FROM renders WHERE id = ?', [req.params.id], (err, render) => {
        if (err) {
            console.error('Error fetching render:', err);
            return res.status(500).send('Database error');
        }
        if (!render || !render.rendered_content) {
            return res.status(404).send('Render not found');
        }
        
        res.send(render.rendered_content);
    });
});

// API endpoint
app.post('/api/render', (req, res) => {
    const { content } = req.body;
    
    logger.create('New Render Request', {
        timestamp: new Date().toISOString(),
        contentLength: content?.length || 0,
        type: detectContentType(content)
    });

    if (!content) {
        logger.error('Validation Error', new Error('Content is required'));
        return res.status(400).json({ error: 'Content is required' });
    }

    const type = detectContentType(content);
    const id = uuidv4();
    
    // Tạo rendered_content
    let rendered_content;
    if (type === 'mermaid') {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <head>
                <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
                <script>mermaid.initialize({startOnLoad:true});</script>
            </head>
            <body>
                <div class="mermaid">
                    ${content}
                </div>
            </body>
            </html>
        `;
    } else if (type === 'html') {
        rendered_content = content;
    } else {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <body>
                ${content}
            </body>
            </html>
        `;
    }
    
    // Log detected type
    console.log('Detected type:', type);
    
    db.run('INSERT INTO renders (id, input_code, type, rendered_content) VALUES (?, ?, ?, ?)',
        [id, content, type, rendered_content],
        (err) => {
            if (err) {
                logger.error('Database Error', err);
                return res.status(500).json({ error: err.message });
            }
            
            const viewUrl = `${req.protocol}://${req.get('host')}/view/${id}`;
            logger.create('Render Created', {
                id,
                type,
                contentLength: content.length,
                url: viewUrl
            });
            
            res.json({ url: viewUrl, id: id });
        }
    );
});

// Tách riêng API để lấy thông tin render
app.get('/api/render/:id', (req, res) => {
    logger.update('Fetching Render', {
        id: req.params.id,
        timestamp: new Date().toISOString()
    });

    db.get('SELECT views, input_code FROM renders WHERE id = ?', [req.params.id], (err, render) => {
        if (err) {
            logger.error('Database Error', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!render) {
            logger.error('Not Found', new Error(`Render ${req.params.id} not found`));
            return res.status(404).json({ error: 'Render not found' });
        }
        
        const input_code = render.input_code ? render.input_code.toString() : '';
        
        logger.update('Render Fetched', {
            id: req.params.id,
            contentLength: input_code.length,
            timestamp: new Date().toISOString()
        });

        res.json({ 
            views: render.views,
            input_code: input_code
        });
    });
});

// API riêng để tăng view count
app.post('/api/render/:id/views', (req, res) => {
    db.run('UPDATE renders SET views = views + 1 WHERE id = ?', [req.params.id], (err) => {
        if (err) {
            console.error('Error updating views:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});

// Add privacy route
app.get('/privacy', (req, res) => {
    res.render('privacy');
});

// Thêm API endpoint mới để cập nhật content
app.post('/api/render/:id/content', (req, res) => {
    const { content } = req.body;
    const { id } = req.params;
    
    if (!content) {
        return res.status(400).json({ error: 'Content is required' });
    }

    const type = detectContentType(content);
    
    // Tạo rendered_content mới
    let rendered_content;
    if (type === 'mermaid') {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <head>
                <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
                <script>mermaid.initialize({startOnLoad:true});</script>
            </head>
            <body>
                <div class="mermaid">
                    ${content}
                </div>
            </body>
            </html>
        `;
    } else if (type === 'html') {
        rendered_content = content;
    } else {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <body>
                ${content}
            </body>
            </html>
        `;
    }
    
    // Cập nhật cả input_code, type và rendered_content
    db.run('UPDATE renders SET input_code = ?, type = ?, rendered_content = ? WHERE id = ?',
        [content, type, rendered_content, id],
        (err) => {
            if (err) {
                logger.error('Content Update Error', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            logger.update('Content Updated', {
                id,
                type,
                contentLength: content.length,
                timestamp: new Date().toISOString()
            });
            
            res.json({ 
                success: true,
                message: 'Content updated successfully'
            });
        }
    );
});

// API để cập nhật render
app.post('/api/render/:id/render', (req, res) => {
    const { id } = req.params;
    
    logger.update('Updating Render', {
        id,
        timestamp: new Date().toISOString()
    });

    db.get('SELECT * FROM renders WHERE id = ?', [id], (err, render) => {
        if (err) {
            logger.error('Database Error', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!render) {
            logger.error('Not Found', new Error(`Render ${id} not found`));
            return res.status(404).json({ error: 'Render not found' });
        }

        // Tạo render mới dựa trên input_code và type
        const type = detectContentType(render.input_code);
        let content;
        
        if (type === 'mermaid') {
            content = `
                <!DOCTYPE html>
                <html>
                <head>
                    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
                    <script>mermaid.initialize({startOnLoad:true});</script>
                </head>
                <body>
                    <div class="mermaid">
                        ${render.input_code}
                    </div>
                </body>
                </html>
            `;
        } else if (type === 'html') {
            content = render.input_code;
        } else {
            content = `
                <!DOCTYPE html>
                <html>
                <body>
                    ${render.input_code}
                </body>
                </html>
            `;
        }

        // Cập nhật rendered_content trong database
        db.run('UPDATE renders SET rendered_content = ? WHERE id = ?',
            [content, id],
            (err) => {
                if (err) {
                    logger.error('Update Error', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                logger.update('Render Updated', {
                    id,
                    type,
                    contentLength: render.input_code.length,
                    timestamp: new Date().toISOString()
                });
                
                res.json({ success: true });
            }
        );
    });
});

// API để upsert render
app.post('/api/render/upsert', (req, res) => {
    const { content, id } = req.body;
    
    if (!content) {
        logger.error('Validation Error', new Error('Content is required'));
        return res.status(400).json({ error: 'Content is required' });
    }

    const type = detectContentType(content);
    
    // Tạo rendered_content
    let rendered_content;
    if (type === 'mermaid') {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <head>
                <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
                <script>mermaid.initialize({startOnLoad:true});</script>
            </head>
            <body>
                <div class="mermaid">
                    ${content}
                </div>
            </body>
            </html>
        `;
    } else if (type === 'html') {
        rendered_content = content;
    } else {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <body>
                ${content}
            </body>
            </html>
        `;
    }

    if (id) {
        // Update nếu có ID
        db.run('UPDATE renders SET input_code = ?, type = ?, rendered_content = ? WHERE id = ?',
            [content, type, rendered_content, id],
            (err) => {
                if (err) {
                    logger.error('Update Error', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                logger.update('Render Updated', {
                    id,
                    type,
                    contentLength: content.length,
                    timestamp: new Date().toISOString()
                });

                res.json({ 
                    success: true,
                    id,
                    url: `${req.protocol}://${req.get('host')}/view/${id}`
                });
            }
        );
    } else {
        // Create nếu không có ID
        const newId = uuidv4();
        db.run('INSERT INTO renders (id, input_code, type, rendered_content) VALUES (?, ?, ?, ?)',
            [newId, content, type, rendered_content],
            (err) => {
                if (err) {
                    logger.error('Create Error', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                const viewUrl = `${req.protocol}://${req.get('host')}/view/${newId}`;
                logger.create('Render Created', {
                    id: newId,
                    type,
                    contentLength: content.length,
                    url: viewUrl
                });

                res.json({ 
                    success: true,
                    id: newId,
                    url: viewUrl
                });
            }
        );
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 