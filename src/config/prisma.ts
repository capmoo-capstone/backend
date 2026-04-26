import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '@prisma/config';
import pg from 'pg';

const connectionString = env('DATABASE_URL');

const pool = new pg.Pool({
  connectionString,
  idleTimeoutMillis: 30000, // close idle after 30s
  connectionTimeoutMillis: 5000, // throw within 5s
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const adapter = new PrismaPg(pool as any);
export const prisma = new PrismaClient({ adapter });
