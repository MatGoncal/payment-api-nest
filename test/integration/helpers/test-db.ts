import { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Integration tests run against a real PostgreSQL instance.
 *
 * Unit specs mock the Prisma client, which means transaction boundaries, unique
 * constraints and row locks are invisible to them — exactly the behaviour the
 * money paths depend on. Bring the database up with `docker compose up -d postgres`.
 */

export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!raw) {
    throw new Error(
      'Set TEST_DATABASE_URL (or DATABASE_URL) to run the integration suite.',
    );
  }

  const url = new URL(raw);

  // Concurrency tests open several interactive transactions at once; the Prisma
  // default pool would deadlock waiting for a free connection.
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '15');
  }

  return url.toString();
}

async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export interface TestDb {
  /** Only valid from `beforeAll` onwards. */
  readonly prisma: PrismaService;
}

/**
 * Registers the Jest hooks that connect and truncate between tests. Migrations
 * are applied once per run by `helpers/global-setup.ts`.
 */
export function withTestDb(): TestDb {
  const prisma = new PrismaService({ datasourceUrl: testDatabaseUrl() });

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  return { prisma };
}
