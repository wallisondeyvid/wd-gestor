export async function statusUsuarioLockStateOwnerService({ user, now } = {}) {
	const locked = !!(user.lock_until && user.lock_until > now);
	const secondsRemaining = locked ? Math.max(0, Math.ceil((user.lock_until.getTime() - now.getTime()) / 1000)) : 0;
	const minutesRemaining = locked ? Math.max(0, Math.ceil(secondsRemaining / 60)) : 0;

	return {
		kind: 'ok',
		data: {
			id: user._id,
			email: user.email,
			role: user.role,
			failed_login_attempts: user.failed_login_attempts || 0,
			lock_until: user.lock_until || null,
			locked,
			seconds_remaining: secondsRemaining,
			minutes_remaining: minutesRemaining,
		},
	};
}

export default statusUsuarioLockStateOwnerService;