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
    const { nombre_completo, correo, password } = req.body;

    if (!nombre_completo || !correo || !password) {
        return res.status(400).json({ error: 'nombre_completo, correo y password son obligatorios' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const password_hash = bcrypt.hashSync(password, 10);
        const info = db.prepare(`
            INSERT INTO bibliotecarios (nombre_completo, correo, password_hash) VALUES (?, ?, ?)
        `).run(nombre_completo, correo, password_hash);

        const cuenta = db.prepare('SELECT * FROM bibliotecarios WHERE id_bibliotecario = ?').get(info.lastInsertRowid);
        const token = generarToken(cuenta);
        res.status(201).json({ token, bibliotecario: sinPassword(cuenta) });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Ya existe una cuenta registrada con ese correo' });
        }
        res.status(500).json({ error: `No se pudo completar el registro: ${err.message}` });
    }
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

    const token = generarToken(cuenta);
    res.json({ token, bibliotecario: sinPassword(cuenta) });
});

router.get('/yo', verificarToken, (req, res) => {
    const cuenta = db.prepare('SELECT * FROM bibliotecarios WHERE id_bibliotecario = ?').get(req.bibliotecario.id_bibliotecario);
    if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(sinPassword(cuenta));
});

module.exports = router;
