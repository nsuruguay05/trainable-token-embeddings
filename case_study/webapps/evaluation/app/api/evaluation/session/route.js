import { NextResponse } from 'next/server';

import { getAssignmentForUser } from '../../../../lib/evaluation-store';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const userId = String(body?.user_id || '').trim();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'user_id is required' },
        { status: 400 }
      );
    }

    const assignment = await getAssignmentForUser(userId);
    if (!assignment) {
      return NextResponse.json(
        { ok: false, error: 'No pending configuration found.' },
        { status: 404 }
      );
    }

    return NextResponse.json(assignment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    const status =
      message.includes('not found') || message.includes('No pending')
        ? 404
        : message.includes('required')
          ? 400
          : 500;

    return NextResponse.json(
      { ok: false, error: message },
      { status }
    );
  }
}
