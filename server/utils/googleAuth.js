const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verifies the Google ID token sent from the frontend and returns the payload
const verifyGoogleToken = async (idToken) => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    email:         payload.email,
    emailVerified: payload.email_verified,
    name:          payload.name,
    picture:       payload.picture,
    googleId:      payload.sub,
  };
};

module.exports = { verifyGoogleToken };
