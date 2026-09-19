const express = require('express');
const router = express.Router();
const db = require('../database/db');

const DIAS_PRESTAMO = 14;

router.get('/', (req, res) => {
    const { estado } = req.query;

    let sql = `
        SELECT p.*, l.titulo, l.autor, u.nombre_completo, u.correo
        FROM prestamos p
        JOIN libros l ON p.id_libro = l.id_libro
        JOIN usuarios u ON p.id_usuario = u.id_usuario
    `;
    const params = [];
    if (estado) {
        sql += ' WHERE p.estado = ?';
        params.push(estado);
    }
    sql += ' ORDER BY p.fecha_prestamo DESC';

    res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
    const { id_libro, id_usuario } = req.body;
    if (!id_libro || !id_usuario) {
        return res.status(400).json({ error: 'id_libro e id_usuario son obligatorios' });
    }

    const libro = db.prepare('SELECT * FROM libros WHERE id_libro = ?').get(id_libro);
    if (!libro) return res.status(404).json({ error: 'Libro no encontrado' });
    if (libro.ejemplares_disponibles < 1) {
        return res.status(409).json({ error: 'No hay ejemplares disponibles de este libro' });
    }

    const usuario = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(id_usuario);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const tx = db.transaction(() => {
        db.prepare('UPDATE libros SET ejemplares_disponibles = ejemplares_disponibles - 1 WHERE id_libro = ?').run(id_libro);

        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() + DIAS_PRESTAMO);
        const fechaLimiteStr = fechaLimite.toISOString().slice(0, 10);

        const info = db.prepare(`
            INSERT INTO prestamos (id_libro, id_usuario, fecha_limite, estado)
            VALUES (?, ?, ?, 'activo')
        `).run(id_libro, id_usuario, fechaLimiteStr);

        return info.lastInsertRowid;
    });

    const id = tx();
    const nuevo = db.prepare(`
        SELECT p.*, l.titulo, u.nombre_completo
        FROM prestamos p JOIN libros l ON p.id_libro = l.id_libro JOIN usuarios u ON p.id_usuario = u.id_usuario
        WHERE p.id_prestamo = ?
    `).get(id);

    res.status(201).json(nuevo);
});

router.put('/:id/devolver', (req, res) => {
    const prestamo = db.prepare('SELECT * FROM prestamos WHERE id_prestamo = ?').get(req.params.id);
    if (!prestamo) return res.status(404).json({ error: 'Préstamo no encontrado' });
    if (prestamo.estado === 'devuelto') {
        return res.status(409).json({ error: 'Este préstamo ya fue devuelto' });
    }

    const tx = db.transaction(() => {
        db.prepare(`
            UPDATE prestamos SET estado = 'devuelto', fecha_devolucion = datetime('now', 'localtime')
            WHERE id_prestamo = ?
        `).run(req.params.id);

        db.prepare('UPDATE libros SET ejemplares_disponibles = ejemplares_disponibles + 1 WHERE id_libro = ?')
          .run(prestamo.id_libro);
    });
    tx();

    res.json(db.prepare('SELECT * FROM prestamos WHERE id_prestamo = ?').get(req.params.id));
});

router.get('/estadisticas/resumen', (req, res) => {
    const totalLibros = db.prepare('SELECT COALESCE(SUM(ejemplares_totales),0) AS total FROM libros').get().total;
    const disponibles = db.prepare('SELECT COALESCE(SUM(ejemplares_disponibles),0) AS total FROM libros').get().total;
    const prestamosActivos = db.prepare("SELECT COUNT(*) AS total FROM prestamos WHERE estado = 'activo'").get().total;
    const totalUsuarios = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total;
    const atrasados = db.prepare(`
        SELECT COUNT(*) AS total FROM prestamos
        WHERE estado = 'activo' AND date(fecha_limite) < date('now', 'localtime')
    `).get().total;

    res.json({ totalLibros, disponibles, prestados: totalLibros - disponibles, prestamosActivos, totalUsuarios, atrasados });
});

module.exports = router;
