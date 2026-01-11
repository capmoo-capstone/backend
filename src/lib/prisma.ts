import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '@prisma/config';
import pg from 'pg';

const connectionString = env('DATABASE_URL');
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Instantiate the client with the adapter
export const prisma = new PrismaClient({ adapter });
