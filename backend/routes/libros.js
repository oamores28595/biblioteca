const express = require('express');
const router = express.Router();
const db = require('../database/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { indexarLibro, buscarPorContenido } = require('../services/vectores');
const { verificarToken, verificarAdministrador } = require('../middleware/auth');

const CARPETA_PDFS = path.join(__dirname, '..', 'uploads', 'pdfs');
fs.mkdirSync(CARPETA_PDFS, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, CARPETA_PDFS),
    filename: (req, file, cb) => {
        const sufijo = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${sufijo}.pdf`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Solo se permiten archivos PDF'));
        }
        cb(null, true);
    },
});

// Extrae el texto de un PDF ya guardado en disco. Si falla (PDF escaneado,
// corrupto, etc.) devuelve cadena vacía en vez de romper el flujo.
async function extraerTextoPdf(rutaArchivo) {
    try {
        const buffer = fs.readFileSync(rutaArchivo);
        const resultado = await pdfParse(buffer);
        return resultado.text || '';
    } catch (err) {
        console.error('⚠️  No se pudo extraer texto del PDF:', err.message);
        return '';
    }
}

// Dispara la indexación en segundo plano, sin bloquear la respuesta HTTP.
function indexarEnSegundoPlano(idLibro) {
    setImmediate(async () => {
        const libro = db.prepare('SELECT * FROM libros WHERE id_libro = ?').get(idLibro);
        if (!libro) return;
        const textoPdf = libro.archivo_pdf
            ? await extraerTextoPdf(path.join(CARPETA_PDFS, libro.archivo_pdf))
            : '';
        await indexarLibro(db, libro, textoPdf);
    });
}

// GET /api/libros  → listar/buscar. Si viene "q", además de los resultados
// exactos de siempre, se agregan "sugerencias" por contenido (vector) —
// integradas en la misma respuesta, no en un endpoint ni panel aparte.
router.get('/', async (req, res) => {
    const { q, categoria, disponibles } = req.query;

    let sql = `
        SELECT l.*, c.nombre AS categoria_nombre
        FROM libros l
        LEFT JOIN categorias c ON l.id_categoria = c.id_categoria
        WHERE 1 = 1
    `;
    const params = [];

    if (q) {
        sql += ` AND (l.titulo LIKE ? OR l.autor LIKE ? OR l.isbn LIKE ?)`;
        const like = `%${q}%`;
        params.push(like, like, like);
    }
    if (categoria) {
        sql += ` AND c.nombre = ?`;
        params.push(categoria);
    }
    if (disponibles === 'true') {
        sql += ` AND l.ejemplares_disponibles > 0`;
    }

    sql += ` ORDER BY l.titulo ASC`;

    const libros = db.prepare(sql).all(...params);

    // Sugerencias por contenido: solo si hay una búsqueda de texto real.
    // Si Ollama no responde o no hay nada relevante, sugerencias = [].
    let sugerencias = [];
    if (q && q.trim().length > 2) {
        const idsYaEncontrados = libros.map(l => l.id_libro);
        sugerencias = await buscarPorContenido(db, q.trim(), idsYaEncontrados, 3);
    }

    res.json({ resultados: libros, sugerencias });
});

// GET /api/libros/:id → detalle de un libro
router.get('/:id', (req, res) => {
    const libro = db.prepare(`
        SELECT l.*, c.nombre AS categoria_nombre
        FROM libros l LEFT JOIN categorias c ON l.id_categoria = c.id_categoria
        WHERE l.id_libro = ?
    `).get(req.params.id);

    if (!libro) return res.status(404).json({ error: 'Libro no encontrado' });
    res.json(libro);
});

// POST /api/libros → crear libro (multipart/form-data, PDF opcional en "pdf")
router.post('/', verificarToken, verificarAdministrador, upload.single('pdf'), (req, res) => {
    const { titulo, autor, isbn, anio_publicacion, id_categoria, sinopsis, portada_url } = req.body;
    const ejemplares_totales = Number(req.body.ejemplares_totales);

    if (!titulo || !autor) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'titulo y autor son obligatorios' });
    }

    const total = Number.isInteger(ejemplares_totales) && ejemplares_totales > 0 ? ejemplares_totales : 1;
    const archivo_pdf = req.file ? req.file.filename : null;

    try {
        const info = db.prepare(`
            INSERT INTO libros (titulo, autor, isbn, anio_publicacion, id_categoria, sinopsis, portada_url, ejemplares_totales, ejemplares_disponibles, archivo_pdf)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(titulo, autor, isbn || null, anio_publicacion || null, id_categoria || null, sinopsis || null, portada_url || null, total, total, archivo_pdf);

        const nuevo = db.prepare('SELECT * FROM libros WHERE id_libro = ?').get(info.lastInsertRowid);
        res.status(201).json(nuevo);

        // La indexación (extraer texto + generar embeddings) puede tardar
        // unos segundos — se hace después de responder, para no hacer
        // esperar al bibliotecario mientras Ollama procesa el PDF.
        indexarEnSegundoPlano(nuevo.id_libro);
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error('❌ Error al crear libro:', err.message);
        if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Ya existe un libro con ese ISBN' });
        }
        res.status(500).json({ error: `Error al crear el libro: ${err.message}` });
    }
});

