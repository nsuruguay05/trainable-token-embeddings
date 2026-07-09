import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function normalizeBase(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function resolveChatBaseUrl(requestedBaseUrl) {
  return normalizeBase(
    requestedBaseUrl ||
      process.env.CHAT_API_BASE ||
      process.env.NEXT_PUBLIC_CHAT_API_BASE ||
      process.env.NEXT_PUBLIC_API_BASE
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const upstreamBaseUrl = resolveChatBaseUrl(body?.chat_api_base);

    if (!upstreamBaseUrl) {
      return NextResponse.json(
        { ok: false, error: 'chat_api_base is required.' },
        { status: 400 }
      );
    }

    const upstreamPayload = { ...body };
    delete upstreamPayload.chat_api_base;

    const upstreamResponse = await fetch(`${upstreamBaseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamPayload),
      cache: 'no-store',
    });

    const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
    const rawBody = await upstreamResponse.text();

    return new Response(rawBody, {
      status: upstreamResponse.status,
      headers: {
        'content-type': contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown_error' },
      { status: 500 }
    );
  }
}
