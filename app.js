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
    res.render('index');
});

app.post('/render', (req, res) => {
    const { code, type } = req.body;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 