const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const oauthService = require('../services/oauthService');

const router = express.Router();

function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map((err) => err.msg).join(', ');
    const error = new Error(message);
    error.statusCode = 422;
    throw error;
  }
}

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('displayName').notEmpty().withMessage('Display name is required')
  ],
  async (req, res, next) => {
    try {
      handleValidation(req);
      const result = await authService.registerUser(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res, next) => {
    try {
      handleValidation(req);
      const result = await authService.loginUser(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/oauth/google',
  [body('idToken').notEmpty().withMessage('Google idToken is required')],
  async (req, res, next) => {
    try {
      handleValidation(req);
      const user = await oauthService.authenticateWithGoogle(req.body.idToken);
      const result = authService.createJwt(user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/oauth/facebook',
  [body('accessToken').notEmpty().withMessage('Facebook accessToken is required')],
  async (req, res, next) => {
    try {
      handleValidation(req);
      const user = await oauthService.authenticateWithFacebook(req.body.accessToken);
      const result = authService.createJwt(user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/password/request',
  [body('email').isEmail().withMessage('Valid email is required')],
  async (req, res, next) => {
    try {
      handleValidation(req);
      const payload = await authService.startPasswordReset(req.body.email);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/password/reset',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ],
  async (req, res, next) => {
    try {
      handleValidation(req);
      const payload = await authService.completePasswordReset(req.body);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
