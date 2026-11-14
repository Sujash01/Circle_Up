import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { adminAuthService } from '../services/adminAuth.service.js';

function parseCliArgs(): { email?: string; password?: string; name?: string; role?: 'owner' | 'staff'; force?: boolean } {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, val] = arg.slice(2).split('=');
      if (key) {
        result[key] = val !== undefined ? val : true;
      }
    }
  }

  return {
    email: result.email ? String(result.email) : undefined,
    password: result.password ? String(result.password) : undefined,
    name: result.name ? String(result.name) : 'CircleUp Owner',
    role: (result.role as 'owner' | 'staff') || 'owner',
    force: Boolean(result.force),
  };
}

async function run() {
  const { email, password, name, role = 'owner', force } = parseCliArgs();

  if (!email || !password) {
    logger.error('Usage: npm run admin:create -- --email=<email> --password=<password> [--name=<name>] [--role=owner|staff] [--force]');
    process.exit(1);
  }

  if (password.length < 8) {
    logger.error('Admin password must be at least 8 characters long.');
    process.exit(1);
  }

  logger.info({ uri: env.MONGODB_URI.replace(/:[^:]*@/, ':****@') }, 'Connecting to MongoDB for admin user creation...');
  await connectDatabase();

  try {
    const user = await adminAuthService.createAdminUser({
      email: email as string,
      password: password as string,
      name: name || 'CircleUp Owner',
      role,
      force,
    });
    logger.info({ email: (user as { email: string }).email, role: (user as { role: string }).role }, 'Admin user created successfully.');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Failed to create admin user.');
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }

  process.exit(0);
}

run().catch((err) => {
  logger.error(err, 'Unhandled error in admin creation CLI.');
  process.exit(1);
});
