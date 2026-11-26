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
 out.innerHTML=`<p>Confira as cobranças antigas antes de cobrar. Baixas manuais não alteram o caixa.</p><button type="button" id="mc-bulk">Marcar selecionadas como pagas manualmente</button> <button type="button" id="mc-exempt">Isentar selecionadas</button> <button type="button" id="mc-na">Marcar selecionadas como não se aplica</button><div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="mc-all"></th><th>Atleta / equipe</th><th>Valor</th><th>Manual</th><th>Extrato</th><th>Em aberto</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${charges.map(c=>`<tr><td><input type="checkbox" class="mc-check" value="${esc(c.id)}"></td><td>${esc(map.get(c.athlete_id)?.name||'Atleta')}<div class="muted">${esc(map.get(c.athlete_id)?.team||'')}</div></td><td>${fmt(c.amount)}</td><td>${fmt(c.manual_paid_amount)}</td><td>${fmt(c.linked_paid_amount)}</td><td>${fmt(c.remaining_amount)}</td><td>${esc(chargeLabels[c.calculated_status]||c.calculated_status)}<div>${esc(c.notes||'')}</div></td><td><button type="button" data-action="edit" data-id="${esc(c.id)}">Editar</button> <button type="button" data-action="manual" data-id="${esc(c.id)}">Baixa manual</button> <button type="button" data-action="pix" data-id="${esc(c.id)}">Pix / vínculos</button></td></tr>`).join('')}</tbody></table></div><div id="mc-detail"></div>`;
 const run=async fn=>{try{await fn();}catch(e){alert(e.message||String(e));}finally{await loadMonthlyCharges();}};
 const update=async(c,p)=>{const rows=await chargeRead(sb.from('monthly_charges').update(p).eq('id',c.id).select('id'));if(rows.length!==1)throw new Error('Cobrança não atualizada.');};
 $('mc-all').onchange=e=>out.querySelectorAll('.mc-check').forEach(x=>x.checked=e.target.checked);
 for(const [id,mode] of [['mc-bulk','paid'],['mc-exempt','exempt'],['mc-na','na']]) $(id).onclick=()=>{const selected=charges.filter(c=>[...out.querySelectorAll('.mc-check:checked')].some(x=>x.value===c.id));if(!selected.length)return alert('Selecione cobranças.');if(selected.some(c=>Number(c.linked_paid_amount)>0 || (mode!=='paid'&&Number(c.manual_paid_amount)>0) || (mode==='paid'&&['isento','nao_se_aplica'].includes(c.calculated_status))))return alert('Há cobranças incompatíveis na seleção. Confira os pagamentos e isenções.');if(!confirm(`Atualizar ${selected.length} cobranças?`))return;run(async()=>{let done=0;try{for(const c of selected){if(mode==='paid')await chargeRpc('set_manual_monthly_payment',{p_monthly_charge_id:c.id,p_amount:Number(c.amount)});else await update(c,{status:mode==='exempt'?'isento':'pendente',not_applicable:mode==='na'});done++;}}catch(e){throw new Error(`${done} atualizadas antes do erro: ${e.message}`);}alert(`${done} atualizadas.`);});};
 out.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const c=charges.find(x=>x.id===b.dataset.id);try{
 if(b.dataset.action==='manual'){const n=askMoney('Total pago manualmente (0 para desfazer):',c.manual_paid_amount);if(n!==null)await run(()=>chargeRpc('set_manual_monthly_payment',{p_monthly_charge_id:c.id,p_amount:n}));}
 if(b.dataset.action==='edit'){if(Number(c.linked_paid_amount)>0||Number(c.manual_paid_amount)>0)return alert('Desfaça os pagamentos antes de editar a cobrança.');const n=askMoney('Valor da cobrança:',c.amount);if(n===null)return;const state=prompt('Situação: 1 = cobrar, 2 = isento, 3 = não se aplica',c.not_applicable?'3':c.status==='isento'?'2':'1');if(state===null)return;if(!['1','2','3'].includes(state))throw new Error('Situação inválida.');const notes=prompt('Observações:',c.notes||'');if(notes===null)return;await run(()=>update(c,{amount:n,status:state==='2'?'isento':'pendente',not_applicable:state==='3',notes}));}
 if(b.dataset.action==='pix')await showChargePix(c,run);
 }catch(e){alert(e.message||String(e));}});
 }catch(e){out.textContent='Erro: '+e.message;}
}
async function showChargePix(c,run){
 const detail=$('mc-detail');detail.textContent='Carregando Pix...';
 const [tx,alloc]=await Promise.all([chargeRead(sb.from('transactions').select('id,date,description,amount').eq('athlete_id',c.athlete_id).eq('category','Mensalidade').eq('type','entrada').eq('status','pago').eq('user_id',c.user_id).order('date',{ascending:false})),chargeRead(sb.from('monthly_payment_allocations').select('*'))]);
 if(!detail.isConnected)return;
 const used=id=>alloc.filter(a=>String(a.transaction_id)===String(id)).reduce((s,a)=>s+Number(a.amount),0);
 detail.innerHTML=`<h3>Pix da atleta — ${esc(c.month)}</h3><p>Escolha o Pix e o valor referente a este mês. A data do Pix não define o mês.</p>${alloc.filter(a=>a.monthly_charge_id===c.id).map(a=>`<p>Pix #${esc(a.transaction_id)} — ${fmt(a.amount)} <button type="button" data-remove="${esc(a.id)}">Desvincular</button></p>`).join('')}<select id="mc-pix"><option value="">Escolher Pix</option>${tx.filter(t=>Number(t.amount)-used(t.id)>0.005).map(t=>`<option value="${esc(t.id)}">${esc(t.date)} — ${esc(t.description)} — disponível ${fmt(Number(t.amount)-used(t.id))}</option>`).join('')}</select><button type="button" id="mc-link">${Number(c.manual_paid_amount)>0?'Conciliar baixa manual':'Vincular Pix'}</button>`;
 detail.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('Desvincular sem excluir o Pix?'))run(()=>chargeRpc('remove_monthly_payment',{p_allocation_id:b.dataset.remove}));});
 $('mc-link').onclick=()=>{const id=$('mc-pix').value;if(!id)return alert('Escolha um Pix.');const t=tx.find(x=>String(x.id)===id);try{const n=askMoney('Valor a vincular:',Number(c.manual_paid_amount)>0?c.manual_paid_amount:Math.min(Number(c.remaining_amount),Number(t.amount)-used(t.id)));if(n===null||n===0)return;if(!confirm('Confirmar vínculo com este mês?'))return;run(()=>chargeRpc(Number(c.manual_paid_amount)>0?'reconcile_manual_payment':'allocate_monthly_payment',{p_transaction_id:id,p_monthly_charge_id:c.id,p_amount:n}));}catch(e){alert(e.message);}};
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
    paid.reduce((s, x) => s + (x.type === 'entrada' ? x.amount : -x.amount), 0)
  );

  $('income').textContent = fmt(
    paid.filter(x => x.type === 'entrada' && x.date.startsWith(month))
      .reduce((s, x) => s + x.amount, 0)
  );

  $('expense').textContent = fmt(
    paid.filter(x => x.type === 'despesa' && x.date.startsWith(month))
      .reduce((s, x) => s + x.amount, 0)
  );

  $('pending').textContent = fmt(
    all.filter(x => x.status === 'pendente')
      .reduce((s, x) => s + x.amount, 0)
  );

  const reportMonth = $('report-month').value;
  const reportItems = paid.filter(x => x.date.startsWith(reportMonth));

  const reportIncome = reportItems
    .filter(x => x.type === 'entrada')
    .reduce((s, x) => s + x.amount, 0);

  const reportExpense = reportItems
    .filter(x => x.type === 'despesa')
    .reduce((s, x) => s + x.amount, 0);

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
console.log('CONTEÚDO DO CSV:', text.slice(0, 2000));
console.log('LINHAS IDENTIFICADAS:', parseCSV(text));
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
