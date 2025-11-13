const authService = require('../services/authService');
const userService = require('../services/userService');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authorization token missing' });
    }

    const payload = authService.verifyJwt(token);
    const user = await userService.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'User not found for token' });
    }

    req.user = user;
    req.tokenPayload = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: error.message || 'Invalid token' });
  }
}

module.exports = {
  requireAuth
};
