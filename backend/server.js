const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

require('./database/db');

const authRouter = require('./routes/auth');
const librosRouter = require('./routes/libros');
const usuariosRouter = require('./routes/usuarios');
const prestamosRouter = require('./routes/prestamos');
const categoriasRouter = require('./routes/categorias');
const { verificarToken, verificarAdministrador } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/libros', librosRouter);
app.use('/api/usuarios', verificarToken, verificarAdministrador, usuariosRouter);
app.use('/api/prestamos', verificarToken, verificarAdministrador, prestamosRouter);
app.use('/api/categorias', categoriasRouter);

app.get('/api/salud', (req, res) => {
    res.json({ estado: 'ok', mensaje: 'API de Biblioteca Virtual funcionando correctamente' });
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada' });
});

app.use((err, req, res, next) => {
    console.error('Error no controlado en', req.method, req.originalUrl);
    console.error(err.stack || err);
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError || err.message === 'Solo se permiten archivos PDF') {
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

app.listen(PORT, () => {
    console.log('============================================');
    console.log('Biblioteca Virtual — Servidor activo');
    console.log(`http://localhost:${PORT}`);
    console.log('============================================');
});
