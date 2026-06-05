# whisperwall

Whisperwall is a compact anonymous imageboard built with SvelteKit, Postgres, Drizzle, and Redis.

## Stack

- SvelteKit
- Postgres + Drizzle ORM
- Redis
- Sharp for server-side image conversion

## App Flow

```mermaid
flowchart TD
    U[User Browser]

    U --> L["/ landing page"]
    U --> B["/boards/[board] catalog or archive"]
    U --> T["/boards/[board]/[threadId] thread view"]
    U --> S1["/rules, /faq, /blotter"]

    L --> LD["load landing data"]
    B --> BL["load board, threads, banners, activities, favorites, turnstile settings"]
    T --> TL["load board, thread, quote links, activities, favorites, turnstile settings"]
    S1 --> SL["load static content + favorites"]

    BL --> NT["New thread modal"]
    NT -->|optional upload| UI["POST /api/upload-image"]
    NT -->|captcha if enabled| TP["POST /api/turnstile-pass"]
    NT --> CTA["board action: createThread"]
    CTA --> MOD["posting checks: turnstile, attachment validation, ban checks, identity"]
    MOD --> CT["createThread()"]
    CT --> PG[(Postgres)]
    CTA -->|redirect| T

    TL --> QR["Quick reply"]
    QR -->|optional upload| UI
    QR -->|captcha if enabled| TP
    QR --> RA["thread action: reply"]
    RA --> AG["archived-thread guard"]
    AG --> RMOD["posting checks: turnstile, attachment validation, ban checks, identity"]
    RMOD --> CR["createReply()"]
    CR --> PG
    RA -->|redirect| T

    TL --> M["moderation actions"]
    M --> MF["pin, unpin, archive, unarchive, spoiler, delete"]
    M --> MB["softban or hardban"]
    MF --> PG
    MB --> PG

    U --> F["favorite toggle in board rail"]
    F --> FA["POST /api/favorites"]
    FA --> CK[(Favorite boards cookie)]

    U --> ACT["live activity rail"]
    ACT --> SSE["GET /api/activity SSE"]
    SSE --> PG

    UI --> UV["upload checks: size, mime sniffing, optional turnstile"]
    UV --> SH["Sharp converts still images to WebP"]
    UV --> FS[(stored upload file)]

    TP --> REDIS[(Redis turnstile pass storage)]

    CFG["settings.json + env"] --> LD
    CFG --> BL
    CFG --> TL
    CFG --> SL
    CFG --> UV
    CFG --> TP
```

### Reading The Diagram

- `settings.json` and env values drive board definitions, banners, and whether Turnstile is enabled.
- Post creation and reply creation both go through the same safety layers: captcha pass, attachment parsing, and moderation checks before writing to Postgres.
- Image uploads are handled separately through `/api/upload-image`, where still images are normalized to WebP and files are stored before the post action submits.
- Favorites are lightweight and cookie-backed, while live activity updates stream from `/api/activity`.
- Archived threads can still be viewed, but replies are blocked by both the UI and the server action guard.

## Local Setup

```bash
cp .env.example .env
docker compose up -d
bun install
bun run db:push
bun run dev
```

Open `http://127.0.0.1:5173`.

## Notes

- Still images are normalized on the server to WebP.
- Threads, posts, boards, and activity are stored in Postgres.
- Favorites are cookie-backed.
