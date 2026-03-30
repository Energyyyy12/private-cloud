const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');

const app = express();
const PORT = 3000;

// Пароль по умолчанию
const ADMIN_PASSWORD = 'admin123';
const PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Создаем папку uploads если её нет
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Сессии
app.use(session({
    secret: 'my-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        // Сохраняем с оригинальным именем, но добавляем timestamp чтобы избежать конфликтов
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Middleware для проверки авторизации
function isAuthenticated(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    if (req.path.startsWith('/api/')) {
        res.status(401).json({ error: 'Unauthorized' });
    } else {
        res.redirect('/');
    }
}

// ========== МАРШРУТЫ ==========

// Главная страница (логин)
app.get('/', (req, res) => {
    if (req.session.authenticated) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Дашборд (требует авторизации)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Логин
app.post('/api/login', async (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password required' });
    }
    
    const match = await bcrypt.compare(password, PASSWORD_HASH);
    
    if (match) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Проверка сессии
app.get('/api/check-session', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

// Получение списка файлов (ИСПРАВЛЕНО)
app.get('/api/files', isAuthenticated, (req, res) => {
    fs.readdir('./uploads', (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read files' });
        }
        
        const fileList = [];
        
        files.forEach(file => {
            const filePath = path.join('./uploads', file);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile()) {
                // Извлекаем оригинальное имя (убираем timestamp)
                const parts = file.split('-');
                let originalName = file;
                if (parts.length >= 2) {
                    originalName = parts.slice(1).join('-');
                }
                
                fileList.push({
                    id: file,           // ← ID для скачивания/удаления
                    name: originalName, // ← Отображаемое имя
                    size: stats.size,
                    modified: stats.mtime
                });
            }
        });
        
        res.json(fileList);
    });
});

// Скачивание файла (ИСПРАВЛЕНО)
app.get('/api/download/:fileId', isAuthenticated, (req, res) => {
    const fileId = req.params.fileId;
    const filepath = path.join('./uploads', fileId);
    
    if (fs.existsSync(filepath)) {
        // Извлекаем оригинальное имя для скачивания
        const parts = fileId.split('-');
        let originalName = fileId;
        if (parts.length >= 2) {
            originalName = parts.slice(1).join('-');
        }
        res.download(filepath, originalName);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Загрузка файлов (ИСПРАВЛЕНО)
app.post('/api/upload', isAuthenticated, upload.array('files', 50), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const uploadedFiles = req.files.map(file => ({
        id: file.filename,
        name: file.originalname,
        size: file.size
    }));
    
    res.json({
        success: true,
        files: uploadedFiles,
        count: req.files.length
    });
});

// Удаление файла (ИСПРАВЛЕНО)
app.delete('/api/files/:fileId', isAuthenticated, (req, res) => {
    const fileId = req.params.fileId;
    const filepath = path.join('./uploads', fileId);
    
    if (fs.existsSync(filepath)) {
        fs.unlink(filepath, (err) => {
            if (err) {
                res.status(500).json({ error: 'Delete failed' });
            } else {
                res.json({ success: true });
            }
        });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║     🦅 ПРИВАТНОЕ ОБЛАКО - ЗАПУЩЕНО 🦅                     ║
╠═══════════════════════════════════════════════════════════╣
║  🌐 http://localhost:${PORT}                                  
║  🔑 Пароль: admin123                                       
║  📁 Файлы: ./uploads/                                      
╚═══════════════════════════════════════════════════════════╝
    `);
});