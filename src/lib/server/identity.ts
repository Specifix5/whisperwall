import { createHmac } from 'node:crypto';
import { appEnv } from '$lib/server/config';

type Identity = {
	author: string;
	authorTripcode: string | null;
	capcode: string | null;
};

type TripcodeCredential = {
	author: string;
	authorTripcode: string | null;
};

const credentialNames = {
	admin: 'Admin',
	mod: 'Mod'
} as const;

function credentialsFor(role: keyof typeof credentialNames) {
	const raw = role === 'admin' ? appEnv.ADMIN_CREDENTIAL : appEnv.MOD_CREDENTIAL;
	return new Set(
		(raw ?? '')
			.split(',')
			.map((credential) => credential.trim())
			.filter(Boolean)
	);
}

export function hasStaffCredential(
	credential: string,
	minimumRole: keyof typeof credentialNames = 'mod'
) {
	const trimmed = credential.trim();
	if (!trimmed) return false;
	if (credentialsFor('admin').has(trimmed)) return true;
	return minimumRole === 'mod' && credentialsFor('mod').has(trimmed);
}

export function ensureTripcodeSalt() {
	return appEnv.TRIPCODE_SALT;
}

function parseNameTripcode(name: string) {
	const [authorPart, ...secretParts] = name.split('#');
	return {
		author: authorPart.trim() || 'Anonymous',
		tripSecret: secretParts.join('#').trim()
	};
}

function parseOptions(options: string) {
	const normalized = options
		.trim()
		.split(/\s+/)
		.filter((option) => option.toLowerCase() !== 'noko')
		.join(' ');
	const capMatch = normalized.match(/^(.+)##(Mod|Admin)$/i);
	if (capMatch) {
		return {
			capCredential: capMatch[1].trim(),
			capRole: capMatch[2].toLowerCase() as keyof typeof credentialNames,
			tripSecret: ''
		};
	}

	const tripMatch = normalized.match(/^#(.+)$/);
	return {
		capCredential: '',
		capRole: null,
		tripSecret: tripMatch?.[1]?.trim() ?? ''
	};
}

export function optionsHasCommand(options: string, command: string) {
	return options
		.trim()
		.split(/\s+/)
		.some((option) => option.toLowerCase() === command.toLowerCase());
}

async function makeTripcode(secret: string) {
	if (!secret) return null;
	return `!${createHmac('sha256', appEnv.TRIPCODE_SALT).update(secret).digest('base64url').slice(0, 10)}`;
}

export async function resolveIdentity(name: string, options = ''): Promise<Identity> {
	const parsedName = parseNameTripcode(name);
	const parsedOptions = parseOptions(options);
	const role = parsedOptions.capRole;
	const capcode =
		role && credentialsFor(role).has(parsedOptions.capCredential)
			? `## ${credentialNames[role]}`
			: null;
	const authorTripcode = await makeTripcode(parsedOptions.tripSecret || parsedName.tripSecret);

	return {
		author: parsedName.author,
		authorTripcode,
		capcode
	};
}

export async function resolveTripcodeCredential(
	credential: string
): Promise<TripcodeCredential | null> {
	const parsed = parseNameTripcode(credential);
	if (!parsed.tripSecret) return null;

	return {
		author: parsed.author,
		authorTripcode: await makeTripcode(parsed.tripSecret)
	};
}
