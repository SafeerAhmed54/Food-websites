/**
 * API Route: Auto-Commit API Documentation
 * GET /api/auto-commit
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Auto-Commit API',
    version: '1.0.0',
    description: 'API endpoints for monitoring and controlling the auto-commit service',
    endpoints: [
      {
        path: '/api/auto-commit/status',
        method: 'GET',
        description: 'Get the current status of the auto-commit service',
        response: {
          status: {
            isRunning: 'boolean',
            lastCommit: 'Date | undefined',
            nextScheduledCommit: 'Date | undefined',
            totalCommits: 'number',
            lastError: 'string | undefined',
          },
          config: {
            enabled: 'boolean',
            commitTime: 'string (cron format)',
            repositoryPath: 'string',
          },
          repository: {
            currentBranch: 'string',
            state: 'string',
            hasUncommittedChanges: 'boolean',
          },
        },
      },
      {
        path: '/api/auto-commit/history',
        method: 'GET',
        description: 'Get recent commit history',
        queryParams: {
          count: 'number (optional, default: 10, max: 50)',
        },
        response: {
          commits: 'Array<CommitInfo>',
          count: 'number',
          requestedCount: 'number',
        },
      },
      {
        path: '/api/auto-commit/trigger',
        method: 'POST',
        description: 'Manually trigger a commit',
        response: {
          success: 'boolean',
          result: {
            commitHash: 'string',
            message: 'string',
            filesChanged: 'number',
            timestamp: 'Date',
          },
        },
      },
    ],
    examples: {
      getStatus: 'curl http://localhost:3000/api/auto-commit/status',
      getHistory: 'curl http://localhost:3000/api/auto-commit/history?count=20',
      triggerCommit: 'curl -X POST http://localhost:3000/api/auto-commit/trigger',
    },
  });
}
