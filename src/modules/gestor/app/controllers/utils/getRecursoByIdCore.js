export async function getRecursoByIdCore({
	id,
	unidadeEfetiva,
	findRecursoByIdComUnidadeNome,
}) {
	return findRecursoByIdComUnidadeNome(id, unidadeEfetiva || null);
}

export default getRecursoByIdCore;