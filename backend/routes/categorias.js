const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { verificarToken, verificarAdministrador } = require('../middleware/auth');

router.get('/', (req, res) => {
    res.json(db.prepare(`
        SELECT c.id_categoria, c.nombre, COUNT(l.id_libro) AS libros_asignados
        FROM categorias c
        LEFT JOIN libros l ON l.id_categoria = c.id_categoria
        GROUP BY c.id_categoria
        ORDER BY c.nombre ASC
    `).all());
});

router.post('/', verificarToken, verificarAdministrador, (req, res) => {
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
    if (nombre.length > 80) return res.status(400).json({ error: 'El nombre no puede superar 80 caracteres' });

    try {
        const info = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre);
        res.status(201).json({ id_categoria: info.lastInsertRowid, nombre, libros_asignados: 0 });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'Esa categoría ya existe' });
        }
        throw err;
    }
});

router.put('/:id', verificarToken, verificarAdministrador, (req, res) => {
    const idCategoria = Number(req.params.id);
    if (!Number.isInteger(idCategoria) || idCategoria < 1) {
        return res.status(400).json({ error: 'El identificador de categoría no es válido' });
    }

    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    if (!nombre) return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
    if (nombre.length > 80) return res.status(400).json({ error: 'El nombre no puede superar 80 caracteres' });

    const categoria = db.prepare('SELECT id_categoria FROM categorias WHERE id_categoria = ?').get(idCategoria);
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada' });

    try {
        db.prepare('UPDATE categorias SET nombre = ? WHERE id_categoria = ?').run(nombre, idCategoria);
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'Esa categoría ya existe' });
        }
        throw err;
    }

    const librosAsignados = db.prepare('SELECT COUNT(*) AS total FROM libros WHERE id_categoria = ?').get(idCategoria).total;
    res.json({ id_categoria: idCategoria, nombre, libros_asignados: librosAsignados });
});

router.delete('/:id', verificarToken, verificarAdministrador, (req, res) => {
    const idCategoria = Number(req.params.id);
    if (!Number.isInteger(idCategoria) || idCategoria < 1) {
        return res.status(400).json({ error: 'El identificador de categoría no es válido' });
    }

    const librosAsignados = db.prepare('SELECT COUNT(*) AS total FROM libros WHERE id_categoria = ?').get(idCategoria).total;
    const resultado = db.prepare('DELETE FROM categorias WHERE id_categoria = ?').run(idCategoria);
    if (resultado.changes === 0) return res.status(404).json({ error: 'Categoría no encontrada' });

    res.json({ id_categoria: idCategoria, libros_sin_categoria: librosAsignados });
});

module.exports = router;
