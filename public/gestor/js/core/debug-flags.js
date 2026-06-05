(function(global){
	if (global.WDGDebug) return;

	function readFlag(flagName){
		try {
			return global[flagName] === true || global.localStorage?.getItem(flagName) === '1';
		} catch (_) {
			return global[flagName] === true;
		}
	}

	function enabled(flags){
		const list = Array.isArray(flags) ? flags : [flags];
		return list.filter(Boolean).some(readFlag);
	}

	function log(flags, level, ...args){
		if (!enabled(flags)) return;
		const method = (console && typeof console[level] === 'function') ? console[level] : console.log;
		method.apply(console, args);
	}

	global.WDGDebug = { enabled, log };
})(window);