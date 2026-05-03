NOTE    Triagem read-only pausada deliberadamente: o modulo Clinica segue como wrapper fino e estavel; GETs vivos de API neste snapshot sao herdados do router compartilhado de perfil/modulos/foto, sem handlers clinicos proprios pequenos para reabrir agora.
METHOD  PATH
GET     /clinica
GET     /clinica/api/modulos
GET     /clinica/api/usuario
GET     /clinica/api/usuario/foto
POST    /clinica/api/usuario/foto
PUT     /clinica/api/usuario/senha
POST    /clinica/api/usuarios
POST    /clinica/api/usuarios/:id/delete
POST    /clinica/api/usuarios/:id/toggle
POST    /clinica/api/usuarios/:id/update
GET     /clinica/dashboard