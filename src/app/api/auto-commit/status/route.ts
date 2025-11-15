/**
 * API Route: Get Auto-Commit Service Status
 * GET /api/auto-commit/status
 */

import { NextResponse } from 'next/server';
import { getServiceManager } from '@/lib/service-manager';

export async function GET() {
  try {
    const manager = getServiceManager();
    const service = manager.getService();

    if (!service) {
      return NextResponse.json(
        {
          error: 'Service not initialized',
          isRunning: false,
        },
        { status: 503 }
      );
    }

    const status = service.getStatus();
    const config = service.getConfig();
    const repoInfo = await service.getRepositoryInfo();

    return NextResponse.json({
      status: {
        isRunning: status.isRunning,
        lastCommit: status.lastCommit,
        nextScheduledCommit: status.nextScheduledCommit,
        totalCommits: status.totalCommits,
        lastError: status.lastError,
      },
      config: {
        enabled: config?.enabled,
        commitTime: config?.commitTime,
        repositoryPath: config?.repositoryPath,
      },
      repository: {
        currentBranch: repoInfo.currentBranch,
        state: repoInfo.state,
        hasUncommittedChanges: repoInfo.hasUncommittedChanges,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        error: 'Failed to get service status',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
