export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureDatabaseReady } = await import("@/lib/database-bootstrap");

    // Aquece o banco sem bloquear a inicialização do servidor. Se o SQLite
    // estiver ocupado, o login fará uma nova tentativa sem derrubar o site.
    void ensureDatabaseReady().catch((error) => {
      const message = error instanceof Error ? error.message : "falha desconhecida";
      console.error(
        "Banco ainda não está pronto; nova tentativa será feita no login:",
        message.slice(0, 240),
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "falha desconhecida";
    console.error(
      "Inicialização do banco adiada sem interromper o servidor:",
      message.slice(0, 240),
    );
  }
}
