# Mack Cheer • Financeiro (starter)
Aplicação web simples, hospedável no GitHub Pages e com dados no Supabase.

## 1. Supabase
1. Crie projeto no Supabase.
2. SQL Editor: execute `sql/schema.sql`.
3. Authentication > Providers: habilite Email.
4. Crie usuários em Authentication > Users (Add user).
5. Copie Project URL e anon/public key (Settings > API).

## 2. Configurar
Em `assets/app.js`, substitua:
- `COLE_A_URL_DO_SUPABASE`
- `COLE_A_CHAVE_ANON`

A anon key pode estar no frontend **somente** porque as tabelas usam RLS. Nunca coloque service-role key no frontend.

## 3. Autorizar membros
Depois de criar os usuários, no SQL Editor adicione cada UUID autorizado:
`insert into public.team_members(user_id) values ('UUID_DO_USUARIO');`
Veja UUID em Authentication > Users. Repita para cada membro.

## 4. GitHub Pages
1. Crie um repositório e envie todos os arquivos.
2. Repository > Settings > Pages.
3. Source: Deploy from a branch; branch `main`, folder `/ (root)`.
4. Aguarde o endereço ser publicado.

## Observações
Starter simples: saldo é calculado pelos lançamentos marcados como pago; pendências são mostradas à parte. Os lançamentos são compartilhados com todos os membros autorizados. Neste protótipo, exclusão é permitida para membros e não há edição de lançamentos.
