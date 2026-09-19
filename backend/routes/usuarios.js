const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', (req, res) => {
    const usuarios = db.prepare('SELECT * FROM usuarios ORDER BY nombre_completo ASC').all();
    res.json(usuarios);
});

router.get('/:id', (req, res) => {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const prestamos = db.prepare(`
        SELECT p.*, l.titulo, l.autor
        FROM prestamos p JOIN libros l ON p.id_libro = l.id_libro
        WHERE p.id_usuario = ?
        ORDER BY p.fecha_prestamo DESC
    `).all(req.params.id);

    res.json({ ...usuario, prestamos });
});

router.post('/', (req, res) => {
    const { nombre_completo, correo, telefono } = req.body;
    if (!nombre_completo || !correo) {
        return res.status(400).json({ error: 'nombre_completo y correo son obligatorios' });
    }

    try {
        const info = db.prepare(`
            INSERT INTO usuarios (nombre_completo, correo, telefono) VALUES (?, ?, ?)
        `).run(nombre_completo, correo, telefono || null);

        const nuevo = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(info.lastInsertRowid);
        res.status(201).json(nuevo);
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
        }
        res.status(500).json({ error: 'Error al crear el usuario' });
    }
});

router.put('/:id', (req, res) => {
    const existente = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(req.params.id);
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' });

    const datos = { ...existente, ...req.body };
    db.prepare(`
        UPDATE usuarios SET nombre_completo = ?, correo = ?, telefono = ? WHERE id_usuario = ?
    `).run(datos.nombre_completo, datos.correo, datos.telefono, req.params.id);

    res.json(db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM usuarios WHERE id_usuario = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.status(204).send();
});

module.exports = router;
