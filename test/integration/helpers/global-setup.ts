import { execFileSync } from 'node:child_process';
import { testDatabaseUrl } from './test-db';

/** Brings the integration database up to date once per Jest run. */
export default function globalSetup(): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'inherit',
  });
}
