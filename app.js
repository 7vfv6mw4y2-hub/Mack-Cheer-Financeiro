import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://xzlyhobauukyoffvuymi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gvF0mavCgeBZe_CCtuQ11Q_kQGHPSYB';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let editingId = null;
let planningEditingId = null;

const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

$('date').value = new Date().toISOString().slice(0, 10);
$('report-month').value = new Date().toISOString().slice(0, 7);
$('report-month').onchange = load;
$('filter').onchange = load;
$('statement-month').onchange = load;
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('auth-msg').textContent = 'Entrando…';

  try {
    const { error } = await sb.auth.signInWithPassword({
      email: $('email').value,
      password: $('password').value
    });

    if (error) {
      $('auth-msg').textContent = error.message;
      return;
    }

    await init();
  } catch (err) {
    $('auth-msg').textContent = 'Erro: ' + err.message;
  }
});

$('logout').onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

$('entry-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('entry-msg').textContent = 'Salvando…';

  const { data: { user } } = await sb.auth.getUser();

  const payload = {
    user_id: user.id,
    type: $('kind').value,
    description: $('description').value,
    amount: Number($('amount').value),
    date: $('date').value,
    category: $('category').value,
    status: $('status').value,
    payer: $('payer').value || null,
    athlete_id: $('athlete-link').value || null
};

  const { error } = editingId
    ? await sb.from('transactions').update(payload).eq('id', editingId)
    : await sb.from('transactions').insert(payload);

  $('entry-msg').textContent = error
    ? error.message
    : editingId ? 'Lançamento atualizado!' : 'Lançamento salvo!';

  if (!error) {
    editingId = null;
    e.target.reset();
    $('date').value = new Date().toISOString().slice(0, 10);
    await load();
  }
});

$('planning-form').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    type: $('planning-type').value,
    description: $('planning-description').value,
    category: $('planning-category').value,
    amount: Number($('planning-amount').value),
    status: $('planning-status').value
  };

  const { error } = await sb
    .from('planning_entries')
    .insert(payload);

  if (error) {
    alert(error.message);
    return;
  }

  e.target.reset();
  await loadPlanning();
});

