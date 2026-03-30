export async function processUpdateRecursoCore({
	id,
	unidadeEfetiva,
	recurso,
	tipo,
	placa,
	chassi,
	renavam,
	ano,
	mod,
	marca,
	modelo,
	cor,
	ativo,
	findOutroRecursoByPlacaUpper,
	findOutroRecursoByChassiUpper,
	findOutroRecursoByRenavam,
	updateRecursoByIdComUnidadeNome,
}) {
	if (placa && placa.toUpperCase() !== recurso.placa && await findOutroRecursoByPlacaUpper(id, placa.toUpperCase(), unidadeEfetiva)) {
		return { error: 'duplicate_placa' };
	}

	if (chassi && chassi.toUpperCase() !== recurso.chassi && await findOutroRecursoByChassiUpper(id, chassi.toUpperCase(), unidadeEfetiva)) {
		return { error: 'duplicate_chassi' };
	}

	if (renavam && renavam !== recurso.renavam && await findOutroRecursoByRenavam(id, renavam, unidadeEfetiva)) {
		return { error: 'duplicate_renavam' };
	}

	return updateRecursoByIdComUnidadeNome(
		id,
		{
			unidade_id: unidadeEfetiva,
			tipo,
			placa: placa ? placa.toUpperCase() : recurso.placa,
			chassi: chassi ? chassi.toUpperCase() : recurso.chassi,
			renavam,
			ano: ano ? parseInt(ano) : recurso.ano,
			mod: mod ? parseInt(mod) : recurso.mod,
			marca,
			modelo,
			cor,
			ativo: ativo !== undefined ? ativo : recurso.ativo,
		},
		unidadeEfetiva || null,
	);
}