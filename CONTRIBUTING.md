# Contribuir com o Órbita

Use Node.js 22.12 ou superior e Git. Execute `npm ci`, `npm test` e `npm run smoke`. O smoke usa apenas repositórios e catálogos temporários; precisa de Node e Git disponíveis no PATH e de uma sessão gráfica.

Abra uma issue com sistema, versão do Órbita, passos para reproduzir e comportamento esperado. Remova caminhos pessoais, tokens e dados privados dos logs. Para mudanças, envie um pull request com a motivação e a validação realizada.

Os comandos usam `cmd.exe` no Windows e `zsh` no macOS. Valide os dois sistemas antes de declarar uma mudança compatível com ambos. Linux ainda não é suportado.

Não adicione catálogos pessoais, `.env`, builds ou logs ao Git. Antes de uma release, rode `npm run check:release`, revise o histórico e confira o conteúdo de `app.asar` com `node scripts/check-release.cjs CAMINHO/app.asar`. A verificação usa padrões conhecidos e não substitui revisão humana.
