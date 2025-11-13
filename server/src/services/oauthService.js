const { OAuth2Client } = require('google-auth-library');
const userService = require('./userService');

const ALLOW_DEMO = process.env.ALLOW_DEMO_OAUTH === 'true';

let googleClient;

function getGoogleClient() {
  if (!googleClient && process.env.GOOGLE_CLIENT_ID) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

async function authenticateWithGoogle(idToken) {
  if (!idToken) {
    throw new Error('idToken is required');
  }

  const client = getGoogleClient();
  if (!client) {
    if (ALLOW_DEMO && idToken === 'demo-google-token') {
      return simulateOAuthUser('google', {
        email: 'google.demo@listener.fm',
        name: 'Google Demo',
        sub: 'google-demo'
      });
    }
    throw new Error('GOOGLE_CLIENT_ID env var is required for Google login');
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();

  return userService.upsertOAuthUser({
    provider: 'google',
    providerId: payload.sub,
    email: payload.email,
    displayName: payload.name,
    avatarUrl: payload.picture
  });
}

async function authenticateWithFacebook(accessToken) {
  if (!accessToken) {
    throw new Error('accessToken is required');
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    if (ALLOW_DEMO && accessToken === 'demo-facebook-token') {
      return simulateOAuthUser('facebook', {
        email: 'facebook.demo@listener.fm',
        name: 'Facebook Demo',
        id: 'facebook-demo'
      });
    }
    throw new Error('FACEBOOK_APP_ID and FACEBOOK_APP_SECRET env vars are required for Facebook login');
  }

  const appToken = `${appId}|${appSecret}`;
  const debugUrl = new URL('https://graph.facebook.com/debug_token');
  debugUrl.searchParams.set('input_token', accessToken);
  debugUrl.searchParams.set('access_token', appToken);

  const debugResp = await fetch(debugUrl);
  const debugData = await debugResp.json();
  if (!debugResp.ok || !debugData.data || !debugData.data.is_valid) {
    throw new Error('Invalid Facebook token');
  }

  const profileUrl = new URL('https://graph.facebook.com/me');
  profileUrl.searchParams.set('fields', 'id,name,email,picture');
  profileUrl.searchParams.set('access_token', accessToken);
  const profileResp = await fetch(profileUrl);
  const profile = await profileResp.json();
  if (!profileResp.ok) {
    throw new Error('Unable to fetch Facebook profile');
  }

  return userService.upsertOAuthUser({
    provider: 'facebook',
    providerId: profile.id,
    email: profile.email || `${profile.id}@facebook.local`,
    displayName: profile.name,
    avatarUrl: profile.picture?.data?.url
  });
}

function simulateOAuthUser(provider, profile) {
  return userService.upsertOAuthUser({
    provider,
    providerId: profile.sub || profile.id,
    email: profile.email,
    displayName: profile.name,
    avatarUrl: null
  });
}

module.exports = {
  authenticateWithGoogle,
  authenticateWithFacebook
};
