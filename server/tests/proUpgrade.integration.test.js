'use strict';

const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = 'notesx-pro-upgrade-integration-test-secret';
let baseUrl;
let httpServer;
let testDbName;
let originalWebhookSecret;

const User = require('../models/User');

function getTestMongoConfig() {
  const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/notesx_proupgrade_test';
  const parsed = new URL(uri);
  const sourceDbName = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
  if (!/(^|[_-])test($|[_-])/i.test(sourceDbName)) {
    throw new Error('TEST_MONGO_URI must use a database name containing a separate "test" segment.');
  }

  testDbName = `notesx_proupgrade_test_${process.pid}_${randomUUID().slice(0, 8)}`;
  return { uri, dbName: testDbName };
}

function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

async function createUser({ name, email, role = 'student', isPro = false }) {
  const user = await User.create({
    name,
    email,
    password: 'hashed_test_password',
    role,
    isPro,
    isOnboarded: true,
    isVerified: true,
  });
  return { user, token: signToken(user._id) };
}

async function requestJson(path, { method = 'GET', token, body, headers: extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, data: json };
}

before(async () => {
  originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = JWT_SECRET;

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

after(async () => {
  if (originalWebhookSecret === undefined) {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  } else {
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
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

test('POST /api/users/upgrade-pro rejects unauthenticated and non-admin users', async () => {
  const unauth = await requestJson('/api/users/upgrade-pro', {
    method: 'POST',
    body: { isPro: true },
  });
  assert.equal(unauth.status, 401);

  const student = await createUser({
    name: 'Free Student',
    email: 'free.student@notesx.test',
    role: 'student',
  });
  const moderator = await createUser({
    name: 'Mod User',
    email: 'mod.user@notesx.test',
    role: 'moderator',
  });
  const recruiter = await createUser({
    name: 'Recruiter User',
    email: 'recruiter.user@notesx.test',
    role: 'recruiter',
  });

  for (const actor of [student, moderator, recruiter]) {
    const res = await requestJson('/api/users/upgrade-pro', {
      method: 'POST',
      token: actor.token,
      body: { isPro: true },
    });
    assert.equal(res.status, 403, `Expected 403 for role ${actor.user.role}`);
    const fresh = await User.findById(actor.user._id);
    assert.equal(fresh.isPro, false);
  }

  // Verify student AI quota remains on the free tier
  const quotaRes = await requestJson('/api/ai/quota', { token: student.token });
  assert.equal(quotaRes.status, 200);
  assert.equal(quotaRes.data.isPro, false);
  assert.equal(quotaRes.data.limit, 15);
});

test('Student cannot self-assign isPro via profile update', async () => {
  const student = await createUser({
    name: 'Profile Tester',
    email: 'profile.tester@notesx.test',
    role: 'student',
  });

  const res = await requestJson('/api/users/profile', {
    method: 'PUT',
    token: student.token,
    body: {
      name: 'Profile Tester Updated',
      isPro: true,
      proExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.isPro, false);

  const fresh = await User.findById(student.user._id);
  assert.equal(fresh.isPro, false);
  assert.equal(fresh.proExpiresAt, null);
});

test('Admin can grant and revoke Pro for a target student and validation rejects bad input', async () => {
  const admin = await createUser({
    name: 'Admin User',
    email: 'admin.pro@notesx.test',
    role: 'admin',
  });
  const student = await createUser({
    name: 'Target Student',
    email: 'target.student@notesx.test',
    role: 'student',
  });

  // Invalid userId format -> 400
  const badId = await requestJson('/api/users/upgrade-pro', {
    method: 'POST',
    token: admin.token,
    body: { userId: 'not-an-objectid', isPro: true },
  });
  assert.equal(badId.status, 400);

  // Invalid durationDays -> 400
  const badDuration = await requestJson('/api/users/upgrade-pro', {
    method: 'POST',
    token: admin.token,
    body: { userId: student.user._id.toString(), isPro: true, durationDays: 0 },
  });
  assert.equal(badDuration.status, 400);

  // Nonexistent email -> 404
  const missingUser = await requestJson('/api/users/upgrade-pro', {
    method: 'POST',
    token: admin.token,
    body: { email: 'ghost@notesx.test', isPro: true },
  });
  assert.equal(missingUser.status, 404);

  // Grant Pro by userId for 30 days
  const grantRes = await requestJson('/api/users/upgrade-pro', {
    method: 'POST',
    token: admin.token,
    body: { userId: student.user._id.toString(), isPro: true, durationDays: 30 },
  });
  assert.equal(grantRes.status, 200);
  assert.equal(grantRes.data.user.isPro, true);
  assert.equal(grantRes.data.user.proProvider, 'admin');
  assert.ok(grantRes.data.user.proExpiresAt);

  // Student AI quota now reflects active Pro status
  const proQuota = await requestJson('/api/ai/quota', { token: student.token });
  assert.equal(proQuota.status, 200);
  assert.equal(proQuota.data.isPro, true);
  assert.equal(proQuota.data.limit, null);

  // Revoke Pro by email
  const revokeRes = await requestJson('/api/users/upgrade-pro', {
    method: 'POST',
    token: admin.token,
    body: { email: student.user.email, isPro: false },
  });
  assert.equal(revokeRes.status, 200);
  assert.equal(revokeRes.data.user.isPro, false);
  assert.equal(revokeRes.data.user.proExpiresAt, null);

  const freeQuotaAgain = await requestJson('/api/ai/quota', { token: student.token });
  assert.equal(freeQuotaAgain.status, 200);
  assert.equal(freeQuotaAgain.data.isPro, false);
  assert.equal(freeQuotaAgain.data.limit, 15);
});

test('POST /api/payments/razorpay/webhook fails closed, verifies HMAC, grants idempotently, and revokes', async () => {
  const student = await createUser({
    name: 'Webhook Student',
    email: 'webhook.student@notesx.test',
    role: 'student',
  });

  const capturedPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_test_123456',
          email: student.user.email,
          notes: {
            userId: student.user._id.toString(),
            durationDays: '90',
          },
        },
      },
    },
  });

  // 1. Fails closed with 503 when RAZORPAY_WEBHOOK_SECRET is unset
  const unconfigured = await requestJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: capturedPayload,
  });
  assert.equal(unconfigured.status, 503);

  // Configure secret for signature verification tests
  const secret = 'rzp_test_webhook_secret_xyz';
  process.env.RAZORPAY_WEBHOOK_SECRET = secret;

  // 2. Rejects missing or forged signature with 401
  const missingSig = await requestJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: capturedPayload,
  });
  assert.equal(missingSig.status, 401);

  const badSig = await requestJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: capturedPayload,
    headers: { 'x-razorpay-signature': 'deadbeef'.repeat(8) },
  });
  assert.equal(badSig.status, 401);

  const stillFree = await User.findById(student.user._id);
  assert.equal(stillFree.isPro, false);

  // 3. Valid HMAC-SHA256 signature grants Pro
  const validSig = createHmac('sha256', secret).update(capturedPayload).digest('hex');
  const okRes = await requestJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: capturedPayload,
    headers: { 'x-razorpay-signature': validSig },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.data.activated, true);

  const upgraded = await User.findById(student.user._id);
  assert.equal(upgraded.isPro, true);
  assert.equal(upgraded.proProvider, 'razorpay');
  assert.equal(upgraded.lastPaymentId, 'pay_test_123456');
  const firstExpiry = upgraded.proExpiresAt.getTime();

  // 4. Duplicate replay with same payment id is idempotent (does not extend expiry again)
  const replayRes = await requestJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: capturedPayload,
    headers: { 'x-razorpay-signature': validSig },
  });
  assert.equal(replayRes.status, 200);
  assert.equal(replayRes.data.duplicate, true);
  const afterReplay = await User.findById(student.user._id);
  assert.equal(afterReplay.proExpiresAt.getTime(), firstExpiry);

  // 5. Valid subscription.cancelled revokes Pro
  const cancelPayload = JSON.stringify({
    event: 'subscription.cancelled',
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_999',
          notes: { userId: student.user._id.toString() },
        },
      },
    },
  });
  const cancelSig = createHmac('sha256', secret).update(cancelPayload).digest('hex');
  const cancelRes = await requestJson('/api/payments/razorpay/webhook', {
    method: 'POST',
    body: cancelPayload,
    headers: { 'x-razorpay-signature': cancelSig },
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.data.revoked, true);

  const revoked = await User.findById(student.user._id);
  assert.equal(revoked.isPro, false);
  assert.equal(revoked.proExpiresAt, null);
});
