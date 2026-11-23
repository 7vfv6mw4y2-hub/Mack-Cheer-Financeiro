
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
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

    button.classList.add('active');
    $(button.dataset.tab).classList.remove('hidden');
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
    is_active: true
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

  function renderTable(items) {
    if (!items.length) return '<p>Nenhuma movimentação cadastrada.</p>';

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Status</th>
              <th>Valor</th>
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
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

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
      <p class="muted">Movimentações que ainda precisam ser organizadas.</p>
      ${renderTable(all.filter(x => !x.athlete_id))}
    </div>
  `;
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
