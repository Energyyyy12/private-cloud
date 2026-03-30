const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// === НАСТРОЙКА ОБЛАКА CLOUDINARY ===
cloudinary.config({
    cloud_name: 'dd9z3asue',
    api_key: '629233149982931',
    api_secret: 'NHDFoNoPqI6F7xNQQ3onbI2WP1U'
});

// Настройка хранилища
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'private_cloud_storage', // Папка в твоем облаке
        resource_type: 'auto' // Чтобы можно было загружать любые типы файлов
    },
});
const upload = multer({ storage: storage });

// Пароль администратора
const ADMIN_PASSWORD = 'admin123';
const PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'cloud-storage-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Проверка авторизации
function isAuthenticated(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// --- МАРШРУТЫ ---

// Главная (Логин)
app.get('/', (req, res) => {
    if (req.session.authenticated) return res.redirect('/dashboard');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Админ-панель
app.get('/dashboard', (req, res) => {
    if (!req.session.authenticated) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API Логин
app.post('/api/login', async (req, res) => {
    const { password } = req.body;
    if (await bcrypt.compare(password, PASSWORD_HASH)) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Неверный пароль' });
    }
});

// API Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// API Загрузка файлов в облако
app.post('/api/upload', isAuthenticated, upload.array('files', 10), (req, res) => {
    try {
        const uploadedFiles = req.files.map(file => ({
            id: file.filename,
            name: file.originalname,
            url: file.path
        }));
        res.json({ success: true, files: uploadedFiles });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки' });
    }
});

// API Список файлов из облака
app.get('/api/files', isAuthenticated, async (req, res) => {
    try {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'private_cloud_storage/',
            max_results: 100
        });
        const files = result.resources.map(file => ({
            id: file.public_id,
            name: file.public_id.split('/').pop(),
            size: file.bytes,
            url: file.secure_url,
            modified: file.created_at
        }));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения списка' });
    }
});

// API Удаление файла
app.delete('/api/files/:fileId(*)', isAuthenticated, async (req, res) => {
    try {
        const fileId = req.params.fileId;
        await cloudinary.uploader.destroy(fileId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});