// ============================================================
// Servicio de búsqueda vectorial (RAG ligero) usando Phi-3 vía Ollama.
//
// Cómo funciona, en resumen:
// 1. Cuando se crea/edita un libro, tomamos su texto (título + autor +
//    sinopsis + el contenido del PDF si tiene uno) y lo partimos en
//    fragmentos.
// 2. A cada fragmento le pedimos a Ollama un embedding (un vector de
//    números que representa su significado) y lo guardamos en la
//    tabla embeddings_libros — esa tabla ES la "base de datos vectorial".
// 3. Cuando alguien busca algo, convertimos su búsqueda en un vector
//    de la misma forma, y comparamos ese vector contra todos los
//    fragmentos guardados usando similitud de coseno. Los libros cuyos
//    fragmentos se parecen más se devuelven como sugerencias.
//
// Si Ollama no responde en ningún punto de este proceso, todo se
// degrada de forma silenciosa: no se genera el embedding, o la
// búsqueda simplemente no devuelve sugerencias — nunca se rompe la
// funcionalidad normal del catálogo.
// ============================================================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3';
const UMBRAL_SIMILITUD = Number(process.env.OLLAMA_UMBRAL_SIMILITUD || 0.5);
const TIMEOUT_MS = 8000;

const TAMANO_FRAGMENTO = 900;
const SOLAPE_FRAGMENTO = 150;

// ---------- llamada a Ollama con timeout, para no colgar la búsqueda ----------
async function obtenerEmbedding(texto) {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS);

    try {
        const respuesta = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: OLLAMA_MODEL, prompt: texto }),
            signal: controlador.signal,
        });

        if (!respuesta.ok) {
            throw new Error(`Ollama respondió con estado ${respuesta.status}`);
        }

        const data = await respuesta.json();
        if (!Array.isArray(data.embedding)) {
            throw new Error('Ollama no devolvió un embedding válido');
        }
        return data.embedding;
    } finally {
        clearTimeout(timeout);
    }
}

// ---------- partir un texto largo en fragmentos con solape ----------
function dividirEnFragmentos(texto, tamano = TAMANO_FRAGMENTO, solape = SOLAPE_FRAGMENTO) {
    const limpio = texto.replace(/\s+/g, ' ').trim();
    if (!limpio) return [];
    if (limpio.length <= tamano) return [limpio];

    const fragmentos = [];
    let inicio = 0;
    while (inicio < limpio.length) {
        const fin = Math.min(inicio + tamano, limpio.length);
        fragmentos.push(limpio.slice(inicio, fin));
        if (fin === limpio.length) break;
        inicio = fin - solape;
    }
    return fragmentos;
}

// ---------- similitud de coseno entre dos vectores ----------
function similitudCoseno(a, b) {
    let punto = 0, normaA = 0, normaB = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        punto += a[i] * b[i];
        normaA += a[i] * a[i];
        normaB += b[i] * b[i];
    }
    if (normaA === 0 || normaB === 0) return 0;
    return punto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

// ---------- indexar (o re-indexar) un libro ----------
// texto_pdf es opcional: el texto ya extraído del PDF, si tiene uno.
async function indexarLibro(db, libro, textoPdf) {
    try {
        db.prepare('DELETE FROM embeddings_libros WHERE id_libro = ?').run(libro.id_libro);

        const partesBase = [libro.titulo, libro.autor, libro.sinopsis].filter(Boolean).join('. ');
        const textoCompleto = textoPdf ? `${partesBase}. ${textoPdf}` : partesBase;

        const fragmentos = dividirEnFragmentos(textoCompleto);
        if (fragmentos.length === 0) return;

        const insertar = db.prepare(`
            INSERT INTO embeddings_libros (id_libro, fragmento, vector) VALUES (?, ?, ?)
        `);

        for (const fragmento of fragmentos) {
            const vector = await obtenerEmbedding(fragmento);
            insertar.run(libro.id_libro, fragmento, JSON.stringify(vector));
        }

        console.log(`🧠 Libro "${libro.titulo}" indexado (${fragmentos.length} fragmento(s)).`);
    } catch (err) {
        // No queremos que un problema con Ollama impida crear/editar un libro.
        console.error(`⚠️  No se pudo indexar "${libro.titulo}" para búsqueda por contenido:`, err.message);
    }
}

// ---------- buscar libros por contenido semántico ----------
// idsExcluir: ids de libros que ya aparecen en los resultados "normales",
// para no duplicarlos como sugerencia.
async function buscarPorContenido(db, consulta, idsExcluir = [], limite = 5) {
    try {
        const vectorConsulta = await obtenerEmbedding(consulta);

        const filas = db.prepare(`
            SELECT e.id_libro, e.vector, l.titulo, l.autor, l.anio_publicacion,
                   l.ejemplares_totales, l.ejemplares_disponibles, l.archivo_pdf,
                   c.nombre AS categoria_nombre
            FROM embeddings_libros e
            JOIN libros l ON e.id_libro = l.id_libro
            LEFT JOIN categorias c ON l.id_categoria = c.id_categoria
        `).all();

        const mejorPorLibro = new Map();

        for (const fila of filas) {
            if (idsExcluir.includes(fila.id_libro)) continue;
            let vector;
            try {
                vector = JSON.parse(fila.vector);
            } catch {
                continue;
            }
            const similitud = similitudCoseno(vectorConsulta, vector);
            const actual = mejorPorLibro.get(fila.id_libro);
            if (!actual || similitud > actual.similitud) {
                mejorPorLibro.set(fila.id_libro, { ...fila, similitud });
            }
        }

        return [...mejorPorLibro.values()]
            .filter(l => l.similitud >= UMBRAL_SIMILITUD)
            .sort((a, b) => b.similitud - a.similitud)
            .slice(0, limite)
            .map(({ vector, ...resto }) => resto); // no mandamos el vector crudo al frontend
    } catch (err) {
        // Ollama caído, timeout, etc. → sin sugerencias, sin romper la búsqueda normal.
        console.error('⚠️  Búsqueda por contenido no disponible en este momento:', err.message);
        return [];
    }
}

module.exports = { obtenerEmbedding, dividirEnFragmentos, similitudCoseno, indexarLibro, buscarPorContenido };
