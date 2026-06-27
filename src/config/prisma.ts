import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '@prisma/config';
import pg from 'pg';

pg.defaults.keepAlive = true;

const connectionString = env('DATABASE_URL');
const isProduction = env('NODE_ENV') === 'production';

const pool = new pg.Pool({
  connectionString,
  max: isProduction ? 20 : 10,
  idleTimeoutMillis: isProduction ? 60000 : 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
