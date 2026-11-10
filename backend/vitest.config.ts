import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      PORT: '5001',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/circleup_test?replicaSet=rs0',
      JWT_ACCESS_SECRET: 'test-customer-access-secret-minimum-32-chars',
      JWT_ADMIN_ACCESS_SECRET: 'test-admin-access-secret-minimum-32-chars',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
      FRONTEND_URL: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    },
  },
});

