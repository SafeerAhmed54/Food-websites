# Next.js Integration Guide

## Overview

The auto-commit service is integrated into the Next.js application using the instrumentation hook, which automatically initializes the service when the Next.js server starts.

## How It Works

### Service Initialization

1. **Instrumentation Hook** (`instrumentation.ts`): Next.js automatically calls this file on server startup
2. **Service Manager** (`src/lib/service-manager.ts`): Singleton manager that handles the service lifecycle
3. **Auto-Commit Service**: The main service that orchestrates Git operations and scheduling

### Startup Flow

```
Next.js Server Start
    ↓
instrumentation.ts (register function)
    ↓
ServiceManager.initialize()
    ↓
AutoCommitService.initialize()
    ↓
AutoCommitService.start()
    ↓
Service Running (scheduled commits)
```

### Shutdown Flow

```
SIGTERM/SIGINT Signal
    ↓
ServiceManager.shutdown()
    ↓
AutoCommitService.stop()
    ↓
Graceful Exit
```

## Configuration

### Environment Variables

Create a `.env.local` file in the project root:

```bash
# Enable/disable the service
AUTO_COMMIT_ENABLED=true

# Optional: Path to configuration file
AUTO_COMMIT_CONFIG_PATH=./config/auto-commit.config.json

# Optional: Repository path (defaults to current directory)
AUTO_COMMIT_REPO_PATH=/path/to/repository

# Optional: Log file path (defaults to ./logs)
AUTO_COMMIT_LOG_PATH=./logs

# Optional: Log level (debug, info, error)
AUTO_COMMIT_LOG_LEVEL=info
```

### Environment-Based Behavior

- **Development**: Service is enabled by default (set `AUTO_COMMIT_ENABLED=false` to disable)
- **Production**: Service is disabled by default (set `AUTO_COMMIT_ENABLED=true` to enable)
- **Other environments**: Service is enabled by default

## API Endpoints

### GET /api/auto-commit/status

Get the current status of the auto-commit service.

**Response:**
```json
{
  "status": {
    "isRunning": true,
    "lastCommit": "2025-11-15T10:30:00.000Z",
    "nextScheduledCommit": "2025-11-16T18:00:00.000Z",
    "totalCommits": 42,
    "lastError": null
  },
  "config": {
    "enabled": true,
    "commitTime": "0 18 * * *",
    "repositoryPath": "/path/to/repo"
  },
  "repository": {
    "currentBranch": "main",
    "state": "clean",
    "hasUncommittedChanges": false
  }
}
```

### GET /api/auto-commit/history?count=10

Get recent commit history.

**Query Parameters:**
- `count` (optional): Number of commits to retrieve (default: 10, max: 50)

**Response:**
```json
{
  "commits": [
    {
      "hash": "abc123...",
      "message": "chore: daily auto-commit",
      "date": "2025-11-15T18:00:00.000Z",
      "author": "Auto Commit Service"
    }
  ],
  "count": 10,
  "requestedCount": 10
}
```

### POST /api/auto-commit/trigger

Manually trigger a commit.

**Response (Success):**
```json
{
  "success": true,
  "result": {
    "commitHash": "abc123...",
    "message": "chore: manual commit",
    "filesChanged": 5,
    "timestamp": "2025-11-15T10:30:00.000Z"
  }
}
```

**Response (No Changes):**
```json
{
  "success": false,
  "error": "No changes to commit",
  "message": "No changes to commit",
  "filesChanged": 0
}
```

### GET /api/auto-commit

Get API documentation.

## Usage Examples

### Using curl

```bash
# Get service status
curl http://localhost:3000/api/auto-commit/status

# Get commit history
curl http://localhost:3000/api/auto-commit/history?count=20

# Trigger manual commit
curl -X POST http://localhost:3000/api/auto-commit/trigger
```

### Using JavaScript/TypeScript

```typescript
// Get service status
const response = await fetch('/api/auto-commit/status');
const data = await response.json();
console.log('Service status:', data);

// Trigger manual commit
const response = await fetch('/api/auto-commit/trigger', {
  method: 'POST',
});
const result = await response.json();
console.log('Commit result:', result);
```

## Running the Application

### Development Mode

```bash
npm run dev
```

The service will start automatically if `AUTO_COMMIT_ENABLED` is not set to `false`.

### Production Mode

```bash
npm run build
npm start
```

The service will only start if `AUTO_COMMIT_ENABLED=true` is set in the environment.

## Troubleshooting

### Service Not Starting

1. Check the console output for initialization errors
2. Verify Git is installed and accessible
3. Ensure the repository path is valid
4. Check environment variables are set correctly

### Service Running But Not Committing

1. Check the service status: `GET /api/auto-commit/status`
2. Review logs in the configured log directory
3. Verify the cron schedule in the configuration file
4. Check for repository state issues (merge conflicts, detached HEAD, etc.)

### API Endpoints Not Working

1. Ensure the Next.js server is running
2. Check that the service is initialized (may take a few seconds on startup)
3. Review server logs for errors

## Graceful Shutdown

The service handles graceful shutdown automatically:

- Listens for `SIGTERM` and `SIGINT` signals
- Stops the scheduler cleanly
- Saves any pending state
- Exits without data loss

This ensures the service can be safely stopped without interrupting Git operations.
