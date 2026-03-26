export async function toggleUsuarioExecutionService({ user }) {
  user.ativo = !user.ativo;
  await user.save();
  return user;
}

export default toggleUsuarioExecutionService;