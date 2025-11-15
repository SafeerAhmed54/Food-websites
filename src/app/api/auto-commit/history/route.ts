/**
 * API Route: Get Recent Commit History
 * GET /api/auto-commit/history?count=10
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';

export async function GET(request: NextRequest) {
  try {
    const manager = getServiceManager();
    const service = manager.getService();

    if (!service) {
      return NextResponse.json(
        {
          error: 'Service not initialized',
        },
        { status: 503 }
      );
    }

    // Get count parameter from query string (default: 10, max: 50)
    const searchParams = request.nextUrl.searchParams;
    const countParam = searchParams.get('count');
    let count = 10;

    if (countParam) {
      const parsedCount = parseInt(countParam, 10);
      if (!isNaN(parsedCount) && parsedCount > 0) {
        count = Math.min(parsedCount, 50); // Cap at 50
      }
    }

    const commits = await service.getRecentCommits(count);

    return NextResponse.json({
      commits,
      count: commits.length,
      requestedCount: count,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        error: 'Failed to get commit history',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
