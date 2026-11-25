'use strict';

const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const CommunityPost = require('../models/CommunityPost');
const Contest = require('../models/Contest');
const GateQuestion = require('../models/GateQuestion');
const { importQuestions } = require('./gateQuestionImportService');
const { seedRoadmapsIfEmpty } = require('../scripts/seedRoadmaps');
const { seedJobsIfEmpty } = require('../scripts/seedJobs');
const { seedCommunityIfEmpty } = require('../scripts/seedCommunityData');
const { seedNotesHierarchyIfEmpty } = require('../scripts/seedNotesHierarchy');
const { seedGateDoubtsIfEmpty } = require('../scripts/seedGateDoubts');
const { seedDefaultProjectsIfEmpty } = require('../controllers/buildTogetherController');

async function seedGateQuestionsIfEmpty() {
  const existingCount = await GateQuestion.countDocuments();
  if (existingCount > 0) {
    return { seeded: false, count: existingCount };
  }

  const fixturePath = path.join(__dirname, '../fixtures/gate_seed_questions.json');
  if (!fs.existsSync(fixturePath)) {
    return { seeded: false, count: 0 };
  }

  const rows = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    return { seeded: false, count: 0 };
  }

  const report = await importQuestions({ questions: rows });
  console.log(`✅ Bootstrapped ${report.inserted} GATE practice questions.`);
  return { seeded: true, count: report.inserted };
}

const SEEDED_BOT_EMAILS = [
  'rahul.gate@gmail.com',
  'priya.topper@iitb.ac.in',
  'prof.verma@glau.ac.in',
];

/**
 * Ensures pre-loaded persona accounts and starter posts/leaderboard rows already in the DB
 * carry isBot: true so the frontend transparently labels every pre-loaded user as BOT.
 */
async function syncBotFlagsOnSeededRecords() {
  await User.updateMany(
    { email: { $in: SEEDED_BOT_EMAILS }, isBot: { $ne: true } },
    { $set: { isBot: true } }
  );

  await CommunityPost.updateMany(
    { authorId: null, isBot: { $ne: true } },
    { $set: { isBot: true } }
  );

  await Contest.updateMany(
    { 'leaderboard.userId': null },
    { $set: { 'leaderboard.$[entry].isBot': true } },
    { arrayFilters: [{ 'entry.userId': null, 'entry.isBot': { $ne: true } }] }
  );

  return { synced: true };
}

/**
 * Safely populates empty catalog collections on a brand-new database (e.g., initial Atlas deployment).
 * Strictly non-destructive: every step checks countDocuments() === 0 before writing anything.
 */
async function bootstrapEmptyCatalogs() {
  const steps = [
    ['roadmaps', seedRoadmapsIfEmpty],
    ['jobs', seedJobsIfEmpty],
    ['colleges', seedCommunityIfEmpty],
    ['notesHierarchy', seedNotesHierarchyIfEmpty],
    ['gateQuestions', seedGateQuestionsIfEmpty],
    ['doubts', seedGateDoubtsIfEmpty],
    ['buildTogether', seedDefaultProjectsIfEmpty],
    ['botTags', syncBotFlagsOnSeededRecords],
  ];

  const summary = {};
  for (const [name, fn] of steps) {
    try {
      summary[name] = (await fn()) || { seeded: true };
    } catch (err) {
      console.error(`⚠️  Catalog bootstrap warning (${name}):`, err.message);
      summary[name] = { error: err.message };
    }
  }
  return summary;
}

module.exports = { bootstrapEmptyCatalogs, seedGateQuestionsIfEmpty };
