import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const SUPABASE_URL='https://xzlyhobauukyoffvuymi.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_gvF0mavCgeBZe_CCtuQ11Q_kQGHPSYB';
const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
let editingId = null;
const $=id=>document.getElementById(id); const fmt=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
$('date').value=new Date().toISOString().slice(0,10);
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('auth-msg').textContent='Entrando…';let {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});$('auth-msg').textContent=error?.message||'';if(!error)await init();});
$('logout').onclick=async()=>{await sb.auth.signOut();location.reload()};

$('entry-form').addEventListener('submit',async e=>{
  e.preventDefault();
  $('entry-msg').textContent='Salvando…';

  const {data:{user}}=await sb.auth.getUser();

  const payload={
    user_id:user.id,
    type:$('kind').value,
    description:$('description').value,
    amount:Number($('amount').value),
    date:$('date').value,
    category:$('category').value,
    status:$('status').value,
    payer:$('payer').value||null
  };

  const {error}=editingId
    ? await sb.from('transactions').update(payload).eq('id',editingId)
    : await sb.from('transactions').insert(payload);

  $('entry-msg').textContent=error
    ? error.message
    : editingId ? 'Lançamento atualizado!' : 'Lançamento salvo!';

  if(!error){
    editingId=null;
    e.target.reset();
    $('date').value=new Date().toISOString().slice(0,10);
    await load();
  }
});
$('filter').onchange=load;
async function init(){const {data:{session}}=await sb.auth.getSession();if(session){$('auth').classList.add('hidden');$('app').classList.remove('hidden');$('logout').classList.remove('hidden');await load();}}
async function load(){const {data,error}=await sb.from('transactions').select('*').order('date',{ascending:false});if(error){$('entry-msg').textContent=error.message;return;}const all=data||[],month=new Date().toISOString().slice(0,7);const paid=all.filter(x=>x.status==='pago');$('balance').textContent=fmt(paid.reduce((s,x)=>s+(x.type==='entrada'?x.amount:-x.amount),0));$('income').textContent=fmt(paid.filter(x=>x.type==='entrada'&&x.date.startsWith(month)).reduce((s,x)=>s+x.amount,0));$('expense').textContent=fmt(paid.filter(x=>x.type==='despesa'&&x.date.startsWith(month)).reduce((s,x)=>s+x.amount,0));$('pending').textContent=fmt(all.filter(x=>x.status==='pendente').reduce((s,x)=>s+x.amount,0));let f=$('filter').value;let shown=all.filter(x=>f==='all'||x.type===f||x.status===f);$('rows').innerHTML=shown.map(x=>`<tr><td>${x.date}</td><td>${esc(x.description)}${x.payer?`<div class="muted">${esc(x.payer)}</div>`:''}</td><td>${esc(x.category||'—')}</td><td><span class="tag">${x.status}</span></td><td class="${x.type==='entrada'?'positive':'negative'}">${x.type==='entrada'?'+':'−'} ${fmt(x.amount)}</td><td><button class="edit" data-id="${x.id}">Editar</button>
<button class="delete" data-id="${x.id}" aria-label="Excluir">×</button></td></tr>`).join('');document.querySelectorAll('.delete').forEach(b=>b.onclick=async()=>{if(confirm('Excluir este lançamento?')){const {error}=await sb.from('transactions').delete().eq('id',b.dataset.id);if(error)alert(error.message);else load();}});}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
sb.auth.onAuthStateChange((_event,session)=>{if(session)init();});
init();
