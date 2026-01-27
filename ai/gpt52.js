import fs from "fs";
import OpenAI from "openai";

/**
 * USO:
 *   node ai/gpt52.js run <arquivo-ordem.txt>
 *
 * EXEMPLO:
 *   node ai/gpt52.js run logs/ordem.txt
 */

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function run() {
  const args = process.argv.slice(2);

  // -------------------------------
  // Validação de argumentos
  // -------------------------------
  if (args.length < 2 || args[0] !== "run") {
    console.log("Uso correto:");
    console.log("  node ai/gpt52.js run <arquivo-ordem.txt>");
    process.exit(1);
  }

  const ordemPath = args[1];

  if (!fs.existsSync(ordemPath)) {
    console.error("Arquivo de ordem não encontrado:", ordemPath);
    process.exit(1);
  }

  // -------------------------------
  // Leitura da ordem
  // -------------------------------
  const ordemBase = fs.readFileSync(ordemPath, "utf-8").trim();

  // -------------------------------
  // Leitura automática de logs
  // -------------------------------
  let logs = "";
  const logPath = "logs/mongo-erro.log";

  if (fs.existsSync(logPath)) {
    logs = fs.readFileSync(logPath, "utf-8").trim();
  } else {
    logs = "Nenhum log encontrado.";
  }

  // -------------------------------
  // Prompt FINAL (blindado)
  // -------------------------------
  const promptFinal = `
${ordemBase}

============================================================
LOGS JÁ CARREGADOS PELO SISTEMA (NÃO ACESSAR ARQUIVOS)
============================================================

${logs}

============================================================
REGRAS ABSOLUTAS
- Os logs acima já foram totalmente fornecidos.
- NÃO tente acessar arquivos, paths ou filesystem.
- NÃO solicite conteúdo externo.
- Resolva APENAS com base no texto acima.
- Entregue código pronto para uso.
============================================================
`;

  // -------------------------------
  // Chamada à API
  // -------------------------------
  const response = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content:
          "Você é um engenheiro de software sênior. Você resolve erros reais de produção e entrega código pronto, direto e funcional.",
      },
      {
        role: "user",
        content: promptFinal,
      },
    ],
  });

  // -------------------------------
  // Saída
  // -------------------------------
  console.log("\n=== EXECUÇÃO DA ORDEM ===\n");
  console.log(response.choices[0].message.content);
}

// Execução
run().catch((err) => {
  console.error("Erro ao executar GPT:", err);
});