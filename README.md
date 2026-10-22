# Órbita

Um aplicativo desktop para organizar e rodar projetos locais com um clique. Construído com Electron, JavaScript e CSS, com interface em português.

## O que faz

- Cadastro de nome, pasta, comando, URL e coleção.
- Botões para iniciar, parar, abrir no navegador, abrir no VS Code e revelar a pasta.
- Logs em tempo real, favoritos, busca e filtros.
- Branch atual e botões para puxar atualizações e publicar commits.
- Verificação de porta local ocupada antes da execução.
- Encerramento dos processos iniciados pelo app ao sair.
- Catálogo persistido apenas no computador, sem conta ou servidor.

## Rodar no macOS

Requisitos: Node.js 22 ou superior e as ferramentas exigidas pelos seus projetos (Flutter, Java, npm etc.).

```sh
npm ci
npm start
```

Para gerar o aplicativo:

```sh
npm run package
```

Abra `dist/v1.1.0/Orbita-darwin-arm64/Orbita.app` em um Mac Apple Silicon; em um Mac Intel, o diretório termina em `x64`. O aplicativo gerado localmente não tem assinatura de distribuição ou notarização da Apple.

Para abrir uma atualização, feche a versão anterior do Órbita quando terminar de executar seus projetos. A nova versão reaproveita o catálogo local existente.

## Cadastrar projetos

Clique em **Novo projeto**, escolha a pasta e informe o comando que você usaria no terminal. O comando roda em um shell de login `zsh`, dentro daquela pasta. O Órbita não instala dependências dos projetos automaticamente.

Exemplos:

| Projeto | Comando | URL |
| --- | --- | --- |
| Node / Vite | `npm run dev -- --port 5173` | `http://localhost:5173` |
| Flutter web | `flutter run -d chrome --web-port=8300` | `http://localhost:8300` |
| Spring Boot | `mvn spring-boot:run` | `http://localhost:8080` |

Use uma porta diferente para cada serviço que deseja executar simultaneamente. O status **Em execução** indica que o processo está ativo; a aplicação pode ainda estar compilando. Consulte os logs para verificar quando está pronta.

O botão do editor usa o protocolo `vscode://`, registrado pela instalação do VS Code. `⌘ N` abre o cadastro e `⌘ K` foca a busca.

## Puxar e publicar na branch

Cada cartão mostra a branch atual e a quantidade de arquivos alterados. As informações são atualizadas ao abrir o aplicativo, cadastrar um projeto ou voltar para a janela.

**Puxar** busca as alterações da branch remota e atualiza somente por fast-forward. Se houver alterações locais, conflitos ou históricos divergentes, o Órbita explica o impedimento para você resolver no editor.

**Publicar** abre uma revisão com o destino remoto, os arquivos alterados e a mensagem do commit. Escolha os arquivos que deseja incluir e clique em **Criar commit e publicar**. Arquivos não selecionados, inclusive alterações já preparadas no Git, ficam preservados localmente. Para enviar commits já existentes, deixe os arquivos desmarcados e use **Publicar commits**.

O destino segue o upstream da branch. Quando ainda não existe upstream, o app usa uma branch com o mesmo nome no remoto `origin` (ou no único remoto disponível) e configura o acompanhamento após o envio. A publicação não usa force push. Se o commit for criado e o envio falhar, ele permanece salvo no computador; reabra a revisão para tentar enviar novamente.

O Git utiliza as credenciais já configuradas no computador. Projetos sem repositório, sem remoto ou em detached HEAD mostram os botões indisponíveis. A integração não publica projetos automaticamente.

## Descoberta local opcional

O utilitário de descoberta encontra projetos Flutter e Maven dentro das pastas indicadas, sem alterar os arquivos de origem:

```sh
node scripts/discover.cjs data/projects.json 'Pessoais=/caminho/para/projetos'
npm start -- --import-local data/projects.json
```

A descoberta ignora dependências, builds e worktrees de agentes. Revise os comandos sugeridos para backends, que podem depender de banco de dados e configuração própria. Importações repetidas preservam cadastros que já usam a mesma pasta.

Os cadastros ficam no diretório `userData` do Electron, normalmente `~/Library/Application Support/Órbita/projects.json` no macOS. Para backup, copie esse arquivo com o app fechado. A pasta `data/`, os logs e os cadastros pessoais não são versionados. O repositório contém apenas a ferramenta: não contém código nem cadastros dos projetos gerenciados.

## Validação

```sh
npm test
npm run smoke
```

Os testes verificam persistência, importação, execução, logs, conflitos de porta, falhas e encerramento da árvore de processos. O smoke test verifica na interface o fluxo de cadastro, favorito, execução, logs, parada, busca e remoção de um projeto temporário. Salva uma captura local em `screenshots/`.

O aplicativo foi preparado para macOS. Os processos são executados em grupos próprios; serviços que deliberadamente se desacoplam do processo original (por exemplo, `docker compose up -d`) têm seu ciclo de vida gerenciado pela ferramenta correspondente.