async function loadPlanning() {
  const { data, error } = await sb
    .from('planning_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    $('planning-list').innerHTML = 'Erro: ' + error.message;
    return;
  }

  const entries = data || [];
  const categories = [...new Set(entries.map(x => x.category))];

  $('planning-list').innerHTML = categories.map(category => {
    const items = entries.filter(x => x.category === category);
    const total = items.reduce((s, x) => s + Number(x.amount), 0);

    return `
      <div style="margin:20px 0">
        <h3>${esc(category)} — ${fmt(total)}</h3>
        ${items.map(x => `
          <p>
            ${esc(x.description)} — ${fmt(x.amount)}
            <small>(${esc(x.status)})</small>
          </p>
        `).join('')}
      </div>
    `;
  }).join('') || '<p>Nenhum valor cadastrado.</p>';
}
// CONTROLE DE PAGAMENTOS
$('charges-month').value = new Date().toISOString().slice(0, 7);
$('charges-month').onchange = loadMonthlyCharges;
const chargeLabels = {pago:'Pago conciliado',pago_manual:'Pago manualmente',parcial:'Parcial',pendente:'A conferir / pendente',isento:'Isento',nao_se_aplica:'Não se aplica'};
async function chargeRead(query) { const {data,error}=await query; if(error) throw error; return data || []; }
async function chargeRpc(name,args) { const {error}=await sb.rpc(name,args); if(error) throw error; }
function askMoney(label,initial) { const s=prompt(label,String(initial)); if(s===null)return null; const n=Number(s.replace(',','.')); if(!s.trim() || !Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.000001)throw new Error('Valor inválido.'); return n; }
async function loadMonthlyCharges() {
 const month=$('charges-month').value, out=$('charges-list');
 $('charges-summary').innerHTML=''; out.textContent='Carregando...';
 if(!month)return;
 try {
 const [charges,athletes]=await Promise.all([chargeRead(sb.from('monthly_charge_balances').select('*').eq('month',month)),chargeRead(sb.from('athletes').select('id,name,team'))]);
 if($('charges-month').value!==month)return;
 const map=new Map(athletes.map(a=>[a.id,a]));
 charges.sort((a,b)=>(map.get(a.athlete_id)?.name||'').localeCompare(map.get(b.athlete_id)?.name||'','pt-BR'));
 const valid=charges.filter(c=>!['isento','nao_se_aplica'].includes(c.calculated_status));
 $('charges-summary').innerHTML=[['Previsto',valid.reduce((s,c)=>s+Number(c.amount),0)],['Confirmado (inclui manual)',valid.reduce((s,c)=>s+Number(c.total_paid),0)],['Em aberto / a conferir',valid.reduce((s,c)=>s+Number(c.remaining_amount),0)]].map(([l,v])=>`<article class="card"><span>${l}</span><strong>${fmt(v)}</strong></article>`).join('');
 out.innerHTML=`<p>Confira as cobranças antigas antes de cobrar. Baixas manuais não alteram o caixa.</p><button type="button" id="mc-bulk">Marcar selecionadas como pagas manualmente</button> <button type="button" id="mc-exempt">Isentar selecionadas</button> <button type="button" id="mc-na">Marcar selecionadas como não se aplica</button><div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="mc-all"></th><th>Atleta / equipe</th><th>Valor</th><th>Manual</th><th>Extrato</th><th>Em aberto</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${charges.map(c=>`<tr><td><input type="checkbox" class="mc-check" value="${esc(c.id)}"></td><td>${esc(map.get(c.athlete_id)?.name||'Atleta')}<div class="muted">${esc(map.get(c.athlete_id)?.team||'')}</div></td><td>${fmt(c.amount)}</td><td>${fmt(c.manual_paid_amount)}</td><td>${fmt(c.linked_paid_amount)}<br>Rifa: ${fmt(c.raffle_paid_amount)}</td><td>${fmt(c.remaining_amount)}</td><td>${esc(chargeLabels[c.calculated_status]||c.calculated_status)}<div>${esc(c.notes||'')}</div></td><td><button type="button" data-action="edit" data-id="${esc(c.id)}">Editar</button> <button type="button" data-action="manual" data-id="${esc(c.id)}">Baixa manual</button> <button type="button" data-action="pix" data-id="${esc(c.id)}">Pix / vínculos</button></td></tr>`).join('')}</tbody></table></div><div id="mc-detail"></div>`;
 const run=async fn=>{try{await fn();}catch(e){alert(e.message||String(e));}finally{await loadMonthlyCharges();}};
 const update=async(c,p)=>{const rows=await chargeRead(sb.from('monthly_charges').update(p).eq('id',c.id).select('id'));if(rows.length!==1)throw new Error('Cobrança não atualizada.');};
 $('mc-all').onchange=e=>out.querySelectorAll('.mc-check').forEach(x=>x.checked=e.target.checked);
 for(const [id,mode] of [['mc-bulk','paid'],['mc-exempt','exempt'],['mc-na','na']]) $(id).onclick=()=>{const selected=charges.filter(c=>[...out.querySelectorAll('.mc-check:checked')].some(x=>x.value===c.id));if(!selected.length)return alert('Selecione cobranças.');if(selected.some(c=>(Number(c.linked_paid_amount)>0||Number(c.raffle_paid_amount)>0) || (mode!=='paid'&&Number(c.manual_paid_amount)>0) || (mode==='paid'&&['isento','nao_se_aplica'].includes(c.calculated_status))))return alert('Há cobranças incompatíveis na seleção. Confira os pagamentos e isenções.');if(!confirm(`Atualizar ${selected.length} cobranças?`))return;run(async()=>{let done=0;try{for(const c of selected){if(mode==='paid')await chargeRpc('set_manual_monthly_payment',{p_monthly_charge_id:c.id,p_amount:Number(c.amount)});else await update(c,{status:mode==='exempt'?'isento':'pendente',not_applicable:mode==='na'});done++;}}catch(e){throw new Error(`${done} atualizadas antes do erro: ${e.message}`);}alert(`${done} atualizadas.`);});};
 out.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const c=charges.find(x=>x.id===b.dataset.id);try{
 if(b.dataset.action==='manual'){const n=askMoney('Total pago manualmente (0 para desfazer):',c.manual_paid_amount);if(n!==null)await run(()=>chargeRpc('set_manual_monthly_payment',{p_monthly_charge_id:c.id,p_amount:n}));}
 if(b.dataset.action==='edit'){if((Number(c.linked_paid_amount)>0||Number(c.raffle_paid_amount)>0)||Number(c.manual_paid_amount)>0)return alert('Desfaça os pagamentos antes de editar a cobrança.');const n=askMoney('Valor da cobrança:',c.amount);if(n===null)return;const state=prompt('Situação: 1 = cobrar, 2 = isento, 3 = não se aplica',c.not_applicable?'3':c.status==='isento'?'2':'1');if(state===null)return;if(!['1','2','3'].includes(state))throw new Error('Situação inválida.');const notes=prompt('Observações:',c.notes||'');if(notes===null)return;await run(()=>update(c,{amount:n,status:state==='2'?'isento':'pendente',not_applicable:state==='3',notes}));}
 if(b.dataset.action==='pix')await showChargePix(c,run);
 }catch(e){alert(e.message||String(e));}});
 }catch(e){out.textContent='Erro: '+e.message;}
}
async function showChargePix(c,run){
 const detail=$('mc-detail');detail.textContent='Carregando Pix...';
 const [tx,alloc,history]=await Promise.all([chargeRead(sb.from('transaction_payment_balances').select('*').eq('athlete_id',c.athlete_id).eq('user_id',c.user_id).in('category',['Mensalidade','Inscrição do Campeonato']).gt('available_amount',0).order('date',{ascending:false})),chargeRead(sb.from('monthly_payment_allocations').select('*').eq('monthly_charge_id',c.id)),chargeRead(sb.from('raffle_credit_allocations').select('*').eq('monthly_charge_id',c.id))]);
 const linked=alloc.length?await chargeRead(sb.from('transactions').select('id,date,amount,description').in('id',alloc.map(a=>a.transaction_id))):[];
 if(!detail.isConnected)return;
 detail.innerHTML=`<h3>Pix da atleta — ${esc(c.month)}</h3><p>A data do Pix não define o mês. Saldo desconta todos os vínculos, rifas e estornos.</p>${alloc.map(a=>{const t=linked.find(x=>String(x.id)===String(a.transaction_id));return `<p>${esc(t?.date||'')} — Pix ${fmt(t?.amount)} — vinculado ${fmt(a.amount)} <button type="button" data-remove="${esc(a.id)}">Desvincular</button></p>`}).join('')}${history.map(a=>`<p>Crédito de rifa: ${fmt(a.amount)}</p>`).join('')}<select id="mc-pix"><option value="">Escolher Pix</option>${tx.map(t=>`<option value="${esc(t.id)}">${esc(t.date)} — ${esc(t.description)} — disponível ${fmt(t.available_amount)}</option>`).join('')}</select><button type="button" id="mc-link">${Number(c.manual_paid_amount)>0?'Conciliar baixa manual':'Vincular Pix'}</button>`;
 detail.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('Desvincular sem excluir o Pix? A baixa manual anterior não será restaurada.'))run(()=>chargeRpc('remove_monthly_payment',{p_allocation_id:b.dataset.remove}));});
 $('mc-link').onclick=()=>{const t=tx.find(x=>String(x.id)===$('mc-pix').value);if(!t)return alert('Escolha um Pix.');try{const manual=Number(c.manual_paid_amount);const n=askMoney('Valor a vincular:',manual||Math.min(Number(c.remaining_amount),Number(t.available_amount)));if(n===null||!n)return;if(n>Number(t.available_amount)|| (manual?n!==manual:n>Number(c.remaining_amount)))throw new Error('Valor incompatível com o saldo ou baixa manual.');if(confirm('Confirmar vínculo com este mês?'))run(()=>chargeRpc(manual?'reconcile_manual_payment':'allocate_monthly_payment',{p_transaction_id:t.id,p_monthly_charge_id:c.id,p_amount:n}));}catch(e){alert(e.message);}};
 detail.scrollIntoView({block:'nearest'});
}
$('generate-charges').onclick=async()=>{
 const month=$('charges-month').value;if(!/^\d{4}-\d{2}$/.test(month))return alert('Escolha o mês.');const b=$('generate-charges');b.disabled=true;
 try{const {data:{user}}=await sb.auth.getUser();if(!user)throw new Error('Faça login.');const year=Number(month.slice(0,4)),m=Number(month.slice(5));const [athletes,rules,existing]=await Promise.all([chargeRead(sb.from('athletes').select('*').eq('season',year).eq('user_id',user.id)),chargeRead(sb.from('monthly_fee_rules').select('*').eq('season',year).eq('month',m).eq('user_id',user.id)),chargeRead(sb.from('monthly_charges').select('athlete_id').eq('month',month))]);const known=new Set(existing.map(c=>c.athlete_id));const rows=[],skipped=[];for(const a of athletes){if(known.has(a.id))continue;if(a.joined_on&&a.joined_on.slice(0,7)>month||a.left_on&&a.left_on.slice(0,7)<month)continue;const rule=rules.find(r=>r.team===a.team);if(!a.joined_on||(!a.is_active&&!a.left_on)||!rule){skipped.push(a.name);continue;}const amount=Math.round(Number(rule.amount)*(1-Number(a.scholarship_percentage||0)/100)*100)/100;rows.push({user_id:user.id,athlete_id:a.id,month,amount,status:amount===0?'isento':'pendente'});}if(!confirm(`Criar ${rows.length} cobranças? ${skipped.length} sem datas ou regra serão ignoradas. Cobranças existentes serão preservadas.\n${skipped.join(', ')}`))return;if(rows.length){const {error}=await sb.from('monthly_charges').insert(rows);if(error)throw error;}alert(`${rows.length} cobranças criadas.`);await loadMonthlyCharges();}catch(e){alert(e.message);}finally{b.disabled=false;}
};

async function init() {
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('logout').classList.remove('hidden');
    await load();
    await loadPlanning();
    await loadAthletes();
  }
}

async function load() {
  const { data, error } = await sb
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    $('entry-msg').textContent = error.message;
    return;
  }

  const all = data || [];

const { data: athleteData, error: athleteError } = await sb
  .from('athletes')
  .select('id,name');

if (athleteError) {
  $('entry-msg').textContent = 'Erro ao carregar atletas: ' + athleteError.message;
  return;
}

const athleteMap = Object.fromEntries(
  (athleteData || []).map(a => [a.id, a.name])
);

const month = new Date().toISOString().slice(0, 7);
  const paid = all.filter(x => x.status === 'pago');

  $('balance').textContent = fmt(
    paid.reduce((s, x) => s + (x.type === 'entrada' ? Number(x.amount) : -Number(x.amount)), 0)
  );

  $('income').textContent = fmt(
    paid.filter(x => x.type === 'entrada' && x.date.startsWith(month))
      .reduce((s, x) => s + Number(x.amount), 0)
  );

  $('expense').textContent = fmt(
    paid.filter(x => x.type === 'despesa' && x.date.startsWith(month))
      .reduce((s, x) => s + Number(x.amount), 0)
  );

  $('pending').textContent = fmt(
    all.filter(x => x.status === 'pendente')
      .reduce((s, x) => s + Number(x.amount), 0)
  );

  const reportMonth = $('report-month').value;
  const reportItems = paid.filter(x => x.date.startsWith(reportMonth));

  const reportIncome = reportItems
    .filter(x => x.type === 'entrada')
    .reduce((s, x) => s + Number(x.amount), 0);

  const reportExpense = reportItems
    .filter(x => x.type === 'despesa')
    .reduce((s, x) => s + Number(x.amount), 0);

  $('report-income').textContent = fmt(reportIncome);
  $('report-expense').textContent = fmt(reportExpense);
  $('report-balance').textContent = fmt(reportIncome - reportExpense);

  const categories = {};

  reportItems.filter(x => x.type === 'despesa').forEach(x => {
    const category = x.category || 'Outros';
    categories[category] = (categories[category] || 0) + Number(x.amount);
  });

  const categoryEntries = Object.entries(categories)
    .sort((a, b) => b[1] - a[1]);

  const maxCategory = Math.max(...categoryEntries.map(x => x[1]), 1);

  $('category-report').innerHTML = categoryEntries.length
    ? categoryEntries.map(([name, value]) => `
        <div style="margin:16px 0">
          <div style="display:flex;justify-content:space-between;gap:10px">
            <strong>${esc(name)}</strong>
            <strong>${fmt(value)}</strong>
          </div>
          <div style="background:#eee;border-radius:10px;height:12px;margin-top:7px">
            <div style="background:#315c45;width:${value / maxCategory * 100}%;height:12px;border-radius:10px"></div>
          </div>
        </div>
      `).join('')
    : '<p>Nenhuma despesa neste mês.</p>';

  const f = $('filter').value;
