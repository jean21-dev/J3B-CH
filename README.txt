J3B CHAT — SEM BANCO DE DADOS

Este projeto usa Node.js + WebSocket e NÃO grava usuários ou mensagens em banco.

O que existe:
- username único enquanto a pessoa está online;
- mensagens em tempo real;
- fotos em base64 somente na RAM;
- lista de usuários online;
- admin especial: @lanzoh21;
- painel admin com usuários e mensagens temporárias.

Quando:
- o usuário fecha/perde a conexão: a sessão é removida e as conversas envolvendo ela são apagadas;
- o servidor reinicia: tudo é apagado;
- não há banco de dados, arquivo de usuários ou histórico permanente.

IMPORTANTE SOBRE SENHAS:
Esta versão não pede senha. Não existe senha para o servidor armazenar ou mostrar.
Não implemente captura/visualização de senhas de outras pessoas.

COMO RODAR:
1. Instale Node.js.
2. Abra um terminal nesta pasta.
3. Rode:
   npm install
4. Depois:
   npm start
5. Abra:
   http://localhost:3000

Para testar com 2 pessoas:
- abra o endereço em duas janelas/dispositivos que consigam acessar o mesmo servidor;
- use usernames diferentes;
- escolha a pessoa na lista;
- mande texto ou foto.

Para internet, você precisa hospedar o Node.js em um servidor que aceite WebSocket.
