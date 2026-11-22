import { logger } from '../config/logger.js';
import { adminAuthService } from '../services/adminAuth.service.js';

function parseCliArgs(): { email?: string; password?: string; name?: string; role?: 'owner' | 'staff'; invalidRole: boolean; force?: boolean } {
  const result: Record<string, string | boolean> = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    if (key) result[key] = value === undefined ? true : value;
  }
  return {
    email: typeof result.email === 'string' ? result.email : undefined,
    password: typeof result.password === 'string' ? result.password : undefined,
    name: typeof result.name === 'string' ? result.name : undefined,
    role: result.role === 'staff' || result.role === 'owner' ? result.role : undefined,
    invalidRole: result.role !== undefined && result.role !== 'staff' && result.role !== 'owner',
    force: result.force === true || result.force === 'true',
  };
}

async function run() {
  const { email, password, name, role, invalidRole, force } = parseCliArgs();
  if (invalidRole) {
    logger.error('Role must be owner or staff.');
    process.exitCode = 1;
    return;
  }
  if (!email || !password || !name?.trim()) {
    logger.error('Usage: npm run admin:create -- --email=<email> --password=<password> --name=<name> [--role=owner|staff] [--force]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    logger.error('Admin password must be at least 8 characters long.');
    process.exitCode = 1;
    return;
  }
  try {
    const user = await adminAuthService.createAdminUser({ email, password, name, role: role || 'owner', force });
    logger.info({ id: user.id, email: user.email, role: user.role }, 'Admin user provisioned successfully.');
  } catch (error) {
    logger.error({ message: error instanceof Error ? error.message : 'Provisioning failed.' }, 'Admin user provisioning failed.');
    process.exitCode = 1;
  }
}

void run();