const selectedMonth = $('statement-month').value;

const shown = all.filter(x => {
  const matchesType = f === 'all' || x.type === f || x.status === f;
  const matchesMonth = !selectedMonth || x.date.startsWith(selectedMonth);

  return matchesType && matchesMonth;
});

  $('rows').innerHTML = shown.map(x => `
    <tr>
      <td>${x.date}</td>
      <td>${esc(x.description)}${x.payer ? `<div class="muted">${esc(x.payer)}</div>` : ''}</td>
<td>${x.athlete_id && athleteMap[x.athlete_id] ? esc(athleteMap[x.athlete_id]) : '—'}</td>
<td>${esc(x.category || '—')}</td>
      <td><span class="tag">${x.status}</span></td>
      <td class="${x.type === 'entrada' ? 'positive' : 'negative'}">${x.type === 'entrada' ? '+' : '−'} ${fmt(x.amount)}</td>
      <td>
        <button class="edit" data-id="${x.id}">Editar</button>
        <button class="delete" data-id="${x.id}" aria-label="Excluir">×</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit').forEach(b => b.onclick = async () => {
    const x = shown.find(t => String(t.id) === b.dataset.id);
    if (!x) return;
    await loadAthletes();

    editingId = x.id;
    $('kind').value = x.type;
    $('description').value = x.description;
    $('amount').value = x.amount;
    $('date').value = x.date;
    $('category').value = x.category || '';
    $('status').value = x.status;
    $('payer').value = x.payer || '';
    $('athlete-link').value = x.athlete_id || '';
    $('entry-msg').textContent = 'Editando lançamento...';
  });

  document.querySelectorAll('.delete').forEach(b => b.onclick = async () => {
    if (confirm('Excluir este lançamento?')) {
      const { error } = await sb.from('transactions').delete().eq('id', b.dataset.id);
      if (error) alert(error.message);
      else await load();
    }
  });
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

    button.classList.add('active');
    $(button.dataset.tab).classList.remove('hidden');

    if (button.dataset.tab === 'extras') await loadExtras();
    if (button.dataset.tab === 'controle-pagamentos') {
      await loadMonthlyCharges();
    }
  });
});
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

init();

$('import-bank').addEventListener('click', async () => {
  const file = $('bank-file').files[0];
  const msg = $('import-msg');
  const button = $('import-bank');

  if (!file) {
    msg.textContent = 'Selecione um arquivo CSV primeiro.';
    return;
  }

  button.disabled = true;
  msg.textContent = 'Lendo extrato...';

  try {
    const { data: { user }, error: userError } = await sb.auth.getUser();

    if (userError || !user) {
      throw new Error('Faça login novamente.');
    }

    const text = (await file.text()).replace(/^\uFEFF/, '');

function parseCSV(content) {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);

  // Localiza o cabeçalho, mesmo depois das informações do banco
  const headerIndex = lines.findIndex(line => {
    const h = line.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return h.includes('data lancamento') &&
           h.includes('entrada') &&
           h.includes('saida');
  });

  if (headerIndex === -1) {
    throw new Error('Não encontrei o cabeçalho do extrato C6.');
  }

  const headerLine = lines[headerIndex];
  const delimiter = headerLine.includes(';') ? ';' : ',';

  function splitLine(line) {
    const result = [];
    let value = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];

      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c === delimiter && !quoted) {
        result.push(value.trim());
        value = '';
      } else {
        value += c;
      }
    }

    result.push(value.trim());
    return result;
  }

  return lines
    .slice(headerIndex)
    .filter(line => line.trim())
    .map(splitLine);
}


    function normalize(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    }

    function money(value) {
      let v = String(value || '')
        .replace(/R\$/gi, '')
        .replace(/\s/g, '')
        .trim();

      if (!v || v === '-') return 0;

      if (v.includes(',')) {
        v = v.replace(/\./g, '').replace(',', '.');
      }

      const result = Number(v);
      return Number.isFinite(result) ? Math.abs(result) : 0;
    }

    function dateISO(value) {
      const v = String(value || '').trim();

      if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
        return v.slice(0, 10);
      }

      const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

      if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }

      return '';
    }

    
const rows = parseCSV(text);


if (rows.length < 2) {
  throw new Error('O arquivo não possui movimentações.');
}

const headerIndex = rows.findIndex(row => {
  const cells = row.map(normalize).join('|');

  return cells.includes('datalancamento') &&
         cells.includes('entrada') &&
         cells.includes('saida');
});

if (headerIndex === -1) {
  throw new Error(
    'Cabeçalho não localizado. Colunas encontradas: ' +
    rows.slice(0, 5).map(r => r.join(' / ')).join(' | ')
  );
}

const headers = rows[headerIndex].map(normalize);
rows.splice(0, headerIndex + 1);


    const findColumn = (...names) =>
      headers.findIndex(h => names.some(n => h.includes(n)));

    const dateCol = findColumn('datalancamento');
    const titleCol = findColumn('titulo');
    const descCol = findColumn('descricao');
    const entryCol = findColumn('entrada');
    const expenseCol = findColumn('saida');

    if ([dateCol, entryCol, expenseCol].includes(-1)) {
      throw new Error('Não reconheci as colunas do C6. Confira se o arquivo é CSV.');
    }

    const { data: existing, error: readError } = await sb
      .from('transactions')
      .select('date,type,description,amount');

    if (readError) throw readError;

    const makeKey = x => [
      x.date,
      x.type,
      Number(x.amount).toFixed(2),
      normalize(x.description)
    ].join('|');

    const known = new Set((existing || []).map(makeKey));
    const imported = [];

    for (const row of rows) {
      const date = dateISO(row[dateCol]);
      if (!date) continue;

      const title = titleCol >= 0 ? row[titleCol] : '';
      const detail = descCol >= 0 ? row[descCol] : '';

      const description = [title, detail]
        .filter(Boolean)
        .join(' - ') || 'Movimentação C6';

      const entry = money(row[entryCol]);
      const expense = money(row[expenseCol]);

      const movements = [];

      if (entry > 0) {
        movements.push({ type: 'entrada', amount: entry });
      }

      if (expense > 0) {
        movements.push({ type: 'despesa', amount: expense });
      }

      for (const movement of movements) {
        const item = {
          user_id: user.id,
          type: movement.type,
          description,
          amount: movement.amount,
          date,
          category: 'Outros',
          status: 'pago',
          payer: null
        };

        const key = makeKey(item);

        if (!known.has(key)) {
          imported.push(item);
          known.add(key);
        }
      }
    }

    if (!imported.length) {
      msg.textContent = 'Nenhuma movimentação nova encontrada. Talvez já tenham sido importadas.';
      return;
    }

    const { error: insertError } = await sb
      .from('transactions')
      .insert(imported);

    if (insertError) throw insertError;

    msg.textContent =
      `${imported.length} movimentação(ões) importada(s) com sucesso!`;

    $('bank-file').value = '';

    await load();

  } catch (err) {
    msg.textContent = 'Erro na importação: ' + err.message;
  } finally {
    button.disabled = false;
  }
});

// CADASTRO DE ATLETAS

$('athlete-form').addEventListener('submit', async e => {
  e.preventDefault();

  $('athlete-msg').textContent = 'Salvando atleta...';

  const { data: { user }, error: userError } = await sb.auth.getUser();

  if (userError || !user) {
    $('athlete-msg').textContent = 'Faça login novamente.';
    return;
  }

  const payload = {
    user_id: user.id,
    name: $('athlete-name').value.trim(),
    team: $('athlete-team').value.trim() || null,
    scholarship_percentage: Number($('athlete-scholarship').value),
    season: Number($('athlete-season').value),
    is_active: true,
    joined_on: $('athlete-joined').value || null
  };

  const { error } = await sb
    .from('athletes')
    .insert(payload);

  if (error) {
    $('athlete-msg').textContent = 'Erro: ' + error.message;
    return;
  }

  $('athlete-msg').textContent = 'Atleta cadastrada com sucesso!';

  e.target.reset();
  $('athlete-scholarship').value = 0;
  $('athlete-season').value = 2026;

  await loadAthletes();
});

async function loadAthletes() {
  const { data, error } = await sb
    .from('athletes')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    $('athlete-list').textContent = 'Erro: ' + error.message;
    return;
  }

  const athletes = data || [];
  const select = $('athlete-link');

  select.innerHTML = '<option value="">Nenhuma atleta vinculada</option>';

  athletes
    .filter(a => a.is_active)
    .forEach(a => {
      select.innerHTML += `
        <option value="${a.id}">${esc(a.name)}</option>
      `;
    });

  $('athlete-list').innerHTML = athletes.length
    ? athletes.map(a => `
        <div style="padding:12px 0;border-bottom:1px solid #ddd">
          <button
            type="button"
            class="athlete-profile-btn"
            data-id="${a.id}"
            style="background:none;border:none;padding:0;color:inherit;font-weight:bold;cursor:pointer"
          >
            ${esc(a.name)}
          </button>

          <button
            type="button"
            class="edit-athlete-btn secondary"
            data-id="${a.id}"
            style="margin-left:10px"
          >
            Editar
          </button>

          <p class="muted">
            Equipe: ${esc(a.team || 'Não informada')} |
            Bolsa: ${a.scholarship_percentage}% |
            Temporada: ${a.season}
          </p>
        </div>
      `).join('')
    : '<p>Nenhuma atleta cadastrada ainda.</p>';

  document.querySelectorAll('.athlete-profile-btn').forEach(button => {
    button.onclick = () => openAthleteFinancial(button.dataset.id);
  });

  document.querySelectorAll('.edit-athlete-btn').forEach(button => {
    button.onclick = async () => {
      const athlete = athletes.find(a => String(a.id) === button.dataset.id);

      if (!athlete) return;

      const newName = prompt('Nome da atleta:', athlete.name);
      if (newName === null) return;

      const newTeam = prompt('Equipe:', athlete.team || '');
      if (newTeam === null) return;

      const newScholarship = prompt(
        'Bolsa (%):',
        athlete.scholarship_percentage
      );
      if (newScholarship === null) return;

      const newSeason = prompt('Temporada:', athlete.season);
      if (newSeason === null) return;

      if (!newName.trim()) {
        alert('O nome não pode ficar vazio.');
        return;
      }

      const joined = prompt('Data de entrada (AAAA-MM-DD; vazio se desconhecida):', athlete.joined_on || '');
      if (joined === null) return;
      const left = prompt('Data de saída (AAAA-MM-DD; vazio se não saiu):', athlete.left_on || '');
      if (left === null) return;
      if ([joined,left].some(d=>d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) || (joined && left && left < joined)) return alert('Datas inválidas.');
      const scholarship = Number(newScholarship);
      const season = Number(newSeason);

      if (
        isNaN(scholarship) ||
        scholarship < 0 ||
        scholarship > 100
      ) {
        alert('A bolsa precisa ser um número entre 0 e 100.');
        return;
      }

      if (isNaN(season)) {
        alert('A temporada precisa ser um número válido.');
        return;
      }

      const { error: updateError } = await sb
        .from('athletes')
        .update({
          name: newName.trim(),
          team: newTeam.trim() || null,
          scholarship_percentage: scholarship,
          season: season,
          joined_on: joined || null,
          left_on: left || null,
          is_active: left ? false : athlete.is_active
        })
        .eq('id', athlete.id);

      if (updateError) {
        alert('Erro ao editar atleta: ' + updateError.message);
        return;
      }

      alert('Atleta atualizada com sucesso!');
      await loadAthletes();
    };
  });

  await loadAthleteTransactions();
}
async function loadAthleteTransactions() {
  const container = $('athlete-transactions-list');

  container.innerHTML = '<p>Carregando movimentações...</p>';

  const { data: athletes, error: athleteError } = await sb
    .from('athletes')
    .select('*')
    .order('name', { ascending: true });

  if (athleteError) {
    container.innerHTML = 'Erro ao carregar atletas: ' + esc(athleteError.message);
    return;
  }

  const { data: transactions, error } = await sb
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    container.innerHTML = 'Erro ao carregar movimentações: ' + esc(error.message);
    return;
  }

  const all = transactions || [];

  
function renderTable(items, allowLink = false) {
  if (!items.length) return '<p>Nenhuma movimentação cadastrada.</p>';

  function suggestAthlete(transaction) {
    const description = (transaction.description || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (athletes || []).find(athlete => {
      const nameParts = (athlete.name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      return nameParts.length >= 2 &&
        nameParts.every(part => description.includes(part));
    });
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${allowLink ? '<th>Selecionar</th>' : ''}
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Status</th>
            <th>Valor</th>
            ${allowLink ? '<th>Atleta sugerida / escolha</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${items.map(x => {
            const suggested = allowLink ? suggestAthlete(x) : null;

            return `
              <tr>
                ${allowLink ? `
                  <td>
                    <input type="checkbox"
                      class="bulk-transaction-check"
                      data-id="${x.id}">
                  </td>
                ` : ''}
                <td>${esc(x.date)}</td>
                <td>${esc(x.description)}</td>
                <td>${esc(x.category || '—')}</td>
                <td>${esc(x.status)}</td>
                <td>${x.type === 'entrada' ? '+' : '−'} ${fmt(x.amount)}</td>
                ${allowLink ? `
                  <td>
                    <select class="link-athlete-select" data-id="${x.id}">
                      <option value="">Escolher atleta</option>
                      ${(athletes || []).map(a => `
                        <option value="${a.id}"
                          ${suggested && String(suggested.id) === String(a.id) ? 'selected' : ''}>
                          ${esc(a.name)}
                        </option>
                      `).join('')}
                    </select>
                    ${suggested ? '<small>Sugestão automática</small>' : ''}
                  </td>
                ` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}
  const bulkButton = `
    <div style="margin:16px 0">
      <button type="button" id="bulk-link-athletes">
        Vincular movimentações selecionadas
      </button>
    </div>
  `;
  container.innerHTML = `
    ${(athletes || []).map(athlete => {
      const items = all.filter(x => String(x.athlete_id) === String(athlete.id));

      return `
        <div style="margin:24px 0">
          <h3>${esc(athlete.name)}</h3>
          <p class="muted">${items.length} movimentação(ões)</p>
          ${renderTable(items)}
        </div>
      `;
    }).join('')}

    <div style="margin:24px 0">
      <h3>Sem atleta vinculada</h3>
            ${bulkButton}
      <p class="muted">Movimentações que ainda precisam ser organizadas.</p>
      ${renderTable(all.filter(x => !x.athlete_id), true)}
    </div>
  `;
    const bulkLinkButton = $('bulk-link-athletes');

  if (bulkLinkButton) {
    bulkLinkButton.addEventListener('click', async () => {
      const selected = [...container.querySelectorAll('.bulk-transaction-check:checked')];

      if (!selected.length) {
        alert('Selecione pelo menos uma movimentação.');
        return;
      }

      const updates = selected.map(check => {
        const id = check.dataset.id;
        const select = container.querySelector(
          `.link-athlete-select[data-id="${id}"]`
        );

        return {
          id,
          athleteId: select.value
        };
      });

      if (updates.some(item => !item.athleteId)) {
        alert('Escolha uma atleta para todas as movimentações selecionadas.');
        return;
      }

      if (!confirm(`Vincular ${updates.length} movimentação(ões) às atletas selecionadas?`)) {
        return;
      }

      bulkLinkButton.disabled = true;
      bulkLinkButton.textContent = 'Salvando...';

      for (const item of updates) {
        const { error } = await sb
          .from('transactions')
          .update({ athlete_id: item.athleteId })
          .eq('id', item.id);

        if (error) {
          alert('Erro ao vincular: ' + error.message);
          bulkLinkButton.disabled = false;
          bulkLinkButton.textContent = 'Vincular movimentações selecionadas';
          return;
        }
      }

      alert('Movimentações vinculadas com sucesso!');
      await loadAthleteTransactions();
      await load();
    });
  }
}
async function openAthleteFinancial(athleteId) {
  const panel = $('athlete-financial');
  const content = $('athlete-financial-content');

  panel.classList.remove('hidden');
  content.innerHTML = '<p>Carregando perfil financeiro...</p>';

  const { data: athlete, error: athleteError } = await sb
    .from('athletes')
    .select('*')
    .eq('id', athleteId)
    .single();

  if (athleteError) {
    content.innerHTML = 'Erro ao carregar atleta: ' + esc(athleteError.message);
    return;
  }

  const { data: transactions, error } = await sb
    .from('transactions')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('date', { ascending: false });

  if (error) {
    content.innerHTML = 'Erro ao carregar lançamentos: ' + esc(error.message);
    return;
  }

  const items = transactions || [];

  const paid = items.filter(x => x.status === 'pago' && x.type === 'entrada');
  const pending = items.filter(x => x.status === 'pendente' && x.type === 'entrada');

  const totalPaid = paid.reduce((s, x) => s + Number(x.amount), 0);
  const totalPending = pending.reduce((s, x) => s + Number(x.amount), 0);

  content.innerHTML = `
    <button type="button" id="close-athlete-profile" class="secondary">
      Fechar perfil
    </button>

    <h3>${esc(athlete.name)}</h3>

    <p class="muted">
      Equipe: ${esc(athlete.team || 'Não informada')} |
      Bolsa: ${athlete.scholarship_percentage}% |
      Temporada: ${athlete.season}
    </p>

    <div class="cards">
      <article class="card">
        <span>Total pago</span>
        <strong>${fmt(totalPaid)}</strong>
      </article>

      <article class="card">
        <span>Pendente</span>
        <strong>${fmt(totalPending)}</strong>
      </article>
    </div>

    <h3>Histórico financeiro</h3>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Status</th>
            <th>Valor</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          ${items.map(x => `
            <tr>
              <td>${esc(x.date)}</td>
              <td>${esc(x.description)}</td>
              <td>${esc(x.category || '—')}</td>
                           <td>${esc(x.status)}</td>
              <td>${x.type === 'entrada' ? '+' : '−'} ${fmt(x.amount)}</td>
              <td>
                <button class="athlete-delete" data-id="${x.id}" type="button">Excluir</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${items.length ? '' : '<p>Nenhum lançamento vinculado a esta atleta ainda.</p>'}
  `;

    document.querySelectorAll('.athlete-delete').forEach(button => {
    button.onclick = async () => {
      if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;

      const { error } = await sb
        .from('transactions')
        .delete()
        .eq('id', button.dataset.id);

      if (error) {
        alert('Erro ao excluir: ' + error.message);
        return;
      }

      await load();
      await openAthleteFinancial(athleteId);
    };
  });

  $('close-athlete-profile').onclick = () => {
    panel.classList.add('hidden');
  };
}


// REVISÃO DE SUGESTÕES PARA MOVIMENTAÇÕES JÁ CADASTRADAS
$('load-transaction-suggestions').addEventListener('click', loadTransactionSuggestions);

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function suggestTransactionCategory(tx) {
  const text = normalizeText((tx.description || '') + ' ' + (tx.payer || ''));
  if (tx.type === 'entrada') {
    if (/\bmensal(?:idade|idades)?\b/.test(text)) return 'Mensalidade';
    if (/\brifa\b/.test(text)) return 'Rifa';
    if (/tryout|seletiva/.test(text)) return 'Seletiva';
    if (/campeon|compet/.test(text)) return 'Inscrição do Campeonato';
    if (/patrocin|sponsor|apoio/.test(text)) return 'Patrocínio';
    if (/uniform|bow|cheermix|cheer mix/.test(text)) return 'Uniforme';
    if (/reembolso/.test(text)) return 'Reembolso';
    return null;
  }
  if (/uniform|bow|cheermix|cheer mix|camis|top|short/.test(text)) return 'Uniforme';
  if (/transporte|uber|99|passagem|combust|estacion/.test(text)) return 'Transporte';
  if (/material|papel|impress| fita|cola|cartaz/.test(text)) return 'Materiais';
  if (/campeon|compet|inscri/.test(text)) return 'Inscrição do Campeonato';
  if (/aliment|comida|lanche|restaurante/.test(text)) return 'Alimentação';
  if (/showcase|evento/.test(text)) return 'Evento / Showcase';
  if (/reembolso/.test(text)) return 'Reembolso';
  return null;
}

function suggestTransactionAthlete(tx, athletes) {
  const text = normalizeText((tx.description || '') + ' ' + (tx.payer || ''));
  return athletes.find(a => {
    const name = normalizeText(a.name).trim();
    return name && text.includes(name);
  }) || null;
}

async function loadTransactionSuggestions() {
  const button = $('load-transaction-suggestions');
  const msg = $('suggestions-msg');
  const container = $('transaction-suggestions');
  button.disabled = true; button.textContent = 'Analisando...';
  msg.textContent = 'Buscando movimentações e padrões...';
  try {
    const [{ data: transactions, error: txError }, { data: athletes, error: athleteError }] = await Promise.all([
      sb.from('transactions').select('*').order('date', { ascending: false }),
      sb.from('athletes').select('id,name')
    ]);
    if (txError) throw txError; if (athleteError) throw athleteError;
    const suggestions = (transactions || []).map(tx => {
      const category = suggestTransactionCategory(tx);
      const athlete = !tx.athlete_id ? suggestTransactionAthlete(tx, athletes || []) : null;
      return { tx, category: category && category !== tx.category ? category : null, athlete };
    }).filter(s => s.category || s.athlete);
    if (!suggestions.length) { container.innerHTML = '<p>Não encontrei sugestões confiáveis por descrição/nome. Movimentações não foram alteradas.</p>'; msg.textContent = 'Análise concluída.'; return; }
    container.innerHTML = `<p><strong>${suggestions.length}</strong> movimentação(ões) com sugestão. Marque as que deseja aplicar.</p><div class="table-wrap"><table><thead><tr><th>Aplicar</th><th>Data</th><th>Descrição / pagador</th><th>Valor</th><th>Categoria sugerida</th><th>Atleta sugerida</th></tr></thead><tbody>${suggestions.map(s => `<tr><td><input type="checkbox" class="suggestion-check" data-id="${s.tx.id}"></td><td>${esc(s.tx.date)}</td><td>${esc(s.tx.description)}${s.tx.payer ? '<small>'+esc(s.tx.payer)+'</small>' : ''}</td><td>${fmt(s.tx.amount)}</td><td>${s.category ? esc(s.category) : '—'}</td><td>${s.athlete ? esc(s.athlete.name) : '—'}</td></tr>`).join('')}</tbody></table></div><button type="button" id="apply-transaction-suggestions">Aplicar sugestões selecionadas</button>`;
    $('apply-transaction-suggestions').addEventListener('click', async () => {
      const selected = [...container.querySelectorAll('.suggestion-check:checked')].map(c => suggestions.find(s => String(s.tx.id) === c.dataset.id)).filter(Boolean);
      if (!selected.length) { alert('Marque pelo menos uma movimentação.'); return; }
      if (!confirm(`Aplicar sugestões em ${selected.length} movimentação(ões)?`)) return;
      const applyButton = $('apply-transaction-suggestions'); applyButton.disabled = true; applyButton.textContent = 'Salvando...';
      for (const s of selected) {
        const update = {}; if (s.category) update.category = s.category; if (s.athlete) update.athlete_id = s.athlete.id;
        const { error } = await sb.from('transactions').update(update).eq('id', s.tx.id);
        if (error) { alert('Erro ao salvar: ' + error.message); applyButton.disabled = false; applyButton.textContent = 'Aplicar sugestões selecionadas'; return; }
      }
      alert('Sugestões aplicadas!'); await load(); await loadTransactionSuggestions();
    });
    msg.textContent = 'Análise concluída. Confira antes de aplicar.';
  } catch (error) {
    msg.textContent = 'Erro ao analisar: ' + error.message;
  } finally { button.disabled = false; button.textContent = 'Analisar movimentações existentes'; }
}

// Classificação em massa: categoria e atleta, sem alterar valores.
if ($('bulk-load')) {
  const options = [...$('category').options].map(o => o.value);
  $('bulk-category').innerHTML = '<option value="">Manter categoria atual</option>' + options.map(c => `<option>${esc(c)}</option>`).join('');
  $('bulk-current').innerHTML += [...new Set([...options, 'Arrecadação', 'Inscrição'])].map(c => `<option>${esc(c)}</option>`).join('');
  $('bulk-load').onclick = async () => {
    const out = $('bulk-results');
    out.textContent = 'Carregando...';
    try {
      const month = $('bulk-month').value;
      const amount = $('bulk-amount').value;
      const category = $('bulk-current').value;
      const search = normalizeText($('bulk-search').value).trim();
      const {data: athletes,error: athleteError} = await sb.from('athletes').select('id,name').order('name');
      if(athleteError) throw athleteError;
      const athleteOptions = (x) => {
        const text = normalizeText([x.description,x.payer].join(' '));
        const matches = (athletes || []).filter(a => normalizeText(a.name).trim().split(/\s+/).length >= 2 && text.includes(normalizeText(a.name).trim()));
        const suggested = !x.athlete_id && matches.length === 1 ? matches[0] : null;
        return `<select class="bulk-athlete-choice"><option value="">Manter vínculo atual</option>${(athletes || []).map(a=>`<option value="${esc(a.id)}" ${suggested && String(suggested.id)===String(a.id)?'selected':''}>${esc(a.name)}</option>`).join('')}</select>${suggested?'<small>Sugestão pelo nome: confira</small>':''}`;
      };
      let items = [];
      for (let offset = 0; ; offset += 500) {
        let q = sb.from('transactions').select('id,date,type,description,payer,amount,category,athlete_id,athletes(name)').order('date', {ascending:false}).order('id').range(offset, offset+499);
        if (month) {
          const [y,m] = month.split('-').map(Number);
          const next = `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01`;
          q = q.gte('date', month+'-01').lt('date',next);
        }
        if (amount !== '') q = q.eq('amount', Number(amount));
        if (category) q = q.eq('category',category);
        const {data,error} = await q;
        if(error) throw error;
        items.push(...data);
        if(data.length<500) break;
      }
      items = items.filter(x => !search || normalizeText([x.description,x.payer,x.athletes?.name].join(' ')).includes(search));
      if(!items.length){out.textContent='Nenhuma movimentação encontrada.';return;}
      out.innerHTML = `<p>${items.length} movimentações encontradas.</p><label><input type="checkbox" id="bulk-all"> Selecionar todas</label><div class="table-wrap"><table><thead><tr><th></th><th>Data</th><th>Descrição / atleta</th><th>Categoria</th><th>Valor</th><th>Vincular atleta</th></tr></thead><tbody>${items.map(x=>`<tr><td><input type="checkbox" class="bulk-cat-check" data-id="${esc(x.id)}"></td><td>${esc(x.date)}</td><td>${esc(x.description)}<br>${esc(x.athletes?.name || x.payer || '')}</td><td>${esc(x.category || '—')}</td><td>${x.type==='entrada'?'+':'−'} ${fmt(x.amount)}</td><td>${athleteOptions(x)}</td></tr>`).join('')}</tbody></table></div><button type="button" id="bulk-save">Salvar categoria e/ou atleta</button>`;
      $('bulk-all').onchange = () => out.querySelectorAll('.bulk-cat-check').forEach(c=>c.checked=$('bulk-all').checked);
      $('bulk-save').onclick = async () => {
        const cat = $('bulk-category').value;
        const updates = [...out.querySelectorAll('.bulk-cat-check:checked')].map(c=>{
          const tx = items.find(x=>String(x.id)===c.dataset.id);
          const athlete = c.closest('tr').querySelector('.bulk-athlete-choice').value;
          const payload = {};
          if(cat && cat!==tx.category) payload.category=cat;
          if(athlete && athlete!==String(tx.athlete_id)) payload.athlete_id=athlete;
          return {tx,payload};
        }).filter(x=>Object.keys(x.payload).length);
        if(!updates.length){alert('Selecione movimentações e escolha uma categoria ou atleta diferente.');return;}
        if(updates.some(x=>x.payload.category==='Mensalidade' && x.tx.type!=='entrada')){alert('Mensalidade deve ser uma entrada.');return;}
        if(!confirm(`Salvar alterações em ${updates.length} movimentações? Confira as atletas sugeridas antes de confirmar.`))return;
        $('bulk-save').disabled=true;
        $('bulk-load').disabled=true;
        let done=0;
        try {
          for(const x of updates){
            const {data,error}=await sb.from('transactions').update(x.payload).eq('id',x.tx.id).select('id');
            if(error)throw error;
            if(!data || data.length!==1)throw new Error('Não foi possível confirmar a atualização de uma movimentação.');
            done++;
          }
          alert(`${done} de ${updates.length} movimentações atualizadas.`);
        }catch(e){alert(`${done} atualizadas antes do erro: ${e.message}`);}
        finally {$('bulk-load').disabled=false;}
        await loadAthleteTransactions();
        await load();
        await $('bulk-load').onclick();
      };
    }catch(e){out.textContent='Erro: '+e.message;}
  };
}

// Cobranças extras — interface independente do extrato.
let extraBusy=false;
async function extraRun(fn){if(extraBusy)return;extraBusy=true;try{await fn();await loadExtras();}catch(e){alert(e.message||String(e));}finally{extraBusy=false;}}
async function loadExtras(){
 const out=$('ex-list');out.textContent='Carregando...';$('ex-detail').textContent='';$('ex-summary').textContent='';
 try{
 const year=Number($('ex-year').value);const [rows,athletes]=await Promise.all([chargeRead(sb.from('extra_charge_review_balances').select('*').eq('season',year)),chargeRead(sb.from('athletes').select('id,name,team'))]);
 const names=new Map(athletes.map(a=>[a.id,a.name]));const cat=$('ex-cat').value;$('ex-cat').innerHTML='<option value="">Todas</option>'+[...new Set(rows.map(c=>c.category))].sort().map(c=>`<option>${esc(c)}</option>`).join('');$('ex-cat').value=cat;
 const shown=rows.filter(c=>(!cat||c.category===cat)&&(!$('ex-review').checked||c.review_pending)&&normalizeText(names.get(c.athlete_id)).includes(normalizeText($('ex-search').value))).sort((a,b)=>(names.get(a.athlete_id)||'').localeCompare(names.get(b.athlete_id)||'','pt-BR'));
 $('ex-summary').innerHTML=[['Cobrado',shown.reduce((s,c)=>s+Number(c.amount),0)],['Pago',shown.reduce((s,c)=>s+Number(c.total_paid),0)],['Custeado pelo caixa',shown.filter(c=>c.covered_by_cash).reduce((s,c)=>s+Number(c.amount),0)],['Em aberto / a conferir',shown.reduce((s,c)=>s+Number(c.remaining_amount),0)]].map(([l,v])=>`<article class="card"><span>${l}</span><strong>${fmt(v)}</strong></article>`).join('');
 out.innerHTML=`<p>${shown.length} cobranças • ${shown.filter(c=>c.review_pending).length} a revisar</p><div class="table-wrap"><table><thead><tr><th>Atleta</th><th>Cobrança</th><th>Valor</th><th>Pix</th><th>Manual</th><th>Rifa</th><th>Em aberto</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${shown.map(c=>`<tr><td>${esc(names.get(c.athlete_id)||'Atleta')}</td><td>${esc(c.category)} (${c.installment}/${c.total_installments})</td><td>${fmt(c.amount)}</td><td>${fmt(c.linked_paid_amount)}</td><td>${fmt(c.manual_paid_amount)}</td><td>${fmt(c.raffle_paid_amount)}</td><td>${fmt(c.remaining_amount)}</td><td>${c.covered_by_cash?'Custeado pelo caixa':Number(c.remaining_amount)===0?'Pago':Number(c.total_paid)>0?'Parcial':'Pendente'}<br>${c.review_pending?'A revisar':'Revisado'}<br>${esc(c.settlement_notes||'')}</td><td><button type="button" data-ex="${esc(c.id)}">Gerenciar</button></td></tr>`).join('')}</tbody></table></div>`;
 out.querySelectorAll('[data-ex]').forEach(b=>b.onclick=()=>showExtra(shown.find(c=>c.id===b.dataset.ex),names).catch(e=>alert(e.message)));
 }catch(e){out.textContent='Erro: '+e.message;}
}
async function showExtra(c,names){
 const d=$('ex-detail');d.textContent='Carregando...';
 const [tx,alloc,credits,ra]=await Promise.all([chargeRead(sb.from('transaction_payment_balances').select('*').eq('user_id',c.user_id).gt('available_amount',0).order('date',{ascending:false})),chargeRead(sb.from('extra_payment_allocations').select('*').eq('extra_charge_id',c.id)),chargeRead(sb.from('raffle_credit_review_balances').select('*').eq('athlete_id',c.athlete_id).eq('season',c.season).gt('usable_credit',0)),chargeRead(sb.from('raffle_credit_allocations').select('*').eq('extra_charge_id',c.id))]);
 const linked=alloc.length?await chargeRead(sb.from('transactions').select('id,date,amount').in('id',alloc.map(a=>a.transaction_id))):[];
 d.innerHTML=`<h3>${esc(names.get(c.athlete_id))} — ${esc(c.description)}</h3><p>Em aberto: ${fmt(c.remaining_amount)} | Manual: ${fmt(c.manual_paid_amount)}</p><button id="ex-manual" type="button">Baixa manual</button> <button id="ex-cash" type="button">${c.covered_by_cash?'Retirar custeio':'Custear pelo caixa'}</button> <button id="ex-mark" type="button">${c.review_pending?'Confirmar revisão':'Reabrir revisão'}</button><h4>Vínculos existentes</h4>${alloc.map(a=>{const t=linked.find(x=>String(x.id)===String(a.transaction_id));return `<p>${esc(t?.date||'')} — Pix ${fmt(t?.amount)} — vinculado ${fmt(a.amount)} <button data-unpix="${esc(a.id)}" type="button">Desvincular</button></p>`}).join('')}${ra.map(a=>`<p>Rifa ${fmt(a.amount)} <button data-unrifa="${esc(a.id)}" type="button">Desvincular</button></p>`).join('')}<h4>Vincular Pix</h4><select id="ex-pix"><option value="">Escolher Pix</option>${tx.filter(t=>!['Rifa','Arrecadação'].includes(t.category)).sort((a,b)=>Number(b.athlete_id===c.athlete_id)-Number(a.athlete_id===c.athlete_id)).map(t=>`<option value="${esc(t.id)}">${esc(t.date)} — ${esc(t.description)} — ${fmt(t.available_amount)} disponível</option>`).join('')}</select><button id="ex-link" type="button">Vincular ao saldo em aberto</button> <button id="ex-reconcile" type="button">Substituir baixa manual</button><h4>Crédito de rifa liberado</h4><select id="ex-credit"><option value="">Escolher crédito</option>${credits.map(r=>`<option value="${esc(r.id)}">${esc(r.description)} — ${fmt(r.usable_credit)}</option>`).join('')}</select><button id="ex-use" type="button">Utilizar crédito</button>`;
 const act=fn=>()=>extraRun(fn);const args={p_extra_charge_id:c.id};
 $('ex-manual').onclick=act(async()=>{const n=askMoney('Total manual (0 para desfazer):',c.manual_paid_amount);if(n!==null)await chargeRpc('set_manual_extra_payment',{...args,p_amount:n});});
 $('ex-cash').onclick=act(async()=>{const notes=prompt('Motivo / observação:',c.settlement_notes||'');if(notes!==null&&confirm('Confirmar alteração de custeio?'))await chargeRpc('set_extra_cash_coverage',{...args,p_covered_by_cash:!c.covered_by_cash,p_notes:notes});});
 $('ex-mark').onclick=act(async()=>{const notes=prompt('Observação da revisão:',c.settlement_notes||'');if(notes!==null)await chargeRpc('set_extra_review',{...args,p_review_pending:!c.review_pending,p_notes:notes});});
 for(const [id,manual] of [['ex-link',false],['ex-reconcile',true]])$(id).onclick=act(async()=>{const t=tx.find(t=>String(t.id)===$('ex-pix').value);if(!t)throw new Error('Escolha um Pix.');const max=Math.min(Number(t.available_amount),Number(manual?c.manual_paid_amount:c.remaining_amount));const n=askMoney('Valor:',max);if(n===null)return;if(n<=0||n>max)throw new Error('Valor acima do saldo.');if(confirm('Confirmar vínculo? Confira a atleta e a origem do Pix.'))await chargeRpc(manual?'reconcile_manual_extra_payment':'allocate_extra_payment',{...args,p_transaction_id:t.id,p_amount:n});});
 $('ex-use').onclick=act(async()=>{const r=credits.find(r=>r.id===$('ex-credit').value);if(!r)throw new Error('Escolha um crédito liberado.');const max=Math.min(Number(r.usable_credit),Number(c.remaining_amount));const n=askMoney('Valor:',max);if(n===null)return;if(n<=0||n>max)throw new Error('Valor inválido.');if(confirm('Utilizar crédito?'))await chargeRpc('allocate_raffle_credit',{...args,p_raffle_credit_id:r.id,p_amount:n});});
 d.querySelectorAll('[data-unpix]').forEach(b=>b.onclick=act(async()=>{if(confirm('Desvincular Pix? A baixa manual anterior não será restaurada.'))await chargeRpc('remove_extra_payment',{p_allocation_id:b.dataset.unpix});}));
 d.querySelectorAll('[data-unrifa]').forEach(b=>b.onclick=act(async()=>{if(confirm('Desvincular crédito?'))await chargeRpc('remove_raffle_credit',{p_allocation_id:b.dataset.unrifa});}));d.scrollIntoView({block:'nearest'});
}
$('ex-refresh').onclick=loadExtras;for(const id of ['ex-year','ex-cat','ex-review','ex-search'])$(id).onchange=loadExtras;

// Rifas e estornos: operações explícitas, sem gerar movimentações bancárias.
let reviewBusy=false;
async function reviewAction(fn,refresh){if(reviewBusy)return;reviewBusy=true;try{await fn();await refresh();}catch(e){alert(e.message||String(e));}finally{reviewBusy=false;}}
async function reviewUser(){const {data,error}=await sb.auth.getUser();if(error||!data.user)throw new Error('Faça login novamente.');return data.user.id;}
async function reviewPages(make){let rows=[];for(let i=0;;i+=500){const page=await chargeRead(make().range(i,i+499));rows.push(...page);if(page.length<500)return rows;}}
async function loadRifas(){const out=$('rf-list');out.textContent='Carregando...';try{const uid=await reviewUser(),year=Number($('rf-year').value),pending=$('rf-pending').checked;
const [credits,receipts,athletes]=await Promise.all([reviewPages(()=>sb.from('raffle_credit_review_balances').select('*').eq('user_id',uid).eq('season',year).order('id')),reviewPages(()=>sb.from('raffle_receipts').select('*').eq('user_id',uid).eq('season',year).order('id')),chargeRead(sb.from('athletes').select('id,name').eq('user_id',uid))]);
const tx=receipts.length?await chargeRead(sb.from('transactions').select('id,date,description,amount').eq('user_id',uid).in('id',receipts.map(r=>r.transaction_id))):[];const names=new Map(athletes.map(a=>[a.id,a.name]));const name=c=>names.get(c.athlete_id)||'Atleta';
out.innerHTML=`<h3>Créditos das atletas</h3><p>Bruto: ${fmt(credits.reduce((s,c)=>s+Number(c.gross_amount),0))} | Disponível após revisão: ${fmt(credits.reduce((s,c)=>s+Number(c.usable_credit),0))}</p><div class="table-wrap"><table><thead><tr><th>Atleta</th><th>Bilhetes</th><th>Líquido</th><th>Usado</th><th>Restante</th><th>Revisão</th></tr></thead><tbody>${credits.filter(c=>!pending||c.review_pending).map(c=>`<tr><td>${esc(name(c))}</td><td>${esc(c.tickets_sold)}</td><td>${fmt(c.net_amount)}</td><td>${fmt(c.used_amount)}</td><td>${fmt(c.available_credit)}</td><td><button type="button" data-rfc="${esc(c.id)}">${c.review_pending?'Confirmar e liberar':'Bloquear novas utilizações'}</button></td></tr>`).join('')}</tbody></table></div><h3>Recebimentos reservados</h3><p>Total: ${fmt(receipts.reduce((s,r)=>s+Number(r.amount),0))}. Associar recebimento não aumenta o crédito da atleta.</p><div class="table-wrap"><table><thead><tr><th>Pix</th><th>Reservado</th><th>Atleta / crédito</th><th>Revisão</th></tr></thead><tbody>${receipts.filter(r=>!pending||r.review_pending).map(r=>{const t=tx.find(t=>String(t.id)===String(r.transaction_id));return `<tr><td>${esc(t?.date||'')} ${esc(t?.description||'Pix #'+r.transaction_id)}</td><td>${fmt(r.amount)}</td><td><select data-rfs="${esc(r.id)}"><option value="">Sem associação</option>${credits.map(c=>`<option value="${esc(c.id)}" ${c.id===r.raffle_credit_id?'selected':''}>${esc(name(c))}</option>`).join('')}</select></td><td>${r.review_pending?'A revisar':'Revisado'}<br><button type="button" data-rfr="${esc(r.id)}">Confirmar</button> <button type="button" data-rfa="${esc(r.id)}">É arrecadação</button></td></tr>`;}).join('')}</tbody></table></div>`;
out.querySelectorAll('[data-rfc]').forEach(b=>b.onclick=()=>reviewAction(async()=>{const c=credits.find(c=>c.id===b.dataset.rfc);if(confirm(c.review_pending?'Confirma o crédito e libera novas utilizações?':'Bloquear novas utilizações sem desfazer as anteriores?'))await chargeRpc('set_raffle_credit_review',{p_raffle_credit_id:c.id,p_review_pending:!c.review_pending});},loadRifas));
out.querySelectorAll('[data-rfr]').forEach(b=>b.onclick=()=>reviewAction(async()=>{const r=receipts.find(r=>r.id===b.dataset.rfr),id=out.querySelector(`[data-rfs="${r.id}"]`).value;const notes=prompt('Observação:',r.notes||'');if(notes!==null)await chargeRpc('review_raffle_receipt',{p_receipt_id:r.id,p_raffle_credit_id:id||null,p_notes:notes});},loadRifas));
out.querySelectorAll('[data-rfa]').forEach(b=>b.onclick=()=>reviewAction(async()=>{const r=receipts.find(r=>r.id===b.dataset.rfa);if(confirm('Reclassificar o Pix inteiro como arrecadação? Não use para Pix misto.')){await chargeRpc('reclassify_raffle_as_fundraising',{p_transaction_id:r.transaction_id});await load();}},loadRifas));
}catch(e){out.textContent='Erro: '+e.message;}}
async function loadEstornos(){const out=$('re-list');out.textContent='Carregando...';try{const uid=await reviewUser();const [incoming,refunds,expenses]=await Promise.all([reviewPages(()=>sb.from('transaction_payment_balances').select('*').eq('user_id',uid).order('id')),reviewPages(()=>sb.from('payment_refunds').select('*').eq('user_id',uid).order('id')),reviewPages(()=>sb.from('transactions').select('id,date,description,amount,type').eq('user_id',uid).eq('status','pago').in('type',['saida','despesa']).order('id'))]);
out.innerHTML=`<h3>Registrar devolução</h3><select id="re-in"><option value="">Escolher recebimento</option>${incoming.filter(t=>Number(t.available_amount)>0).map(t=>`<option value="${esc(t.id)}">${esc(t.date)} — ${esc(t.description)} — disponível ${fmt(t.available_amount)}</option>`).join('')}</select><label>Valor <input id="re-amount" type="number" min="0.01" step="0.01"></label><label>Data (opcional) <input id="re-date" type="date"></label><label>Motivo <input id="re-reason"></label><label>Saída correspondente <select id="re-out"><option value="">Ainda não confirmada</option>${expenses.filter(t=>t.type==='saida').map(t=>`<option value="${esc(t.id)}">${esc(t.date)} — ${esc(t.description)} — ${fmt(t.amount)}</option>`).join('')}</select></label><p>Saídas do tipo despesa não são oferecidas até confirmar compatibilidade com a função de estorno.</p><button id="re-save" type="button">Registrar</button><h3>Devoluções registradas</h3><div class="table-wrap"><table><thead><tr><th>Recebimento</th><th>Valor</th><th>Motivo</th><th>Conferência</th><th>Ação</th></tr></thead><tbody>${refunds.map(r=>{const t=incoming.find(t=>String(t.id)===String(r.transaction_id));return `<tr><td>${esc(t?.description||'Pix #'+r.transaction_id)}</td><td>${fmt(r.amount)}</td><td>${esc(r.reason||'')}</td><td>${r.bank_confirmed?'Saída vinculada':'A conferir'} ${esc(r.refund_date||'')}</td><td><button type="button" data-rer="${esc(r.id)}">Remover registro</button></td></tr>`;}).join('')}</tbody></table></div>`;
$('re-save').onclick=()=>reviewAction(async()=>{const t=incoming.find(t=>String(t.id)===$('re-in').value),n=Number($('re-amount').value);if(!t||!Number.isFinite(n)||n<=0||n>Number(t.available_amount)||Math.abs(n*100-Math.round(n*100))>0.000001)throw new Error('Escolha o Pix e um valor válido dentro do saldo.');if(confirm('Registrar devolução sem criar saída no caixa?'))await chargeRpc('register_payment_refund',{p_transaction_id:t.id,p_amount:n,p_reason:$('re-reason').value||null,p_refund_date:$('re-date').value||null,p_refund_transaction_id:$('re-out').value||null});},loadEstornos);
out.querySelectorAll('[data-rer]').forEach(b=>b.onclick=()=>reviewAction(async()=>{if(confirm('Remover somente o registro de devolução? O saldo disponível do Pix será liberado.'))await chargeRpc('remove_payment_refund',{p_refund_id:b.dataset.rer});},loadEstornos));
}catch(e){out.textContent='Erro: '+e.message;}}
$('rf-refresh').onclick=loadRifas;$('rf-year').onchange=loadRifas;$('rf-pending').onchange=loadRifas;$('re-refresh').onclick=loadEstornos;
document.querySelector('[data-tab="rifas"]').addEventListener('click',loadRifas);document.querySelector('[data-tab="estornos"]').addEventListener('click',loadEstornos);
