# CircleUp Platform

Centralized thrift-commerce, fashion rental, and community platform built with React + TypeScript, Node.js + Express + TypeScript, Supabase PostgreSQL, and Supabase Storage.

## Architecture Blueprint
See [docs/CIRCLEUP_SYSTEM_DESIGN.md](./docs/CIRCLEUP_SYSTEM_DESIGN.md) for a historical design archive. The current runtime architecture uses Supabase.

## Monorepo Structure
- `shared/` (`@circleup/shared`): Shared domain enums, store defaults, and REST API response contracts.
- `backend/` (`@circleup/backend`): Modular Express + TypeScript REST API.
- `frontend/` (`@circleup/frontend`): Code-split React SPA covering Public Storefront, Customer CRM (`/account/*`), and Owner CRM (`/admin/*`).

## Prerequisites
- Node.js `>= 20` (LTS) and npm `>= 10`
- Supabase project credentials for the backend (see `backend/.env.example`)

## Quick Start
```bash
# 1. Install workspace dependencies
npm install

# 2. Build shared contracts
npm run build --workspace=@circleup/shared

# 3. Configure environment files with the Supabase project URL and server-only service-role key
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Run typecheck & tests
npm run typecheck
npm test

# 5. Start development servers (in separate terminals)
npm run dev:backend
npm run dev:frontend
```

