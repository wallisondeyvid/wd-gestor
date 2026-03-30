export async function processCreateRecursoCore({
	requestedUnitId,
	tipo,
	placa,
	chassi,
	renavam,
	ano,
	mod,
	marca,
	modelo,
	cor,
	findRecursosByFiltroComUnidadeLean,
	createRecursoDb,
}) {
	const normalizedPlaca = placa.toUpperCase();
	const normalizedChassi = chassi.toUpperCase();

	if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, placa: normalizedPlaca })).length > 0) {
		return { error: 'duplicate_placa' };
	}
	if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, chassi: normalizedChassi })).length > 0) {
		return { error: 'duplicate_chassi' };
	}
	if ((await findRecursosByFiltroComUnidadeLean({ unidade_id: requestedUnitId, renavam })).length > 0) {
		return { error: 'duplicate_renavam' };
	}

	return createRecursoDb({
		unidade_id: requestedUnitId,
		tipo,
		placa: normalizedPlaca,
		chassi: normalizedChassi,
		renavam,
		ano: parseInt(ano),
		mod: parseInt(mod),
		marca,
		modelo,
		cor,
		ativo: true,
	});
}