import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '@prisma/config';
import pg from 'pg';

const connectionString = env('DATABASE_URL');

const pool = new pg.Pool({
  connectionString,
  idleTimeoutMillis: 10000, // close idle after 10s
  connectionTimeoutMillis: 7500, // throw within 7.5s
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
