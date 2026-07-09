import { NextResponse } from 'next/server';

import { saveEvaluationSubmission } from '../../../lib/evaluation-store';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const assignmentId = String(body?.assignment_id || '').trim();

    if (!assignmentId) {
      return NextResponse.json(
        { ok: false, error: 'assignment_id is required' },
        { status: 400 }
      );
    }

    const response = await saveEvaluationSubmission(body);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    const status =
      message.includes('required') ||
      message.includes('Invalid') ||
      message.includes('does not match')
        ? 400
        : message.includes('not found')
          ? 404
          : 500;

    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
