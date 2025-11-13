const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userService = require('./userService');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const RESET_TOKEN_WINDOW_MINUTES = Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30);
const IS_DEV = process.env.NODE_ENV !== 'production';

function createJwt(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    tier: user.tier,
    provider: user.provider || 'local'
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    token,
    expiresIn: JWT_EXPIRES_IN,
    user
  };
}

function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function registerUser({ email, password, displayName }) {
  const existing = await userService.findByEmail(email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userService.createUser({
    email,
    passwordHash,
    displayName
  });

  return createJwt(user);
}

async function loginUser({ email, password }) {
  const user = await userService.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash || ''))) {
    throw new Error('Invalid credentials');
  }

  return createJwt(user);
}

function createResetToken() {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_WINDOW_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
}

async function startPasswordReset(email) {
  const user = await userService.findByEmail(email);
  if (!user) {
    return { message: 'If the account exists, a reset link has been generated.' };
  }

  const { token, tokenHash, expiresAt } = createResetToken();
  await userService.storeResetToken({
    userId: user.id,
    tokenHash,
    expiresAt
  });

  return {
    message: 'Reset instructions generated.',
    // Return token in dev mode so testers can complete reset without email service.
    resetToken: IS_DEV ? token : undefined
  };
}

async function completePasswordReset({ token, password }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const storedToken = await userService.findResetToken(tokenHash);

  if (!storedToken) {
    throw new Error('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await userService.updatePassword(storedToken.user_id || storedToken.userId, passwordHash);
  await userService.markResetTokenUsed(storedToken.id);

  const user = await userService.findById(storedToken.user_id || storedToken.userId);
  return createJwt(user);
}

module.exports = {
  registerUser,
  loginUser,
  createJwt,
  verifyJwt,
  startPasswordReset,
  completePasswordReset
};
