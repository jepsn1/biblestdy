import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authSchema from './auth-schema';

export const schema = { ...authSchema };

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
