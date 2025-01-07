const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const db = require('./db/database');

const app = express();

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

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
    const { id } = req.params;
    
    db.get('SELECT * FROM renders WHERE id = ?', [id], (err, render) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).send('Database error');
            return;
        }
        if (!render) {
            console.log('Content not found:', id);
            res.status(404).send('Not found');
            return;
        }

        const type = detectContentType(render.input_code);
        console.log('\nRendering content:', {
            id: id,
            type: type,
            contentLength: render.input_code.length
        });

        if (type === 'mermaid') {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
                    <style>
                        body {
                            margin: 0;
                            padding: 16px;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                        }
                        #mermaid-container {
                            width: 100%;
                            max-width: 100%;
                            overflow: auto;
                        }
                    </style>
                </head>
                <body>
                    <div id="mermaid-container">
                        <pre class="mermaid">
                            ${render.input_code}
                        </pre>
                    </div>
                    <script>
                        mermaid.initialize({
                            startOnLoad: true,
                            theme: 'default',
                            securityLevel: 'loose',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        });
                        
                        window.addEventListener('load', function() {
                            mermaid.init(undefined, '.mermaid');
                        });
                    </script>
                </body>
                </html>
            `);
        } else if (type === 'html') {
            // Trả về nguyên bản nếu là HTML hoàn chỉnh
            res.send(render.input_code);
        } else {
            // Wrap content trong template HTML nếu là combined
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            margin: 0;
                            padding: 16px;
                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        }
                    </style>
                </head>
                <body>
                    ${render.input_code}
                </body>
                </html>
            `);
        }
    });
});

// API endpoint
app.post('/api/render', (req, res) => {
    const { content } = req.body;
    
    // Log request
    console.log('\n[API Render Request]', new Date().toISOString());
    console.log('Content length:', content?.length || 0);
    console.log('Content preview:', content?.substring(0, 100) + '...');

    if (!content) {
        console.log('Error: Content is required');
        return res.status(400).json({ error: 'Content is required' });
    }

    const type = detectContentType(content);
    const id = uuidv4();
    
    // Log detected type
    console.log('Detected type:', type);
    
    db.run('INSERT INTO renders (id, input_code, type) VALUES (?, ?, ?)',
        [id, content, type],
        (err) => {
            if (err) {
                console.log('Database error:', err.message);
                res.status(500).json({ error: err.message });
                return;
            }
            const viewUrl = `${req.protocol}://${req.get('host')}/view/${id}`;
            
            // Log success response
            console.log('Success:', {
                id: id,
                url: viewUrl,
                type: type
            });
            
            res.json({ 
                url: viewUrl,
                id: id
            });
        }
    );
});

// Add privacy route
app.get('/privacy', (req, res) => {
    res.render('privacy');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 