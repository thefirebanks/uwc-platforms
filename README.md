# UWC Peru Selection Platform

Web platform for UWC Peru selection management.

Core product areas:
- Applicant flow (application + documents)
- Admin flow (review, validation, communications, exports)
- Multi-stage process management

## Quick Start
```bash
bun install
cp .env.example .env.local
bun run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Documentation
- Start here: `docs/README.md`
- Full developer setup and operational details: `docs/DEVELOPER_SETUP_AND_OPERATIONS.md`

## Security Note
Do not commit secrets. Configure all credentials via environment variables and deployment secret stores.
