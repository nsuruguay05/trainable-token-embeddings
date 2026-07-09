import 'server-only';

import { google } from 'googleapis';

import { getMockAssignmentForUser, saveMockSubmission } from './mock-evaluation';

const INVALID_WORKSHEET_CHARS = /[\\/*?:\[\]]/g;
const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

let apiClientsPromise;
let spreadsheetIdPromise;

function isTruthyMockFlag(value) {
  if (value === undefined) return true;
  return String(value).trim().toLowerCase() !== 'false';
}

export function isMockEvaluationEnabled() {
  return isTruthyMockFlag(process.env.NEXT_PUBLIC_USE_EVAL_MOCKS ?? process.env.USE_EVAL_MOCKS);
}

function sanitizeWorksheetTitle(rawTitle) {
  const title = String(rawTitle || '').replace(INVALID_WORKSHEET_CHARS, '_').trim().slice(0, 100);
  if (!title) {
    throw new Error('Worksheet title is empty after sanitization.');
  }
  return title;
}

function quoteSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

function columnToLetter(columnNumber) {
  let current = Number(columnNumber);
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result || 'A';
}

function buildGoogleCredentialsFromEnv() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const email =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || '';
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

  if (email && privateKey) {
    return {
      client_email: email,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

async function createAuth() {
  const credentials = buildGoogleCredentialsFromEnv();
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

  if (credentials) {
    return new google.auth.GoogleAuth({
      credentials,
      scopes: SHEETS_SCOPES,
    });
  }

  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: SHEETS_SCOPES,
    });
  }

  throw new Error(
    'Set GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SERVICE_ACCOUNT_FILE, or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
  );
}

async function getApiClients() {
  if (!apiClientsPromise) {
    apiClientsPromise = (async () => {
      const auth = await createAuth();
      return {
        sheets: google.sheets({ version: 'v4', auth }),
        drive: google.drive({ version: 'v3', auth }),
      };
    })();
  }

  return apiClientsPromise;
}

async function resolveSpreadsheetId() {
  if (!spreadsheetIdPromise) {
    spreadsheetIdPromise = (async () => {
      const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
      const spreadsheetName = process.env.GOOGLE_SHEETS_SPREADSHEET_NAME;

      if (spreadsheetId) {
        return spreadsheetId;
      }

      if (!spreadsheetName) {
        throw new Error('Set GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SHEETS_SPREADSHEET_NAME.');
      }

      const { drive } = await getApiClients();
      const response = await drive.files.list({
        q: [
          "mimeType='application/vnd.google-apps.spreadsheet'",
          'trashed=false',
          `name='${spreadsheetName.replace(/'/g, "\\'")}'`,
        ].join(' and '),
        fields: 'files(id,name)',
        pageSize: 2,
      });

      const files = response.data.files || [];
      if (!files.length) {
        throw new Error(`Spreadsheet not found: ${spreadsheetName}`);
      }

      return files[0].id;
    })();
  }

  return spreadsheetIdPromise;
}

async function getSpreadsheetMetadata() {
  const { sheets } = await getApiClients();
  const spreadsheetId = await resolveSpreadsheetId();
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties(sheetId,title)',
  });
  return response.data;
}

async function getWorksheetValues(worksheetTitle) {
  const { sheets } = await getApiClients();
  const spreadsheetId = await resolveSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: quoteSheetTitle(worksheetTitle),
  });
  return response.data.values || [];
}

async function updateWorksheetRow(worksheetTitle, rowNumber, values) {
  const { sheets } = await getApiClients();
  const spreadsheetId = await resolveSpreadsheetId();
  const endColumn = columnToLetter(values.length);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetTitle(worksheetTitle)}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [values],
    },
  });
}

async function worksheetExists(worksheetTitle) {
  const metadata = await getSpreadsheetMetadata();
  return (metadata.sheets || []).some(
    (sheet) => sheet?.properties?.title === worksheetTitle
  );
}

async function getWorksheetRecords(worksheetTitle) {
  if (!(await worksheetExists(worksheetTitle))) {
    return null;
  }

  const values = await getWorksheetValues(worksheetTitle);
  const [headers = [], ...rows] = values;

  if (!headers.length) {
    return { headers: [], rows: [] };
  }

  return {
    headers,
    rows: rows.map((rowValues, index) => {
      const record = { _row_number: index + 2 };
      headers.forEach((header, headerIndex) => {
        record[header] = rowValues[headerIndex] || '';
      });
      return record;
    }),
  };
}

function parseAssignmentId(assignmentId) {
  const separatorIndex = String(assignmentId).lastIndexOf(':');
  if (separatorIndex === -1) {
    throw new Error('Invalid assignment_id format.');
  }

  const worksheetTitle = assignmentId.slice(0, separatorIndex);
  const rowText = assignmentId.slice(separatorIndex + 1);

  if (!/^\d+$/.test(rowText)) {
    throw new Error('Invalid assignment_id format.');
  }

  return {
    worksheetTitle,
    rowNumber: Number.parseInt(rowText, 10),
  };
}

export async function getAssignmentForUser(userId) {
  if (isMockEvaluationEnabled()) {
    return getMockAssignmentForUser(userId);
  }

  const worksheetTitle = sanitizeWorksheetTitle(userId);
  const worksheet = await getWorksheetRecords(worksheetTitle);

  if (!worksheet) {
    return null;
  }

  const pendingRows = worksheet.rows.filter(
    (row) => !String(row.evaluation_submitted_at || '').trim()
  );

  if (!pendingRows.length) {
    return null;
  }

  const nextRow = [...pendingRows].sort((left, right) => {
    const leftOrder = Number.parseInt(String(left.sheet_order || '999999'), 10);
    const rightOrder = Number.parseInt(String(right.sheet_order || '999999'), 10);
    return leftOrder - rightOrder;
  })[0];

  return {
    assignment_id: `${worksheetTitle}:${nextRow._row_number}`,
    configuration_id: nextRow.config_id || '',
    user_id: userId,
    sheet_order: nextRow.sheet_order || '',
    configuration: {
      story: nextRow.story_text || '',
      trigger_message: nextRow.trigger_message || '',
      correction_style: nextRow.correction_style || '',
      question_type: nextRow.question_type || '',
      grounded: nextRow.grounded || '',
    },
  };
}

export async function saveEvaluationSubmission(payload) {
  if (isMockEvaluationEnabled()) {
    return saveMockSubmission(payload);
  }

  const assignmentId = String(payload?.assignment_id || '').trim();
  const userId = String(payload?.user_id || '').trim();

  if (!assignmentId) {
    throw new Error('assignment_id is required.');
  }

  if (!userId) {
    throw new Error('user_id is required.');
  }

  const expectedWorksheetTitle = sanitizeWorksheetTitle(userId);
  const { worksheetTitle, rowNumber } = parseAssignmentId(assignmentId);

  if (worksheetTitle !== expectedWorksheetTitle) {
    throw new Error('assignment_id does not match user_id.');
  }

  const worksheet = await getWorksheetRecords(worksheetTitle);
  if (!worksheet || !worksheet.headers.length) {
    throw new Error('Assignment row not found.');
  }

  const currentRecord = worksheet.rows.find((row) => row._row_number === rowNumber);
  if (!currentRecord) {
    throw new Error('Assignment row not found.');
  }

  const currentValues = worksheet.headers.map((header) => currentRecord[header] || '');
  const nextValues = [...currentValues];
  const submittedAt = new Date().toISOString();
  const evaluations = payload?.evaluations || {};
  const updates = {
    user_eval_correction_style: String(evaluations.correction_style || ''),
    user_eval_question_type: String(evaluations.question_type || ''),
    user_eval_grounded: String(evaluations.grounded || ''),
    user_eval_comments: String(payload?.comments || ''),
    conversation_trace: JSON.stringify(
      {
        conversation_id: payload?.conversation_id || '',
        conversation_history: payload?.conversation_history || [],
        completed_interactions: payload?.completed_interactions ?? null,
        max_interactions: payload?.max_interactions ?? null,
      },
      null,
      0
    ),
    evaluation_submitted_at: submittedAt,
  };

  worksheet.headers.forEach((header, index) => {
    if (header in updates) {
      nextValues[index] = updates[header];
    }
  });

  await updateWorksheetRow(worksheetTitle, rowNumber, nextValues);

  return {
    ok: true,
    evaluation_id: `${worksheetTitle}:${rowNumber}:${submittedAt}`,
    worksheet_title: worksheetTitle,
    row_number: rowNumber,
    configuration_id: currentRecord.config_id || '',
  };
}
