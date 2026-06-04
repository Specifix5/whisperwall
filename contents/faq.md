# FAQ

## What is Whisperwall?

Whisperwall is a small anonymous imageboard. Boards have catalogs, threads, replies,
uploads, tripcodes, staff capcodes, archives, rules pages, and a live activity ticker.

## Do I need an account?

No. Posting is anonymous by default. You can optionally use a tripcode by posting as
`name#password`; the public tripcode proves later posts used the same secret.

## What posting commands are supported?

Put commands in the options field when posting.

- `noko` returns you to the bottom of the thread after your post is created.
- Staff-only commands may assign a capcode when paired with a valid staff password.

Commands are case-insensitive and can be combined with normal posting text where supported.

## Are tripcodes moderation credentials?

No. Tripcodes only identify the poster. Staff actions require a staff password. A tripcode
can only be used to delete content that was posted with that same tripcode.

## Can I delete my own post?

Yes, if you posted it with a tripcode. Select the post, put the same `name#password` in the
password field, and use the delete action. The server compares the resulting tripcode with the
post's stored tripcode.

Tripcode deletion is limited to your own posts or threads. It cannot pin, archive, lock, ban,
delete other people's posts, or use staff capcodes.

## What are capcodes?

Capcodes are staff labels such as Mod or Admin. They are assigned by the server after a valid
staff password is used. Typing "Mod" or "Admin" into the name field does not create a capcode.

## What should I put in the password field?

Most users can leave it blank. Use it only when:

- You are deleting your own tripcoded post with the same `name#password`.
- You are staff performing a moderation action.

Do not reuse an important personal password as a tripcode secret.

## Can staff posts use links?

Yes. Staff-capcoded posts can use Markdown links like `[rules](/boards/g?view=rules)` or
`[site](https://example.com/)`. Regular user posts render that syntax as plain text.

## How do quotes work?

Use `>>123` to quote post number 123. Quote links jump to that post inside the thread.

Lines that start with `>` render as greentext unless they are quote links.

## What can I upload?

Still images are converted to WebP by the server. Light WebM files are accepted as video.
Uploads should be relevant, legal to share, and safe for the board.

## Why do uploaded files have random names?

Uploads are renamed before storage to avoid leaking local filenames and to prevent filename
collisions. Posts show only the useful metadata, such as `(114KB, 678x783, webp)`, linked to
the uploaded media.

## What does follow thread do?

Follow thread keeps the browser near the bottom while auto-refresh is running. It turns itself
off when you scroll upward, so you can read older posts without being pulled back down.

## Why did my post disappear?

It may have been deleted for rule violations, spam, legal risk, duplicate posting, or because
it disrupted the thread. The blotter may mention larger moderation or site changes, but routine
cleanup is not always logged.

## How do favorites work?

Favorite boards are stored in a browser cookie. They are a convenience feature, not an account
or server-side profile.

## Can boards have their own rules?

Yes. Use the rules button inside a board to see board-specific rules. Global rules still apply.
