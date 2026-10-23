-- ============================================================
-- Esquema de base de datos: Biblioteca Virtual
-- Motor: SQLite
-- ============================================================

CREATE TABLE IF NOT EXISTS bibliotecarios (
    id_bibliotecario INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    correo          TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    rol             TEXT NOT NULL DEFAULT 'lector' CHECK (rol IN ('administrador', 'lector')),
    fecha_registro  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS categorias (
    id_categoria    INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS libros (
    id_libro        INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo          TEXT NOT NULL,
    autor           TEXT NOT NULL,
    isbn            TEXT UNIQUE,
    anio_publicacion INTEGER,
    id_categoria    INTEGER,
    portada_url     TEXT,
    sinopsis        TEXT,
    ejemplares_totales     INTEGER NOT NULL DEFAULT 1,
    ejemplares_disponibles INTEGER NOT NULL DEFAULT 1,
    archivo_pdf     TEXT,
    fecha_registro  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario      INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    correo          TEXT NOT NULL UNIQUE,
    telefono        TEXT,
    fecha_registro  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS prestamos (
    id_prestamo     INTEGER PRIMARY KEY AUTOINCREMENT,
    id_libro        INTEGER NOT NULL,
    id_usuario      INTEGER NOT NULL,
    fecha_prestamo  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_limite    TEXT NOT NULL,
    fecha_devolucion TEXT,
    estado          TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'devuelto', 'atrasado')),
    FOREIGN KEY (id_libro) REFERENCES libros(id_libro) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

-- ============================================================
-- Base de datos vectorial: un libro puede tener varios fragmentos
-- (por ejemplo, uno por cada ~800 caracteres del PDF, o uno solo si
-- solo tiene metadata). Cada fragmento guarda su propio embedding,
-- generado con Phi-3 vía Ollama.
-- ============================================================
CREATE TABLE IF NOT EXISTS embeddings_libros (
    id_embedding    INTEGER PRIMARY KEY AUTOINCREMENT,
    id_libro        INTEGER NOT NULL,
    fragmento       TEXT NOT NULL,
    vector          TEXT NOT NULL,  -- embedding serializado como JSON: "[0.012, -0.44, ...]"
    fecha_creacion  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (id_libro) REFERENCES libros(id_libro) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_libros_titulo ON libros(titulo);
CREATE INDEX IF NOT EXISTS idx_libros_autor ON libros(autor);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado);
CREATE INDEX IF NOT EXISTS idx_embeddings_libro ON embeddings_libros(id_libro);
