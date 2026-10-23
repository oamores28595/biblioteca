const bcrypt = require('bcryptjs');
const db = require('./db');

const { ADMIN_NOMBRE, ADMIN_CORREO, ADMIN_PASSWORD } = process.env;
const datosAdmin = [ADMIN_NOMBRE, ADMIN_CORREO, ADMIN_PASSWORD];
if (datosAdmin.some(Boolean) && !datosAdmin.every(Boolean)) {
    throw new Error('Configura ADMIN_NOMBRE, ADMIN_CORREO y ADMIN_PASSWORD para crear una cuenta administrativa.');
}
if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');
}
if (ADMIN_CORREO) {
    db.prepare(`
        INSERT INTO bibliotecarios (nombre_completo, correo, password_hash, rol)
        VALUES (?, ?, ?, 'administrador')
        ON CONFLICT(correo) DO UPDATE SET
            nombre_completo = excluded.nombre_completo,
            password_hash = excluded.password_hash,
            rol = 'administrador'
    `).run(ADMIN_NOMBRE, ADMIN_CORREO, bcrypt.hashSync(ADMIN_PASSWORD, 10));
}

const categorias = ['Novela', 'Ciencia Ficción', 'Historia', 'Ciencia', 'Poesía', 'Infantil', 'Tecnología'];

const insertCategoria = db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)');
const catIds = {};
for (const nombre of categorias) {
    insertCategoria.run(nombre);
    const row = db.prepare('SELECT id_categoria FROM categorias WHERE nombre = ?').get(nombre);
    catIds[nombre] = row.id_categoria;
}

const libros = [
    ['Cien años de soledad', 'Gabriel García Márquez', '9780307474728', 1967, 'Novela', 4],
    ['El principito', 'Antoine de Saint-Exupéry', '9780156012195', 1943, 'Infantil', 6],
    ['Fahrenheit 451', 'Ray Bradbury', '9781451673319', 1953, 'Ciencia Ficción', 3],
    ['Sapiens: De animales a dioses', 'Yuval Noah Harari', '9780062316097', 2011, 'Historia', 5],
    ['Cosmos', 'Carl Sagan', '9780345539434', 1980, 'Ciencia', 2],
    ['Veinte poemas de amor', 'Pablo Neruda', '9788420633106', 1924, 'Poesía', 3],
    ['Clean Code', 'Robert C. Martin', '9780132350884', 2008, 'Tecnología', 4],
    ['1984', 'George Orwell', '9780451524935', 1949, 'Ciencia Ficción', 5],
    ['Rayuela', 'Julio Cortázar', '9788437604572', 1963, 'Novela', 2],
    ['Breve historia del tiempo', 'Stephen Hawking', '9780553380163', 1988, 'Ciencia', 3],
];

const insertLibro = db.prepare(`
    INSERT OR IGNORE INTO libros
        (titulo, autor, isbn, anio_publicacion, id_categoria, sinopsis, ejemplares_totales, ejemplares_disponibles, portada_url)
    VALUES (@titulo, @autor, @isbn, @anio, @id_categoria, @sinopsis, @total, @disponibles, @portada)
`);

const tx = db.transaction((libros) => {
    for (const [titulo, autor, isbn, anio, cat, ejemplares] of libros) {
        insertLibro.run({
            titulo, autor, isbn, anio,
            id_categoria: catIds[cat],
            sinopsis: `${titulo}, escrito por ${autor}, es una obra representativa de ${cat.toLowerCase()}.`,
            total: ejemplares,
            disponibles: ejemplares,
            portada: null,
        });
    }
});
tx(libros);

const insertUsuario = db.prepare('INSERT OR IGNORE INTO usuarios (nombre_completo, correo, telefono) VALUES (?, ?, ?)');
insertUsuario.run('Ana Torres', 'ana.torres@correo.com', '6000-1111');
insertUsuario.run('Luis Fernández', 'luis.fernandez@correo.com', '6000-2222');
insertUsuario.run('María Jiménez', 'maria.jimenez@correo.com', '6000-3333');

console.log('✅ Datos de ejemplo insertados correctamente.');
console.log(`   ${ADMIN_CORREO ? 'Cuenta administrativa configurada' : 'Sin cuenta administrativa'}; ${categorias.length} categorías, ${libros.length} libros, 3 usuarios (lectores).`);
if (!ADMIN_CORREO) {
    console.log('   Define ADMIN_NOMBRE, ADMIN_CORREO y ADMIN_PASSWORD para crear una cuenta administrativa.');
}
console.log('');
console.log('   Nota: los libros de este seed aún no tienen embeddings generados.');
console.log('   Corre "npm run indexar" después del seed para generar sus vectores');
console.log('   con Phi-3 (requiere que Ollama esté corriendo).');
