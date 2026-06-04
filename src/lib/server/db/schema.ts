import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const boards = pgTable('boards', {
	code: text('code').primaryKey(),
	name: text('name').notNull(),
	category: text('category').notNull().default('All Boards'),
	color: text('color').notNull().default('#d8b4fe'),
	description: text('description').notNull().default('')
});

export const ipAddresses = pgTable(
	'ip_addresses',
	{
		id: serial('id').primaryKey(),
		address: text('address').notNull().unique(),
		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		addressIdx: index('ip_addresses_address_idx').on(table.address)
	})
);

export const threads = pgTable(
	'threads',
	{
		id: serial('id').primaryKey(),
		boardCode: text('board_code')
			.notNull()
			.references(() => boards.code, { onDelete: 'cascade' }),
		subject: text('subject').notNull(),
		author: text('author').notNull().default('Anonymous'),
		authorTripcode: text('author_tripcode'),
		capcode: text('capcode'),
		opSecretHash: text('op_secret_hash'),
		body: text('body').notNull(),
		spoiler: boolean('spoiler').notNull().default(false),
		imageUrl: text('image_url'),
		imageName: text('image_name'),
		imageOriginalName: text('image_original_name'),
		imageSize: text('image_size').notNull().default('remote'),
		imageDimensions: text('image_dimensions').notNull().default('unknown'),
		ipAddressId: integer('ip_address_id').references(() => ipAddresses.id, {
			onDelete: 'set null'
		}),
		fingerprintHash: text('fingerprint_hash'),
		userAgentHash: text('user_agent_hash'),
		views: integer('views').notNull().default(0),
		pinned: boolean('pinned').notNull().default(false),
		archived: boolean('archived').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		boardIdx: index('threads_board_idx').on(table.boardCode),
		updatedIdx: index('threads_updated_idx').on(table.updatedAt)
	})
);

export const posts = pgTable(
	'posts',
	{
		id: serial('id').primaryKey(),
		threadId: integer('thread_id')
			.notNull()
			.references(() => threads.id, { onDelete: 'cascade' }),
		author: text('author').notNull().default('Anonymous'),
		authorTripcode: text('author_tripcode'),
		capcode: text('capcode'),
		isOp: boolean('is_op').notNull().default(false),
		body: text('body').notNull(),
		spoiler: boolean('spoiler').notNull().default(false),
		quotePostId: integer('quote_post_id'),
		imageUrl: text('image_url'),
		imageName: text('image_name'),
		imageOriginalName: text('image_original_name'),
		imageSize: text('image_size').notNull().default('remote'),
		imageDimensions: text('image_dimensions').notNull().default('unknown'),
		ipAddressId: integer('ip_address_id').references(() => ipAddresses.id, {
			onDelete: 'set null'
		}),
		fingerprintHash: text('fingerprint_hash'),
		userAgentHash: text('user_agent_hash'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		threadIdx: index('posts_thread_idx').on(table.threadId),
		createdIdx: index('posts_created_idx').on(table.createdAt)
	})
);

export const hardBans = pgTable(
	'hard_bans',
	{
		id: serial('id').primaryKey(),
		ipAddressId: integer('ip_address_id')
			.notNull()
			.references(() => ipAddresses.id, { onDelete: 'cascade' }),
		reason: text('reason').notNull().default(''),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		ipIdx: index('hard_bans_ip_idx').on(table.ipAddressId)
	})
);

export const softBans = pgTable(
	'soft_bans',
	{
		id: serial('id').primaryKey(),
		ipAddressId: integer('ip_address_id').references(() => ipAddresses.id, { onDelete: 'cascade' }),
		fingerprintHash: text('fingerprint_hash').notNull(),
		userAgentHash: text('user_agent_hash').notNull(),
		reason: text('reason').notNull().default(''),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		identityIdx: index('soft_bans_identity_idx').on(
			table.ipAddressId,
			table.fingerprintHash,
			table.userAgentHash
		)
	})
);

export const activities = pgTable('activities', {
	id: serial('id').primaryKey(),
	kind: text('kind').notNull(),
	boardCode: text('board_code')
		.notNull()
		.references(() => boards.code, { onDelete: 'cascade' }),
	threadId: integer('thread_id').references(() => threads.id, { onDelete: 'cascade' }),
	message: text('message').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const appSettings = pgTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const boardsRelations = relations(boards, ({ many }) => ({
	threads: many(threads)
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
	board: one(boards, {
		fields: [threads.boardCode],
		references: [boards.code]
	}),
	ipAddress: one(ipAddresses, {
		fields: [threads.ipAddressId],
		references: [ipAddresses.id]
	}),
	posts: many(posts)
}));

export const postsRelations = relations(posts, ({ one }) => ({
	thread: one(threads, {
		fields: [posts.threadId],
		references: [threads.id]
	}),
	ipAddress: one(ipAddresses, {
		fields: [posts.ipAddressId],
		references: [ipAddresses.id]
	})
}));

export const ipAddressesRelations = relations(ipAddresses, ({ many }) => ({
	threads: many(threads),
	posts: many(posts),
	hardBans: many(hardBans),
	softBans: many(softBans)
}));

export type Board = typeof boards.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type IpAddress = typeof ipAddresses.$inferSelect;
export type HardBan = typeof hardBans.$inferSelect;
export type SoftBan = typeof softBans.$inferSelect;
