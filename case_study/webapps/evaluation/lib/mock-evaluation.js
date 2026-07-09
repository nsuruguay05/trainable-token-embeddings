import { promises as fs } from 'fs';
import path from 'path';

const mockDataDir = path.join(process.cwd(), 'mock-data');
const configsPath = path.join(mockDataDir, 'evaluation-configs.json');
const submitResponsePath = path.join(mockDataDir, 'evaluation-submit-response.json');
const lastSubmissionPath = path.join(mockDataDir, 'last-evaluation-submission.json');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function stableHash(input) {
  return Array.from(String(input || 'anon')).reduce((accumulator, character) => {
    return (accumulator * 31 + character.charCodeAt(0)) >>> 0;
  }, 7);
}

export async function getMockAssignmentForUser(userId) {
  const data = await readJson(configsPath);
  const assignments = Array.isArray(data) ? data : data.assignments || [];

  if (!assignments.length) {
    throw new Error('NO_MOCK_ASSIGNMENTS');
  }

  const index = stableHash(userId) % assignments.length;
  const selected = assignments[index];

  return {
    assignment_id: `mock_${selected.id}_${String(userId).replace(/\s+/g, '_')}`,
    configuration_id: selected.id,
    user_id: userId,
    configuration: selected.configuration || {},
    label: selected.label || selected.id,
  };
}

export async function saveMockSubmission(payload) {
  const baseResponse = await readJson(submitResponsePath);
  const assignmentId = payload?.assignment_id || 'mock_assignment';
  const response = {
    ...baseResponse,
    ok: baseResponse?.ok ?? true,
    evaluation_id:
      baseResponse?.evaluation_id || `${assignmentId}_${new Date().toISOString().replace(/[:.]/g, '-')}`,
    submitted_at: new Date().toISOString(),
  };

  const record = {
    saved_at: response.submitted_at,
    response,
    payload,
  };

  await fs.writeFile(lastSubmissionPath, JSON.stringify(record, null, 2));
  return response;
}
