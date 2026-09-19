// ============================================================
// Indexa (o re-indexa) TODOS los libros existentes para la búsqueda
// por contenido. Útil después de correr el seed, o si Ollama estuvo
// caído mientras se añadían libros y quedaron sin sus embeddings.
//
// Uso: npm run indexar   (dentro de la carpeta backend)
// Requiere que Ollama esté corriendo con el modelo configurado
// (por defecto "phi3") accesible en OLLAMA_URL (por defecto localhost:11434).
// ============================================================
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { indexarLibro } = require('../services/vectores');

const CARPETA_PDFS = path.join(__dirname, '..', 'uploads', 'pdfs');

async function extraerTextoPdf(rutaArchivo) {
    try {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(rutaArchivo);
        const resultado = await pdfParse(buffer);
        return resultado.text || '';
    } catch (err) {
        console.error(`   ⚠️  No se pudo leer el PDF (${rutaArchivo}):`, err.message);
        return '';
    }
}

(async () => {
    const libros = db.prepare('SELECT * FROM libros').all();
    console.log(`🧠 Indexando ${libros.length} libro(s) para búsqueda por contenido...`);
    console.log('   (esto puede tardar si Ollama está generando muchos embeddings)');
    console.log('');

    let ok = 0, fallidos = 0;

    for (const libro of libros) {
        const rutaPdf = libro.archivo_pdf ? path.join(CARPETA_PDFS, libro.archivo_pdf) : null;
        const textoPdf = rutaPdf && fs.existsSync(rutaPdf) ? await extraerTextoPdf(rutaPdf) : '';

        try {
            await indexarLibro(db, libro, textoPdf);
            ok++;
        } catch (err) {
            fallidos++;
            console.error(`   ❌ Error indexando "${libro.titulo}":`, err.message);
        }
    }

    console.log('');
    console.log(`✅ Indexación completa: ${ok} libro(s) procesados${fallidos ? `, ${fallidos} con error` : ''}.`);
    console.log('   Si ves errores de conexión a Ollama, verifica que esté corriendo: ollama serve');
    process.exit(0);
})();
