const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo-cambiar-en-produccion';
const JWT_EXPIRA_EN = '1h';

function generarToken(bibliotecario) {
    return jwt.sign(
        { id_bibliotecario: bibliotecario.id_bibliotecario, correo: bibliotecario.correo, nombre_completo: bibliotecario.nombre_completo },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRA_EN }
    );
}

function verificarToken(req, res, next) {
    const header = req.headers.authorization || '';
    const tokenHeader = header.startsWith('Bearer ') ? header.slice(7) : null;
    // Algunas rutas se abren en una pestaña nueva (window.open), donde el
    // navegador no permite mandar el header Authorization — para esos casos
    // aceptamos también el token como ?token= en la URL.
    const token = tokenHeader || req.query.token || null;

    if (!token) {
        return res.status(401).json({ error: 'No se envió un token de autenticación' });
    }

    try {
        req.bibliotecario = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado. Inicia sesión de nuevo.' });
    }
}

module.exports = { generarToken, verificarToken, JWT_SECRET };
