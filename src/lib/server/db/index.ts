import { drizzle } from 'drizzle-orm/bun-sql';
import { appEnv } from '$lib/server/config';
import * as schema from './schema';

export const db = drizzle(appEnv.DATABASE_URL, { schema });
