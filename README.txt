J3B CHAT — VERSÃO TEMPORÁRIA

Arquivos:
server.js
package.json
public/index.html
public/style.css
public/app.js

O servidor NÃO usa banco de dados.
Os usuários e mensagens ficam somente na RAM do processo Node.js.

Comportamento:
- Username é salvo localmente no aparelho para entrar automaticamente.
- O username não é uma senha.
- Usuários só aparecem na pesquisa quando estão online.
- Ao fechar a conexão, o username fica disponível para outra pessoa e as conversas daquele usuário são removidas da RAM.
- Reiniciar o servidor apaga tudo.
- Fotos são mantidas em RAM como base64.
- @lanzoh21 possui painel administrativo temporário.
- Nenhuma senha é capturada, armazenada ou mostrada.

No Render:
Build Command: npm install
Start Command: npm start

URL usada no app.js:
wss://j3b-ch.onrender.com

Se a URL do seu Render mudar, troque SERVER_URL em public/app.js.
