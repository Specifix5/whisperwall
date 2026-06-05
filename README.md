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
    CF[Cloudflare Proxy and CDN]

    U --> CF

    CF --> CP["cache html and static assets when allowed"]
    CF --> L["/ landing page"]
    CF --> B["/boards/[board] catalog or archive"]
    CF --> T["/boards/[board]/[threadId] thread view"]
    CF --> S1["/rules, /faq, /blotter"]

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
    ACT --> CF
    CF --> SSE["GET /api/activity SSE"]
    SSE --> PG

    UI --> UV["upload checks: size, mime sniffing, optional turnstile"]
    UV --> SH["Sharp converts still images to WebP"]
    UV --> FS[(stored upload file)]

    CF --> UI
    CF --> TP
    CF --> FA

    TP --> REDIS[(Redis turnstile pass storage)]

    CFG["settings.json + env"] --> LD
    CFG --> BL
    CFG --> TL
    CFG --> SL
    CFG --> UV
    CFG --> TP
```

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
