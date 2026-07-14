import { NextRequest, NextResponse } from 'next/server';
import { checkIdleAndSnapshot } from '@/modules/inventory/schedule-actions';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { thresholdMinutes?: number };
    const threshold = body.thresholdMinutes ?? 30;
    const result = await checkIdleAndSnapshot(id, threshold);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
