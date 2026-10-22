# Alterações

## 1.4.0-beta.1

Primeira beta pública para organizar e executar projetos locais.

- Cadastro, coleções, favoritos, busca e verificação de portas.
- Execução e encerramento de processos no Windows e macOS.
- Hot reload para Flutter debug e logs com busca, filtros e marca-texto.
- Janelas independentes de logs com fixação no topo.
- Pull por fast-forward e publicação dos arquivos selecionados pelo Git.
- Catálogo local com backup em pastas que não permitem rename.
- Pacotes portáteis, checksums SHA-256, testes e workflow para Windows/macOS.

Limitações: pacotes sem assinatura/notarização; sem atualizações automáticas; Linux não suportado. Os projetos precisam de suas próprias ferramentas e dependências. Processos que se desacoplam, como `docker compose up -d`, devem ser encerrados pela ferramenta correspondente.
