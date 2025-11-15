/**
 * API Route: Trigger Manual Commit
 * POST /api/auto-commit/trigger
 */

import { NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';

export async function POST() {
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

    if (!service.isRunning()) {
      return NextResponse.json(
        {
          error: 'Service is not running',
        },
        { status: 503 }
      );
    }

    // Trigger manual commit
    const result = await service.triggerManualCommit();

    if (result.success) {
      return NextResponse.json({
        success: true,
        result: {
          commitHash: result.commitHash,
          message: result.message,
          filesChanged: result.filesChanged,
          timestamp: result.timestamp,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Commit failed',
          message: result.message,
          filesChanged: result.filesChanged,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        error: 'Failed to trigger manual commit',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
