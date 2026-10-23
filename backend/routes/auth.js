const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../database/db');
const { generarToken, verificarToken } = require('../middleware/auth');

function sinPassword(cuenta) {
    const { password_hash, ...resto } = cuenta;
    return resto;
}

router.post('/registro', (req, res) => {
    res.status(403).json({ error: 'El registro está deshabilitado. Solicita una cuenta al administrador de la biblioteca.' });
});

router.post('/login', (req, res) => {
    const { correo, password } = req.body;
    if (!correo || !password) {
        return res.status(400).json({ error: 'correo y password son obligatorios' });
    }

    const cuenta = db.prepare('SELECT * FROM bibliotecarios WHERE correo = ?').get(correo);
    if (!cuenta || !bcrypt.compareSync(password, cuenta.password_hash)) {
        return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    if (cuenta.rol !== 'administrador') {
        return res.status(403).json({ error: 'Esta cuenta no tiene permisos de administrador' });
    }

    const token = generarToken(cuenta);
    res.json({ token, bibliotecario: sinPassword(cuenta) });
});

router.get('/yo', verificarToken, (req, res) => {
    const cuenta = db.prepare('SELECT * FROM bibliotecarios WHERE id_bibliotecario = ?').get(req.bibliotecario.id_bibliotecario);
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(sinPassword(cuenta));
});

module.exports = router;
