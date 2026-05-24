let fixtureSequence = 0;

const DEFAULT_EMAIL_PREFIX = 'controlled-memory-only-user';
const DEFAULT_PASSWORD = 'Senha@123456';
const DEFAULT_NAME = 'Usuario Fixture Memory Only';
const DEFAULT_ROLE = 'user';

function nextFixtureSequence() {
	fixtureSequence += 1;
	return fixtureSequence;
}

function sanitizePrefix(prefix) {
	const normalized = String(prefix || DEFAULT_EMAIL_PREFIX)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-');

	return normalized.replace(/^-+|-+$/g, '') || DEFAULT_EMAIL_PREFIX;
}

function assertSafeFictionalEmail(email) {
	const normalized = String(email || '').trim().toLowerCase();

	if (!normalized) {
		throw new Error('controlledMemoryOnlyFixtureHelper requires a fictional email');
	}

	if (!normalized.endsWith('@example.com')) {
		throw new Error('controlledMemoryOnlyFixtureHelper only accepts @example.com emails');
	}

	return normalized;
}

function buildControlledFixtureEmail(prefix = DEFAULT_EMAIL_PREFIX) {
	const safePrefix = sanitizePrefix(prefix);
	const sequence = nextFixtureSequence();
	return assertSafeFictionalEmail(`${safePrefix}.${Date.now()}.${sequence}@example.com`);
}

function normalizeCpf(value) {
	return String(value || '').replace(/\D/g, '');
}

function buildControlledFixtureCpf() {
	const sequence = nextFixtureSequence();
	const seed = `${Date.now()}${sequence.toString().padStart(4, '0')}`;
	return seed.slice(-11).padStart(11, '0');
}

function isClearlyNonMemoryUri(mongoUri) {
	return /mongodb\+srv:|atlas|documentdb|cosmos/i.test(mongoUri);
}

function isLocalMongoUri(mongoUri) {
	return /mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(mongoUri);
}

function assertMemoryOnlyContext({ mongoUri, env }) {
	if (!env || typeof env !== 'object') {
		throw new Error('controlledMemoryOnlyFixtureHelper requires an env object');
	}

	if (String(env.MONGO_MEMORY || '') !== '1') {
		throw new Error('controlledMemoryOnlyFixtureHelper requires MONGO_MEMORY=1');
	}

	if (!mongoUri) {
		return;
	}

	const normalizedUri = String(mongoUri).trim();

	if (!normalizedUri) {
		return;
	}

	if (isClearlyNonMemoryUri(normalizedUri)) {
		throw new Error('controlledMemoryOnlyFixtureHelper refused a non-memory mongo uri');
	}

	if (!isLocalMongoUri(normalizedUri)) {
		throw new Error('controlledMemoryOnlyFixtureHelper requires a local memory-only mongo uri');
	}
	}

function assertRequiredDependency(value, dependencyName) {
	if (!value) {
		throw new Error(`controlledMemoryOnlyFixtureHelper requires ${dependencyName}`);
	}
	return value;
}

function resolveRounds(value) {
	const rounds = Number(value);
	return Number.isInteger(rounds) && rounds > 0 ? rounds : 12;
}

export async function createControlledMemoryOnlyUserFixture({
	UserModel,
	bcrypt,
	env = process.env,
	mongoUri = env?.MONGO_URI ?? env?.MONGODB_URI ?? null,
	prefix = DEFAULT_EMAIL_PREFIX,
	plainPassword = DEFAULT_PASSWORD,
	nome = DEFAULT_NAME,
	role = DEFAULT_ROLE,
	email,
	cpf,
	ativo = true,
	primeiroAcesso = false,
	senhaProvisoria = false,
	bcryptRounds = env?.BCRYPT_MIN_ROUNDS,
	extraUserFields = {},
} = {}) {
	const resolvedUserModel = assertRequiredDependency(UserModel, 'UserModel');
	const resolvedBcrypt = assertRequiredDependency(bcrypt, 'bcrypt');

	if (typeof resolvedUserModel.create !== 'function') {
		throw new Error('controlledMemoryOnlyFixtureHelper requires UserModel.create');
	}

	if (typeof resolvedBcrypt.hash !== 'function') {
		throw new Error('controlledMemoryOnlyFixtureHelper requires bcrypt.hash');
	}

	assertMemoryOnlyContext({ mongoUri, env });

	const resolvedEmail = email ? assertSafeFictionalEmail(email) : buildControlledFixtureEmail(prefix);
	const resolvedCpf = normalizeCpf(cpf) || buildControlledFixtureCpf();
	const hashedPassword = await resolvedBcrypt.hash(String(plainPassword), resolveRounds(bcryptRounds));

	const user = await resolvedUserModel.create({
		...extraUserFields,
		email: resolvedEmail,
		senha: hashedPassword,
		nome,
		cpf: resolvedCpf,
		role,
		ativo,
		primeiro_acesso: primeiroAcesso,
		senha_provisoria: senhaProvisoria,
	});

	return {
		user,
		userId: String(user._id),
		email: resolvedEmail,
		cpf: resolvedCpf,
		senhaFicticia: String(plainPassword),
		memoryOnly: true,
	};
}