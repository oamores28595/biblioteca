const express = require('express');
const router = express.Router();
const db = require('../database/db');

function validarId(id) {
    const numero = Number(id);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function validarDatosUsuario(datos) {
    const nombreCompleto = typeof datos?.nombre_completo === 'string' ? datos.nombre_completo.trim() : '';
    const correo = typeof datos?.correo === 'string' ? datos.correo.trim() : '';
    const telefono = typeof datos?.telefono === 'string' ? datos.telefono.trim() : '';

    if (!nombreCompleto || !correo) {
        return { error: 'nombre_completo y correo son obligatorios' };
    }
    if (nombreCompleto.length > 120) {
        return { error: 'El nombre no puede superar 120 caracteres' };
    }
    if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return { error: 'Ingresa un correo electrónico válido' };
    }
    if (telefono.length > 30) {
        return { error: 'El teléfono no puede superar 30 caracteres' };
    }

    return { nombreCompleto, correo, telefono: telefono || null };
}

function esCorreoDuplicado(err) {
    return err.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

router.get('/', (req, res) => {
    const usuarios = db.prepare(`
        SELECT u.*,
            COUNT(p.id_prestamo) AS total_prestamos,
            COALESCE(SUM(CASE WHEN p.estado = 'activo' THEN 1 ELSE 0 END), 0) AS prestamos_activos
        FROM usuarios u
        LEFT JOIN prestamos p ON p.id_usuario = u.id_usuario
        GROUP BY u.id_usuario
        ORDER BY u.nombre_completo ASC
    `).all();
    res.json(usuarios);
});

router.get('/:id', (req, res) => {
    const idUsuario = validarId(req.params.id);
    if (!idUsuario) return res.status(400).json({ error: 'El identificador de usuario no es válido' });

    const usuario = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(idUsuario);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    const prestamos = db.prepare(`
        SELECT p.*, l.titulo, l.autor
        FROM prestamos p JOIN libros l ON p.id_libro = l.id_libro
        WHERE p.id_usuario = ?
        ORDER BY p.fecha_prestamo DESC
    `).all(idUsuario);

    res.json({ ...usuario, prestamos });
});

router.post('/', (req, res) => {
    const datos = validarDatosUsuario(req.body);
    if (datos.error) return res.status(400).json({ error: datos.error });

    try {
        const info = db.prepare(`
            INSERT INTO usuarios (nombre_completo, correo, telefono) VALUES (?, ?, ?)
        `).run(datos.nombreCompleto, datos.correo, datos.telefono);

        const nuevo = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(info.lastInsertRowid);
        res.status(201).json(nuevo);
    } catch (err) {
        if (esCorreoDuplicado(err)) {
            return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
        }
        throw err;
    }
});

router.put('/:id', (req, res) => {
    const idUsuario = validarId(req.params.id);
    if (!idUsuario) return res.status(400).json({ error: 'El identificador de usuario no es válido' });

    const existente = db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(idUsuario);
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' });

    const datos = validarDatosUsuario({
        nombre_completo: req.body?.nombre_completo ?? existente.nombre_completo,
        correo: req.body?.correo ?? existente.correo,
        telefono: req.body?.telefono ?? existente.telefono,
    });
    if (datos.error) return res.status(400).json({ error: datos.error });

    try {
        db.prepare(`
            UPDATE usuarios SET nombre_completo = ?, correo = ?, telefono = ? WHERE id_usuario = ?
        `).run(datos.nombreCompleto, datos.correo, datos.telefono, idUsuario);
    } catch (err) {
        if (esCorreoDuplicado(err)) {
            return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
        }
        throw err;
    }

    res.json(db.prepare('SELECT * FROM usuarios WHERE id_usuario = ?').get(idUsuario));
});

router.delete('/:id', (req, res) => {
    const idUsuario = validarId(req.params.id);
    if (!idUsuario) return res.status(400).json({ error: 'El identificador de usuario no es válido' });

    const eliminarUsuario = db.transaction(() => {
        const usuario = db.prepare('SELECT id_usuario FROM usuarios WHERE id_usuario = ?').get(idUsuario);
        if (!usuario) return { error: 'not_found' };

        const prestamos = db.prepare(`
            SELECT COUNT(*) AS total,
                SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) AS activos
            FROM prestamos
            WHERE id_usuario = ?
        `).get(idUsuario);
        if (prestamos.total > 0) {
            return { error: 'has_loans', total: prestamos.total, activos: prestamos.activos || 0 };
        }

        db.prepare('DELETE FROM usuarios WHERE id_usuario = ?').run(idUsuario);
        return { deleted: true };
    });
    const resultado = eliminarUsuario();

    if (resultado.error === 'not_found') return res.status(404).json({ error: 'Usuario no encontrado' });
    if (resultado.error === 'has_loans') {
        return res.status(409).json({
            error: `No se puede borrar este lector porque tiene ${resultado.total} ${resultado.total === 1 ? 'préstamo registrado' : 'préstamos registrados'}. El historial se conserva.`,
            total_prestamos: resultado.total,
            prestamos_activos: resultado.activos,
        });
    }
    res.status(204).send();
});

module.exports = router;
