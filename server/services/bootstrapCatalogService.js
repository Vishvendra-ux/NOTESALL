'use strict';

const fs = require('fs');
const path = require('path');
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
