'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { after, afterEach, before, test } = require('node:test');
const mongoose = require('mongoose');

const User = require('../models/User');
const authController = require('../controllers/authController');

const JWT_SECRET = 'notesx-google-auth-integration-test-secret';
const TEST_CLIENT_ID = '1234567890-testclient.apps.googleusercontent.com';

let baseUrl;
let httpServer;
let testDbName;
let savedEnv;
const originalVerifyIdToken = authController.googleClient.verifyIdToken.bind(authController.googleClient);

function getTestMongoConfig() {
  const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/notesx_googleauth_test';
  const parsed = new URL(uri);
  const sourceDbName = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
  if (!/(^|[_-])test($|[_-])/i.test(sourceDbName)) {
    throw new Error('TEST_MONGO_URI must use a database name containing a separate "test" segment.');
  }

  testDbName = `notesx_googleauth_test_${process.pid}_${randomUUID().slice(0, 8)}`;
  return { uri, dbName: testDbName };
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, data: json };
}

before(async () => {
  savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    ENABLE_DEMO_USER: process.env.ENABLE_DEMO_USER,
  };

  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.GOOGLE_CLIENT_ID = TEST_CLIENT_ID;
  delete process.env.ENABLE_DEMO_USER;

  const { uri, dbName } = getTestMongoConfig();
  process.env.MONGO_URI = uri;

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await User.init();

  const app = require('../app');
  httpServer = createServer(app);
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

afterEach(() => {
  authController.googleClient.verifyIdToken = originalVerifyIdToken;
  process.env.NODE_ENV = 'production';
  process.env.GOOGLE_CLIENT_ID = TEST_CLIENT_ID;
  delete process.env.ENABLE_DEMO_USER;
});

after(async () => {
  authController.googleClient.verifyIdToken = originalVerifyIdToken;
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('POST /api/auth/google rejects unverified email stub in production with 401', async () => {
  const res = await postJson('/api/auth/google', {
    name: 'Google Student',
    email: 'student.google@gmail.com',
  });
  assert.equal(res.status, 401);
});

test('POST /api/auth/google returns 503 when GOOGLE_CLIENT_ID is missing on the server', async () => {
  delete process.env.GOOGLE_CLIENT_ID;

  const res = await postJson('/api/auth/google', {
    credential: 'fake.jwt.token',
  });
  assert.equal(res.status, 503);
  assert.match(res.data.message, /GOOGLE_CLIENT_ID/);
});

test('POST /api/auth/google rejects invalid or unverified Google tokens with 401', async () => {
  authController.googleClient.verifyIdToken = async () => {
    throw new Error('Invalid token signature');
  };

  const invalidRes = await postJson('/api/auth/google', {
    credential: 'tampered.jwt.token',
  });
  assert.equal(invalidRes.status, 401);

  authController.googleClient.verifyIdToken = async () => ({
    getPayload: () => ({
      email: 'unverified@notesx.test',
      email_verified: false,
      name: 'Unverified Student',
    }),
  });

  const unverifiedRes = await postJson('/api/auth/google', {
    credential: 'unverified.jwt.token',
  });
  assert.equal(unverifiedRes.status, 401);
});

test('POST /api/auth/google verifies credential with GOOGLE_CLIENT_ID audience and signs in student', async () => {
  let verifiedCallArgs = null;
  authController.googleClient.verifyIdToken = async (opts) => {
    verifiedCallArgs = opts;
    return {
      getPayload: () => ({
        email: 'Priya.Student@NotesX.test',
        email_verified: true,
        name: 'Priya Sharma',
        picture: 'https://lh3.googleusercontent.com/a/test-avatar',
      }),
    };
  };

  const firstLogin = await postJson('/api/auth/google', {
    credential: 'valid.google.jwt',
  });

  assert.equal(firstLogin.status, 200);
  assert.deepEqual(verifiedCallArgs, {
    idToken: 'valid.google.jwt',
    audience: TEST_CLIENT_ID,
  });
  assert.equal(firstLogin.data.email, 'priya.student@notesx.test');
  assert.equal(firstLogin.data.name, 'Priya Sharma');
  assert.equal(firstLogin.data.role, 'student');
  assert.equal(firstLogin.data.isVerified, true);
  assert.equal(firstLogin.data.isOnboarded, false);
  assert.equal(firstLogin.data.profilePhoto, 'https://lh3.googleusercontent.com/a/test-avatar');
  assert.ok(firstLogin.data.token);

  // Repeat login reuses the same student record
  const secondLogin = await postJson('/api/auth/google', {
    credential: 'valid.google.jwt',
  });
  assert.equal(secondLogin.status, 200);
  assert.equal(secondLogin.data._id, firstLogin.data._id);
});

test('POST /api/auth/demo issues a 2h guest student session and protects demo account mutations', async () => {
  const jwt = require('jsonwebtoken');

  const demoRes = await postJson('/api/auth/demo', {});
  assert.equal(demoRes.status, 200);
  assert.equal(demoRes.data.email, 'demo@notesx.edu');
  assert.equal(demoRes.data.role, 'student');
  assert.equal(demoRes.data.isDemo, true);
  assert.equal(demoRes.data.isOnboarded, true);
  assert.equal(demoRes.data.isPro, false);
  assert.equal(demoRes.data.demoExpiresInSeconds, 7200);
  assert.ok(demoRes.data.token);

  const decoded = jwt.verify(demoRes.data.token, JWT_SECRET);
  assert.equal(decoded.exp - decoded.iat, 7200);

  // Demo token can access protected routes like /api/auth/me
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${demoRes.data.token}` },
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.isDemo, true);

  // Demo account cannot mutate shared profile, re-run onboarding, or self-upgrade Pro
  const profileEditRes = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${demoRes.data.token}`,
    },
    body: JSON.stringify({ name: 'Hacked Name' }),
  });
  assert.equal(profileEditRes.status, 403);

  const onboardRes = await fetch(`${baseUrl}/api/auth/onboarding`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${demoRes.data.token}`,
    },
    body: JSON.stringify({ collegeName: 'Other', course: 'CS', year: '1st' }),
  });
  assert.equal(onboardRes.status, 403);

  const proRes = await fetch(`${baseUrl}/api/users/upgrade-pro`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${demoRes.data.token}`,
    },
    body: JSON.stringify({ isPro: true }),
  });
  assert.equal(proRes.status, 403);

  // Kill-switch DISABLE_DEMO_ACCOUNT=true disables demo login
  process.env.DISABLE_DEMO_ACCOUNT = 'true';
  try {
    const disabledRes = await postJson('/api/auth/demo', {});
    assert.equal(disabledRes.status, 403);
  } finally {
    delete process.env.DISABLE_DEMO_ACCOUNT;
  }
});
