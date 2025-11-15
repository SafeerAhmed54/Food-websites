/**
 * Next.js Instrumentation Hook
 * This file is automatically called by Next.js when the server starts
 * Used to initialize the auto-commit service
 */

export async function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeAutoCommitService } = await import('./src/lib/service-manager');
    
    console.log('[Instrumentation] Initializing auto-commit service');
    
    try {
      await initializeAutoCommitService();
      console.log('[Instrumentation] Auto-commit service initialized successfully');
    } catch (error) {
      console.error('[Instrumentation] Failed to initialize auto-commit service:', error);
      // Don't throw - allow Next.js to continue starting
    }
  }
}
