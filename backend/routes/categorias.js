const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre ASC').all());
});

router.post('/', (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });

    try {
        const info = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre);
        res.status(201).json({ id_categoria: info.lastInsertRowid, nombre });
    } catch (err) {
        res.status(409).json({ error: 'Esa categoría ya existe' });
    }
});

module.exports = router;
