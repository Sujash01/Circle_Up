# CircleUp Platform

Centralized thrift-commerce, fashion rental, and community platform built with React + TypeScript, Node.js + Express + TypeScript, and MongoDB (Mongoose).

## Architecture Blueprint
See the complete approved engineering specification in [docs/CIRCLEUP_SYSTEM_DESIGN.md](./docs/CIRCLEUP_SYSTEM_DESIGN.md).

## Monorepo Structure
- `shared/` (`@circleup/shared`): Shared domain enums, store defaults, and REST API response contracts.
- `backend/` (`@circleup/backend`): Modular Express + TypeScript REST API.
- `frontend/` (`@circleup/frontend`): Code-split React SPA covering Public Storefront, Customer CRM (`/account/*`), and Owner CRM (`/admin/*`).

## Prerequisites
- Node.js `>= 20` (LTS) and npm `>= 10`
- MongoDB Atlas Free M0 Dev Cluster (native 3-node Replica Set for ACID transactions) **or** native local MongoDB Community Server (`mongod`) initialized with `--replSet rs0`

## Quick Start
```bash
# 1. Install workspace dependencies
npm install

# 2. Build shared contracts
npm run build --workspace=@circleup/shared

# 3. Configure environment files (point MONGODB_URI to your Atlas M0 Dev URI or local mongod)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 4. Run typecheck & tests
npm run typecheck
npm test

# 5. Start development servers (in separate terminals)
npm run dev:backend
npm run dev:frontend
```

