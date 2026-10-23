const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'biblioteca.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const dbExisted = fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// Migración: si la base de datos ya existía de antes de agregar la
// carga de PDFs, le añadimos la columna sin perder los datos existentes.
const columnasLibros = db.prepare("PRAGMA table_info(libros)").all().map(c => c.name);
if (!columnasLibros.includes('archivo_pdf')) {
    db.exec('ALTER TABLE libros ADD COLUMN archivo_pdf TEXT');
    console.log('🔧 Migración aplicada: columna archivo_pdf añadida a libros');
}

const columnasBibliotecarios = db.prepare("PRAGMA table_info(bibliotecarios)").all().map(c => c.name);
if (!columnasBibliotecarios.includes('rol')) {
    db.exec("ALTER TABLE bibliotecarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'lector' CHECK (rol IN ('administrador', 'lector'))");
    console.log('🔧 Migración aplicada: las cuentas existentes requieren aprovisionamiento de administrador');
}

if (!dbExisted) {
    console.log('📚 Base de datos creada por primera vez en:', DB_PATH);
}

module.exports = db;
