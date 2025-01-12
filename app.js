const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { createServer } = require('http');
const { Server } = require('socket.io');
const db = require('./db/database');
const logger = require('./utils/logger');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { VM } = require('vm2');
const { spawn } = require('child_process');
const rateLimit = require('express-rate-limit');

// Base URL configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEFAULT_PORT = 3000;
const PROTOCAL = 'http';
//const BASE_URL = 'https://codepeek.jobsum.works';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

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
    res.render('index', { baseUrl: BASE_URL });
});

// Hàm detect loại content
function detectContentType(content) {
    const trimmed = content.trim().toLowerCase();
    
    // Check SVG first
    if (content.trim().startsWith('<svg') && content.trim().endsWith('</svg>')) {
        return 'svg';
    }
    
    // Check Mermaid
    if (trimmed.startsWith('graph ') || 
        trimmed.startsWith('sequencediagram') ||
        trimmed.startsWith('classdiagram') ||
        trimmed.startsWith('gantt') ||
        trimmed.startsWith('pie') ||
        trimmed.startsWith('flowchart')) {
        return 'mermaid';
    }

    // Check React patterns
    const reactPatterns = [
        // ES6 imports
        /import\s+.*?['"]react['"]/i,
        /import\s+.*?['"]react-dom['"]/i,
        /import\s+React\s*,?\s*{.*?}\s*from\s+['"]react['"]/i,
        
        // Component definitions
        /(?:function|const|class)\s+[A-Z][A-Za-z]*\s*(?:=|extends|\()/,
        /const\s+[A-Z][A-Za-z]*\s*=\s*\(?\s*(?:props)?\s*\)?\s*=>/,
        /export\s+(?:default\s+)?(?:function|const|class)\s+[A-Z][A-Za-z]*/,
        
        // JSX
        /<[A-Z][A-Za-z]*\s*[^>]*>/,
        /<\/[A-Z][A-Za-z]*>/,
        
        // Hooks
        /use[A-Z][A-Za-z]*/,
        
        // Props and state
        /props\.[A-Za-z]+/,
        /setState\s*\(/,
        /useState\s*\(/,
        
        // Common React patterns
        /className=/,
        /onClick=/,
        /onChange=/,
        /onSubmit=/,
        
        // Return statement with JSX
        /return\s*\(\s*</
    ];

    // Đếm số lượng patterns React match được
    const matchCount = reactPatterns.reduce((count, pattern) => {
        return count + (pattern.test(content) ? 1 : 0);
    }, 0);

    // Debug log
    // console.log('React pattern matches:', matchCount);

    // Nếu có ít nhất 2 patterns match thì có khả năng cao là React code
    if (matchCount >= 2) {
        return 'react';
    }
    
    // Check HTML
    if (content.trim().startsWith('<') && content.trim().endsWith('>')) {
        return 'html';
    }
    
    return 'text';
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
            
            const viewUrl = `${PROTOCAL}://${req.get('host')}/view/${id}`;
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

// Socket.IO connection handling
io.on('connection', (socket) => {
    logger.info('Client connected');
    
    // Client joins a render room
    socket.on('join-render', (renderId) => {
        socket.join(`render:${renderId}`);
        logger.info(`Client joined render:${renderId}`);
    });

    socket.on('disconnect', () => {
        logger.info('Client disconnected');
    });
});

// Sửa lại route render/upsert để emit event khi có update
app.post('/api/render/upsert', (req, res) => {
    const { content, id } = req.body;
    
    if (!content) {
        logger.error('Validation Error', new Error('Content is required'));
        return res.status(400).json({ error: 'Content is required' });
    }

    const type = detectContentType(content);
    
    // Tạo rendered_content
    let rendered_content;
    if (type === 'svg') {
        rendered_content = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: white;
                    }
                    svg {
                        max-width: 100%;
                        height: auto;
                    }
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>
        `;
    } else if (type === 'mermaid') {
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
    } else if (type === 'react') {
        // Tìm và xóa phần render component trong code gốc
        let cleanedContent = content.replace(/const\s+root\s*=\s*ReactDOM\.createRoot[\s\S]*?root\.render\s*\([^)]*\);?/g, '');
        // Xóa khai báo hooks trùng lặp
        cleanedContent = cleanedContent.replace(/const\s*{\s*useState\s*,\s*useEffect\s*}\s*=\s*React\s*;?/g, '');

        // Tìm tên component từ code đã làm sạch
        const componentMatch = cleanedContent.match(
            /(?:function|const)\s+([A-Z][A-Za-z]*)\s*(?:=|\()/
            || /class\s+([A-Z][A-Za-z]*)\s+extends\s+React\.Component/
        );

        if (!componentMatch) {
            console.error('No valid React component found in the code');
            return res.status(400).json({ error: 'No valid React component found in the code' });
        }

        const componentName = componentMatch[1];

        rendered_content = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>React Preview - ${componentName}</title>
                <!-- Thêm Tailwind CSS -->
                <script src="https://cdn.tailwindcss.com"></script>
                <!-- React và ReactDOM -->
                <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
                <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                <style>
                    /* Add some basic styles */
                    body {
                        margin: 0;
                        padding: 20px;
                        min-height: 100vh;
                        background: #f5f5f5;
                    }
                    #root {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: calc(100vh - 40px);
                    }
                    input {
                        width: 100%;
                        padding: 8px;
                        margin: 8px 0;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                    }
                    button {
                        background: #4299e1;
                        color: white;
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-top: 8px;
                    }
                    button:hover {
                        background: #3182ce;
                    }
                    label {
                        display: block;
                        margin-bottom: 4px;
                        color: #4a5568;
                    }
                </style>
            </head>
            <body>
                <div id="root"></div>

                <!-- React Component -->
                <script type="text/babel">
                    // Khai báo React hooks và các dependencies
                    const { 
                        useState, 
                        useEffect, 
                        useRef, 
                        useCallback, 
                        useMemo, 
                        useContext 
                    } = React;

                    try {
                        ${cleanedContent}

                        // Kiểm tra component có tồn tại không
                        if (typeof ${componentName} !== 'function') {
                            throw new Error('Component ${componentName} is not defined or not a function');
                        }

                        // Render component
                        const root = ReactDOM.createRoot(document.getElementById("root"));
                        root.render(React.createElement(${componentName}));

                    } catch (error) {
                        // Hiển thị lỗi trong DOM
                        document.getElementById("root").innerHTML = \`
                            <div style="color: red; padding: 20px; border: 1px solid red; margin: 20px; border-radius: 4px;">
                                <h3>Error Rendering React Component:</h3>
                                <pre>\${error.message}</pre>
                                <p style="margin-top: 10px; color: #666;">Check the console for more details.</p>
                            </div>
                        \`;
                        console.error('React Render Error:', error);
                    }
                </script>
            </body>
            </html>
        `;

        // Validate rendered content
        try {
            // Kiểm tra xem rendered_content có chứa các phần cần thiết không
            const requiredParts = [
                'react@18/umd/react.development.js',
                'react-dom@18/umd/react-dom.development.js',
                'babel.min.js',
                'type="text/babel"',
                componentName,
                'root.render'
            ];

            const missingParts = requiredParts.filter(part => !rendered_content.includes(part));
            
            if (missingParts.length > 0) {
                console.error(`Missing required parts: ${missingParts.join(', ')}`);
                return res.status(500).json({ error: 'Invalid React template generation' });
            }

        } catch (error) {
            console.error('Failed to validate React template:', error);
            return res.status(500).json({ error: 'Failed to validate React template' });
        }
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

                // Emit event update cho room tương ứng
                io.to(`render:${id}`).emit('render-updated', {
                    id,
                    content,
                    rendered_content
                });

                res.json({ 
                    success: true,
                    id,
                    url: `${BASE_URL}/view/${id}`
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

                const viewUrl = `${PROTOCAL}://${req.get('host')}/view/${newId}`;
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

// Thêm hàm detect language
function detectLanguage(code) {
    // PHP
    if (code.includes('<?php') || code.match(/^\s*<\?/)) {
        return 'php';
    }
    
    // Python
    if (code.match(/^(import|from|def|class|print)/m) || 
        code.includes('__init__') || 
        code.includes('self.')) {
        return 'python';
    }
    
    // Node.js/JavaScript
    if (code.match(/^(const|let|var|function|class|console)/m) || 
        code.includes('require(') || 
        code.includes('module.exports') ||
        code.includes('export ') ||
        code.includes('async ')) {
        return 'nodejs';
    }
    
    return 'unknown';
}

// Cấu hình cho các ngôn ngữ
const LANG_CONFIG = {
    php: {
        command: 'php',
        fileExt: '.php',
        timeout: 5000,
    },
    python: {
        command: 'python3',
        fileExt: '.py',
        timeout: 5000,
    },
    nodejs: {
        // NodeJS sẽ chạy trong VM2
        timeout: 5000,
    }
};

// Hàm thực thi code NodeJS trong sandbox
async function executeNodeJS(code) {
    const vm = new VM({
        timeout: 5000,
        sandbox: {
            console: {
                log: (...args) => {
                    output.push(args.join(' '));
                }
            }
        },
        eval: false,
        wasm: false,
    });

    const output = [];
    try {
        vm.run(code);
        return {
            output: output.join('\n'),
            error: '',
            exitCode: 0
        };
    } catch (error) {
        return {
            output: '',
            error: error.message,
            exitCode: 1
        };
    }
}

// Hàm thực thi code PHP và Python
async function executeWithProcess(code, language) {
    const config = LANG_CONFIG[language];
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `code-${language}-`));
    const codePath = path.join(tmpDir, `code${config.fileExt}`);

    try {
        await fs.writeFile(codePath, code);

        return new Promise((resolve) => {
            const args = [codePath];
            const process = spawn(config.command, args);
            let stdout = '';
            let stderr = '';
            let killed = false;

            const timer = setTimeout(() => {
                process.kill();
                killed = true;
            }, config.timeout);

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                clearTimeout(timer);
                fs.rm(tmpDir, { recursive: true, force: true })
                    .catch(console.error);

                if (killed) {
                    resolve({
                        output: '',
                        error: 'Execution timed out',
                        exitCode: 124
                    });
                } else {
                    resolve({
                        output: stdout,
                        error: stderr,
                        exitCode: code
                    });
                }
            });
        });
    } catch (error) {
        await fs.rm(tmpDir, { recursive: true, force: true });
        throw error;
    }
}

// Cập nhật hàm executeCode
async function executeCode(code, language) {
    // Kiểm tra memory usage hiện tại
    const memoryLimit = 500 * 1024 * 1024; // 500MB
    if (process.memoryUsage().heapUsed > memoryLimit) {
        throw new Error('Server is under heavy load, please try again later');
    }

    // Thực thi code dựa trên ngôn ngữ
    if (language === 'nodejs') {
        return executeNodeJS(code);
    } else if (language === 'php' || language === 'python') {
        return executeWithProcess(code, language);
    } else {
        throw new Error('Unsupported language');
    }
}

// Thêm rate limiting middleware
const executeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Giới hạn 50 requests mỗi IP trong 15 phút
    message: 'Too many code execution requests, please try again later'
});

// Thêm hàm kiểm tra ngôn ngữ đã cài đặt chưa
async function checkLanguageAvailability() {
    const availableLanguages = {
        nodejs: true, // Node.js luôn có sẵn vì server chạy Node
        python: false,
        php: false
    };

    try {
        // Kiểm tra Python với nhiều command khác nhau
        await new Promise((resolve) => {
            // Thử các lệnh python khác nhau theo thứ tự ưu tiên
            const pythonCommands = [
                'python3 --version',
                'python --version',
                'py --version',
                'py -3 --version'
            ];

            const tryNextCommand = (index) => {
                if (index >= pythonCommands.length) {
                    resolve();
                    return;
                }

                exec(pythonCommands[index], (error, stdout, stderr) => {
                    if (!error && (stdout.toLowerCase().includes('python') || stderr.toLowerCase().includes('python'))) {
                        availableLanguages.python = true;
                        // Lưu lại command thành công để sử dụng sau này
                        LANG_CONFIG.python.command = pythonCommands[index].split(' ')[0];
                        resolve();
                    } else {
                        tryNextCommand(index + 1);
                    }
                });
            };

            tryNextCommand(0);
        });

        // Kiểm tra PHP
        await new Promise((resolve) => {
            exec('php --version', (error, stdout, stderr) => {
                if (!error) {
                    availableLanguages.php = true;
                }
                resolve();
            });
        });

    } catch (error) {
        console.error('Error checking language availability:', error);
    }

    return availableLanguages;
}

// Biến global để lưu trạng thái các ngôn ngữ
let AVAILABLE_LANGUAGES = {
    nodejs: true,
    python: false,
    php: false
};

// Khởi tạo kiểm tra ngôn ngữ khi start server
(async () => {
    AVAILABLE_LANGUAGES = await checkLanguageAvailability();
    console.log('Available languages:', AVAILABLE_LANGUAGES);
})();

// Cập nhật API endpoint
app.post('/api/execute', executeLimiter, async (req, res) => {
    try {
        const { code } = req.body;
        
        // Validate code size
        if (!code || code.length > 50000) {
            return res.status(400).json({ 
                error: 'Code is required and must be less than 50KB' 
            });
        }

        const language = detectLanguage(code);
        
        if (language === 'unknown') {
            return res.status(400).json({ 
                error: 'Could not detect programming language' 
            });
        }

        // Kiểm tra ngôn ngữ có được hỗ trợ không
        if (!AVAILABLE_LANGUAGES[language]) {
            return res.status(400).json({
                error: `${language} is not available on this server. Please contact administrator to enable it.`
            });
        }

        // Kiểm tra các pattern nguy hiểm
        const dangerousPatterns = [
            /process\.env/,
            /require\s*\(\s*['"]child_process['"]\s*\)/,
            /exec\s*\(/,
            /eval\s*\(/,
            /fs\./,
            /http/i,
            /net\./,
            /spawn/,
            /fork/,
            /process\./,
            /global\./,
            /Buffer\./,
            /\.__proto__/,
            /Object\./,
            /Function\(/,
            /setTimeout/,
            /setInterval/,
            /setImmediate/
        ];

        if (dangerousPatterns.some(pattern => pattern.test(code))) {
            return res.status(400).json({
                error: 'Code contains forbidden patterns'
            });
        }

        const result = await executeCode(code, language);

        res.json({
            language,
            output: result.output,
            error: result.error,
            exitCode: result.exitCode
        });

    } catch (error) {
        logger.error('Code execution failed', error);
        
        res.status(500).json({
            error: error.message || 'Code execution failed',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Thêm endpoint để lấy danh sách ngôn ngữ được hỗ trợ
app.get('/api/languages', (req, res) => {
    res.json(AVAILABLE_LANGUAGES);
});

// Thêm route cho playground
app.get('/playground', (req, res) => {
    res.render('playground');
});

// Add API documentation route
app.get('/api', (req, res) => {
    res.render('api', { baseUrl: BASE_URL });
});

// Add About page route
app.get('/about', (req, res) => {
    res.render('about');
});

// Thay đổi listen để sử dụng httpServer
const PORT = process.env.PORT || DEFAULT_PORT;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 