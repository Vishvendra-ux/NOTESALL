'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');

const Roadmap = require('../models/Roadmap');
const Job = require('../models/Job');
const College = require('../models/College');
const CourseCategory = require('../models/CourseCategory');
const Note = require('../models/Note');
const GateQuestion = require('../models/GateQuestion');
const Doubt = require('../models/Doubt');
const ProjectCollab = require('../models/ProjectCollab');
const { bootstrapEmptyCatalogs } = require('../services/bootstrapCatalogService');

let baseUrl;
let httpServer;
let savedEnv;

function getTestMongoConfig() {
  const uri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/notesx_bootstrap_test';
  const parsed = new URL(uri);
  const sourceDbName = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
  if (!/(^|[_-])test($|[_-])/i.test(sourceDbName)) {
    throw new Error('TEST_MONGO_URI must use a database name containing a separate "test" segment.');
  }

  const dbName = `notesx_bootstrap_test_${process.pid}_${randomUUID().slice(0, 8)}`;
  return { uri, dbName };
}

before(async () => {
  savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'notesx-bootstrap-catalog-integration-test-secret';

  const { uri, dbName } = getTestMongoConfig();
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });

  const app = require('../app');
  httpServer = createServer(app);
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
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

test('bootstrapEmptyCatalogs populates all 24 roadmaps and empty catalogs safely and idempotently', async () => {
  const firstRun = await bootstrapEmptyCatalogs();

  assert.equal(firstRun.roadmaps.error, undefined);
  assert.equal(firstRun.jobs.error, undefined);
  assert.equal(firstRun.colleges.error, undefined);
  assert.equal(firstRun.notesHierarchy.error, undefined);
  assert.equal(firstRun.gateQuestions.error, undefined);
  assert.equal(firstRun.doubts.error, undefined);
  assert.equal(firstRun.buildTogether.error, undefined);

  const [roadmaps, jobs, colleges, categories, notes, gateQuestions, doubts, projects] = await Promise.all([
    Roadmap.countDocuments(),
    Job.countDocuments(),
    College.countDocuments(),
    CourseCategory.countDocuments(),
    Note.countDocuments(),
    GateQuestion.countDocuments(),
    Doubt.countDocuments(),
    ProjectCollab.countDocuments(),
  ]);

  assert.equal(roadmaps, 24, `Expected 24 seeded roadmaps, got ${roadmaps}`);
  assert.ok(jobs > 0, 'Expected jobs to be seeded');
  assert.ok(colleges > 0, 'Expected colleges to be seeded');
  assert.ok(categories > 0, 'Expected course categories to be seeded');
  assert.ok(notes > 0, 'Expected starter notes to be seeded');
  assert.ok(gateQuestions > 0, 'Expected GATE questions to be seeded');
  assert.ok(doubts > 0, 'Expected doubts to be seeded');
  assert.ok(projects > 0, 'Expected BuildTogether projects to be seeded');

  // Verify GET /api/roadmaps returns all 24 roadmaps cleanly for a demo/logged-in student
  const demoRes = await fetch(`${baseUrl}/api/auth/demo`, { method: 'POST' });
  assert.equal(demoRes.status, 200);
  const { token } = await demoRes.json();

  const res = await fetch(`${baseUrl}/api/roadmaps`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 24);

  // Second run must be a safe no-op (strictly non-destructive & idempotent)
  const secondRun = await bootstrapEmptyCatalogs();
  assert.equal(secondRun.roadmaps.seeded, false);
  assert.equal(secondRun.jobs.seeded, false);
  assert.equal(secondRun.colleges.seeded, false);
  assert.equal(secondRun.notesHierarchy.seeded, false);
  assert.equal(secondRun.gateQuestions.seeded, false);
  assert.equal(secondRun.doubts.seeded, false);

  assert.equal(await Roadmap.countDocuments(), roadmaps);
  assert.equal(await Note.countDocuments(), notes);
  assert.equal(await Doubt.countDocuments(), doubts);
});