// PUT /api/libros/:id → actualizar libro (PDF opcional; solo se reemplaza si se manda uno nuevo)
router.put('/:id', verificarToken, verificarAdministrador, upload.single('pdf'), (req, res) => {
    const existente = db.prepare('SELECT * FROM libros WHERE id_libro = ?').get(req.params.id);
    if (!existente) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Libro no encontrado' });
    }

    const datos = {
        titulo: req.body.titulo || existente.titulo,
        autor: req.body.autor || existente.autor,
        isbn: req.body.isbn || null,
        anio_publicacion: req.body.anio_publicacion ? Number(req.body.anio_publicacion) : null,
        id_categoria: req.body.id_categoria ? Number(req.body.id_categoria) : null,
        sinopsis: req.body.sinopsis || null,
        portada_url: req.body.portada_url || existente.portada_url,
        ejemplares_totales: req.body.ejemplares_totales ? Number(req.body.ejemplares_totales) : existente.ejemplares_totales,
    };
    const pdfAnterior = existente.archivo_pdf;
    const archivo_pdf = req.file ? req.file.filename : existente.archivo_pdf;
    const seReemplazoElPdf = !!req.file;

    db.prepare(`
        UPDATE libros SET
            titulo = ?, autor = ?, isbn = ?, anio_publicacion = ?,
            id_categoria = ?, sinopsis = ?, portada_url = ?, ejemplares_totales = ?, archivo_pdf = ?
        WHERE id_libro = ?
    `).run(
        datos.titulo, datos.autor, datos.isbn, datos.anio_publicacion,
        datos.id_categoria, datos.sinopsis, datos.portada_url, datos.ejemplares_totales, archivo_pdf,
        req.params.id
    );

    if (seReemplazoElPdf && pdfAnterior) {
        fs.unlink(path.join(CARPETA_PDFS, pdfAnterior), () => {});
    }

    const actualizado = db.prepare('SELECT * FROM libros WHERE id_libro = ?').get(req.params.id);
    res.json(actualizado);

    // Re-indexamos siempre que cambie algo relevante para la búsqueda por
    // contenido (título, sinopsis o el PDF), de nuevo sin bloquear la respuesta.
    indexarEnSegundoPlano(req.params.id);
});

// GET /api/libros/:id/pdf → abrir el PDF guardado del libro
// El token viaja como ?token= porque al abrir esto en una pestaña nueva
// (window.open) el navegador no permite mandar el header Authorization normal.
// El middleware verificarToken (montado en server.js) ya acepta ambas formas.
router.get('/:id/pdf', verificarToken, verificarAdministrador, (req, res) => {
    const libro = db.prepare('SELECT archivo_pdf, titulo FROM libros WHERE id_libro = ?').get(req.params.id);
    if (!libro || !libro.archivo_pdf) {
        return res.status(404).send('Este libro no tiene un PDF cargado.');
    }

    const rutaArchivo = path.join(CARPETA_PDFS, libro.archivo_pdf);
    if (!fs.existsSync(rutaArchivo)) {
        return res.status(404).send('El archivo PDF no se encuentra en el servidor.');
    }

    res.setHeader('Content-Disposition', `inline; filename="${libro.titulo.replace(/"/g, '')}.pdf"`);
    res.sendFile(rutaArchivo);
});

// DELETE /api/libros/:id → eliminar libro (y su PDF, si tenía uno; los
// embeddings se borran solos por el ON DELETE CASCADE de la tabla)
router.delete('/:id', verificarToken, verificarAdministrador, (req, res) => {
    const libro = db.prepare('SELECT archivo_pdf FROM libros WHERE id_libro = ?').get(req.params.id);
    const info = db.prepare('DELETE FROM libros WHERE id_libro = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Libro no encontrado' });
    if (libro && libro.archivo_pdf) {
        fs.unlink(path.join(CARPETA_PDFS, libro.archivo_pdf), () => {});
    }
    res.status(204).send();
});

module.exports = router;
