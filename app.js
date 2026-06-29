// ── IMPORTS FIREBASE ─────────────────────────────────────────────────────────
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, getDocs, addDoc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── STATE ─────────────────────────────────────────────────────────────────────
let clientes = [];
let pagos    = []; // {id, clienteId, año, mes, monto, fechaRegistro, nota, codigoComprobante, paused}
let selectedYear  = new Date().getFullYear();
let editingClienteId = null;
let payingContext    = null; // {clienteId, año, mes}
let showInactive     = false;

export const MONTHS      = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
export const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                            'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── AUTH ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    await loadAll();
    showApp();
  } else {
    showLogin();
  }
});

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch {
    errEl.textContent = 'Credenciales incorrectas. Verifica tu correo y contraseña.';
    errEl.style.display = 'block';
  }
});

document.getElementById('login-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// ── CARGA DE DATOS ────────────────────────────────────────────────────────────
async function loadAll() {
  const [cSnap, pSnap] = await Promise.all([
    getDocs(collection(db, 'clientes')),
    getDocs(collection(db, 'pagos'))
  ]);
  clientes = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  pagos    = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loading').classList.add('hide');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('loading').classList.add('hide');
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  initYearSelect();
  initSearch();
  render();
}

// ── SELECTOR DE AÑO ──────────────────────────────────────────────────────────
function initYearSelect() {
  const sel = document.getElementById('year-select');
  const currentYear = new Date().getFullYear();
  sel.innerHTML = '';
  for (let y = 2024; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === selectedYear) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    selectedYear = parseInt(sel.value);
    render();
  });
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────────
function render() {
  renderSummary();
  const tab  = document.getElementById('tab-cards').classList.contains('active') ? 'cards' : 'table';
  const list = showInactive ? clientes : clientes.filter(c => c.activo);
  if (tab === 'cards') renderCards(list);
  else renderTable();
}

// ── RESUMEN ───────────────────────────────────────────────────────────────────
function renderSummary() {
  const now        = new Date();
  const activeCl   = clientes.filter(c => c.activo);
  let cobrado = 0, pendiente = 0, mesCobrado = 0;
  const mesCurrent = now.getMonth() + 1;

  activeCl.forEach(c => {
    const startDate  = c.fechaInicio ? new Date(c.fechaInicio) : new Date('2024-01-01');
    const startYear  = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    for (let m = 1; m <= 12; m++) {
      if (selectedYear < startYear || (selectedYear === startYear && m < startMonth)) continue;
      const isPast = selectedYear < now.getFullYear() ||
                     (selectedYear === now.getFullYear() && m <= mesCurrent);
      if (!isPast) continue;
      const total  = getTotalPagosMes(c.id, selectedYear, m);
      const estado = getEstadoMes(c.id, selectedYear, m, c.cuota);
      if (estado === 'paid' || estado === 'partial') {
        cobrado += total;
        if (m === mesCurrent && selectedYear === now.getFullYear()) mesCobrado += total;
      } else if (estado === 'pending') {
        pendiente += c.cuota;
      }
    }
  });

  document.getElementById('sum-activos').textContent   = activeCl.length;
  document.getElementById('sum-cobrado').textContent   = 'Q ' + cobrado.toLocaleString();
  document.getElementById('sum-pendiente').textContent = 'Q ' + pendiente.toLocaleString();
  document.getElementById('sum-mes').textContent       = 'Q ' + mesCobrado.toLocaleString();
}

// ── HELPERS DE PAGOS ─────────────────────────────────────────────────────────
function getPagosMes(clienteId, año, mes) {
  return pagos.filter(p => p.clienteId === clienteId && p.año === año && p.mes === mes);
}

function getTotalPagosMes(clienteId, año, mes) {
  return getPagosMes(clienteId, año, mes).reduce((sum, p) => sum + p.monto, 0);
}

function getEstadoMes(clienteId, año, mes, cuota) {
  const pagosDelMes = getPagosMes(clienteId, año, mes);
  const pausado = pagosDelMes.some(
    p => p.paused === true || (p.monto === 0 && p.nota?.toLowerCase().includes('pausado'))
  );
  if (pausado) return 'paused';
  const total = pagosDelMes.reduce((sum, p) => sum + p.monto, 0);
  if (total === 0) return 'pending';
  if (total >= cuota) return 'paid';
  return 'partial';
}

// ── DEUDA DE AÑOS ANTERIORES ─────────────────────────────────────────────────
function calcularDeudaAnterior(clienteId, añoActual) {
  const cliente = clientes.find(c => c.id === clienteId);
  if (!cliente) return {};
  const startDate  = cliente.fechaInicio ? new Date(cliente.fechaInicio) : new Date('2024-01-01');
  const startYear  = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;
  const deuda = {};
  for (let año = startYear; año < añoActual; año++) {
    for (let mes = 1; mes <= 12; mes++) {
      if (año === startYear && mes < startMonth) continue;
      const estado = getEstadoMes(clienteId, año, mes, cliente.cuota);
      if (estado === 'pending' || estado === 'partial') {
        if (!deuda[año]) deuda[año] = [];
        const totalPagado = getTotalPagosMes(clienteId, año, mes);
        const restante    = cliente.cuota - totalPagado;
        deuda[año].push({ mes, monto: restante > 0 ? restante : cliente.cuota });
      }
    }
  }
  return deuda;
}

// ── GRID DE MESES (usado en modal detalle) ───────────────────────────────────
function renderMesesGrid(clienteId, año, clickable = true) {
  const c = clientes.find(x => x.id === clienteId);
  if (!c) return '';
  const startDate  = c.fechaInicio ? new Date(c.fechaInicio) : new Date('2024-01-01');
  const startYear  = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;

  let html = `<div class="detalle-meses-grid">`;
  for (let m = 1; m <= 12; m++) {
    const beforeStart = año < startYear || (año === startYear && m < startMonth);
    const estado = getEstadoMes(clienteId, año, m, c.cuota);
    let cls = 'future', label = '';

    if (beforeStart) {
      cls = 'before-start';
    } else {
      switch (estado) {
        case 'paid':    cls = 'paid';    label = 'Q' + getTotalPagosMes(clienteId, año, m); break;
        case 'partial': cls = 'partial'; label = 'Q' + getTotalPagosMes(clienteId, año, m); break;
        case 'paused':  cls = 'paused';  label = '⏸'; break;
        case 'pending': {
          const now    = new Date();
          const isPast = año < now.getFullYear() || (año === now.getFullYear() && m <= now.getMonth() + 1);
          cls   = isPast ? 'pending' : 'future';
          label = isPast ? `Q${c.cuota}` : '+';
          break;
        }
      }
    }

    const onclick = clickable
      ? `onclick="closeModal('modal-detalle'); abrirDetalleMes('${c.id}',${año},${m})"`
      : '';
    html += `<div class="month-cell ${cls}" style="cursor:${clickable ? 'pointer' : 'default'}" ${onclick}>
      <span class="month-label">${MONTHS[m - 1]}</span>
      ${label ? `<span class="month-amount">${label}</span>` : ''}
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── TARJETAS DE CLIENTES ──────────────────────────────────────────────────────
function renderCards(list) {
  const grid = document.getElementById('clients-grid');
  grid.innerHTML = '';

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      <p>No se encontraron clientes</p></div>`;
    return;
  }

  const now = new Date();
  list.forEach(c => {
    const startDate  = c.fechaInicio ? new Date(c.fechaInicio) : new Date('2024-01-01');
    const startYear  = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    let paidTotal = 0, pendingTotal = 0;

    const monthCells = MONTHS.map((m, i) => {
      const mes = i + 1;
      const beforeStart = selectedYear < startYear || (selectedYear === startYear && mes < startMonth);
      if (beforeStart) return `<div class="month-cell before-start"><span class="month-label">${m}</span></div>`;

      const estado = getEstadoMes(c.id, selectedYear, mes, c.cuota);
      const total  = getTotalPagosMes(c.id, selectedYear, mes);
      let cls = '', label2 = '';

      if (estado === 'paid')    { cls = 'paid';    label2 = 'Q' + total; paidTotal += total; }
      else if (estado === 'partial') { cls = 'partial'; label2 = 'Q' + total; paidTotal += total; }
      else if (estado === 'paused')  { cls = 'paused';  label2 = '⏸'; }
      else {
        const isPast = selectedYear < now.getFullYear() ||
                       (selectedYear === now.getFullYear() && mes <= now.getMonth() + 1);
        cls    = isPast ? 'pending' : 'future';
        label2 = isPast ? 'Q' + c.cuota : '+';
        if (isPast) pendingTotal += c.cuota;
      }

      return `<div class="month-cell ${cls}" onclick="abrirDetalleMes('${c.id}',${selectedYear},${mes})">
        <span class="month-label">${m}</span>
        ${label2 ? `<span class="month-amount">${label2}</span>` : ''}
      </div>`;
    }).join('');

    const deuda     = calcularDeudaAnterior(c.id, selectedYear);
    const debtBadge = Object.keys(deuda).length > 0
      ? `<span class="badge-debt">⚠ Debe ${Object.keys(deuda).join(', ')}</span>`
      : '';

    const div = document.createElement('div');
    div.className = 'client-card';
    div.innerHTML = `
      <div class="client-card-header" onclick="openDetalleModal('${c.id}')">
        <div>
          <div class="client-name">${c.nombre}</div>
          <div class="client-meta">WAN: ${c.wan}<br>LAN: ${c.lan}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="client-badge ${c.activo ? 'badge-active' : 'badge-inactive'}">${c.activo ? 'Activo' : 'Inactivo'}</span>
          ${debtBadge}
        </div>
      </div>
      <div class="client-plan-row">
        <span class="plan-name">📡 ${c.plan || 'Sin plan'}</span>
        <span class="plan-cuota">Q${c.cuota}/mes</span>
      </div>
      <div class="months-grid">${monthCells}</div>
      <div class="client-card-footer">
        <div class="footer-totals">
          Cobrado: <span class="paid-total">Q${paidTotal}</span> &nbsp;|&nbsp;
          Pendiente: <span class="pending-total">Q${Math.max(0, pendingTotal)}</span>
        </div>
        <button class="btn-edit-client" onclick="event.stopPropagation(); openClientModal('${c.id}')">Editar</button>
      </div>`;
    grid.appendChild(div);
  });
}

// ── MODAL: DETALLE CLIENTE ────────────────────────────────────────────────────
window.openDetalleModal = (clienteId) => {
  const c = clientes.find(x => x.id === clienteId);
  if (!c) return;
  const añoActual  = selectedYear;
  const startDate  = c.fechaInicio ? new Date(c.fechaInicio) : new Date('2024-01-01');
  const startYear  = startDate.getFullYear();
  const startMonth = startDate.getMonth() + 1;

  const infoHTML = `
    <div class="detalle-cliente-info">
      <div class="item">Nombre: <span>${c.nombre}</span></div>
      <div class="item">Plan: <span>${c.plan || '—'}</span></div>
      <div class="item">Cuota: <span>Q${c.cuota}</span></div>
      <div class="item">Estado: <span>${c.activo ? 'Activo' : 'Inactivo'}</span></div>
      <div class="item">WAN: <span>${c.wan || '—'}</span></div>
      <div class="item">LAN: <span>${c.lan || '—'}</span></div>
      <div class="item">Inicio: <span>${c.fechaInicio || '—'}</span></div>
      <div class="item">Nota: <span>${c.nota || '—'}</span></div>
    </div>`;

  let mesesHTML = `<div style="font-weight:600;font-size:0.85rem;margin:8px 0 4px;color:var(--text2);
    text-transform:uppercase;letter-spacing:.5px;">${añoActual}</div>`;
  mesesHTML += renderMesesGrid(clienteId, añoActual, true);

  // Solo mostrar años anteriores que tengan deuda real (excluye before-start)
  const deuda = calcularDeudaAnterior(clienteId, añoActual);
  const now   = new Date();
  const añosConDeuda = [];

  for (let y = startYear; y < añoActual; y++) {
    const maxMes = y < now.getFullYear() ? 12 : now.getMonth() + 1;
    for (let m = 1; m <= maxMes; m++) {
      if (y === startYear && m < startMonth) continue;
      const estado = getEstadoMes(clienteId, y, m, c.cuota);
      if (estado === 'pending' || estado === 'partial') { añosConDeuda.push(y); break; }
    }
  }

  let deudaHTML = '';
  if (añosConDeuda.length > 0) {
    const totalDeuda = Object.values(deuda).flat().reduce((s, item) => s + item.monto, 0);
    deudaHTML = `<div class="detalle-deuda-antigua">
      <h4>🔴 Deuda de años anteriores &nbsp;
        <span style="font-weight:400;color:var(--red);font-size:0.75rem;">Total: Q${totalDeuda}</span>
      </h4>`;
    for (const año of añosConDeuda.sort((a, b) => b - a)) {
      deudaHTML += `<div style="margin-top:10px;">
        <span style="font-weight:600;color:var(--text2);font-size:0.8rem;">${año}</span>`;
      deudaHTML += renderMesesGrid(clienteId, año, true);
      deudaHTML += `</div>`;
    }
    deudaHTML += `</div>`;
  }

  document.getElementById('detalle-title').textContent   = `Detalle: ${c.nombre}`;
  document.getElementById('detalle-body').innerHTML      = infoHTML + mesesHTML + deudaHTML;
  document.getElementById('btn-detalle-editar').onclick  = () => {
    closeModal('modal-detalle');
    openClientModal(clienteId);
  };
  openModal('modal-detalle');
};

// ── MODAL: DETALLE DE PAGOS DEL MES ──────────────────────────────────────────
window.abrirDetalleMes = (clienteId, año, mes) => {
  const c = clientes.find(x => x.id === clienteId);
  if (!c) return;

  const pagosDelMes  = getPagosMes(clienteId, año, mes);
  const totalPagado  = getTotalPagosMes(clienteId, año, mes);
  const estado       = getEstadoMes(clienteId, año, mes, c.cuota);
  const restante     = Math.max(0, c.cuota - totalPagado);
  const estaPagado   = estado === 'paid';
  const estaPausado  = estado === 'paused';

  // Mes futuro sin pagos → ir directo al formulario
  const now      = new Date();
  const esFuturo = año > now.getFullYear() || (año === now.getFullYear() && mes > now.getMonth() + 1);
  if (esFuturo && pagosDelMes.length === 0) {
    abrirFormularioPago(clienteId, año, mes, c.cuota);
    return;
  }

  let bodyHTML = `
    <div class="pay-context">
      <div class="pay-context-name">${c.nombre}</div>
      <div class="pay-context-sub">${MONTHS_FULL[mes - 1]} ${año} · Cuota: <span>Q${c.cuota}</span></div>
      ${estaPausado ? `<div style="margin-top:6px;"><span class="badge-pausado">⏸ Servicio pausado</span></div>` : ''}
    </div>`;

  if (pagosDelMes.length > 0) {
    bodyHTML += `<div class="detalle-mes-pagos">`;
    pagosDelMes
      .sort((a, b) => new Date(a.fechaRegistro) - new Date(b.fechaRegistro))
      .forEach(p => {
        const fecha     = new Date(p.fechaRegistro).toLocaleDateString('es-GT');
        const esPausado = p.paused === true || (p.monto === 0 && p.nota?.toLowerCase().includes('pausado'));
        bodyHTML += `
          <div class="pago-item">
            <span class="codigo">${p.codigoComprobante || '—'}</span>
            <span class="fecha">${fecha}</span>
            <span class="monto" style="color:${esPausado ? 'var(--text3)' : 'var(--green)'}">
              ${esPausado ? '⏸ Q0' : 'Q' + p.monto}
            </span>
            ${p.nota ? `<span style="color:var(--text3);font-size:0.7rem;">${p.nota}</span>` : ''}
            <span class="acciones">
              <button class="btn-sm" onclick="reimprimirComprobante('${p.id}')">🖨</button>
              <button class="btn-sm danger" onclick="eliminarPago('${p.id}')">✕</button>
            </span>
          </div>`;
      });
    bodyHTML += `</div>`;
  } else {
    bodyHTML += `<p style="color:var(--text3);font-size:0.85rem;">No hay pagos registrados para este mes.</p>`;
  }

  bodyHTML += `
    <div class="detalle-mes-totales">
      <span>Total pagado: <strong style="color:var(--green);">Q${totalPagado}</strong></span>
      ${!estaPagado && !estaPausado ? `<span class="restante">Restante: Q${restante}</span>` : ''}
      ${estaPagado ? `<span style="color:var(--green);">✅ Completado</span>` : ''}
    </div>`;

  document.getElementById('mes-pagos-title').textContent = `Pagos · ${c.nombre}`;
  document.getElementById('mes-pagos-body').innerHTML    = bodyHTML;
  const btnAgregar = document.getElementById('btn-agregar-pago-mes');
  btnAgregar.style.display = estaPagado || estaPausado ? 'none' : 'block';
  btnAgregar.onclick = () => {
    closeModal('modal-mes-pagos');
    abrirFormularioPago(clienteId, año, mes, restante);
  };
  openModal('modal-mes-pagos');
};

// ── FORMULARIO DE PAGO ────────────────────────────────────────────────────────
function abrirFormularioPago(clienteId, año, mes, montoSugerido = null) {
  const c = clientes.find(x => x.id === clienteId);
  if (!c) return;
  payingContext = { clienteId, año, mes };

  const totalPagado = getTotalPagosMes(clienteId, año, mes);
  const restante    = Math.max(0, c.cuota - totalPagado);
  const now         = new Date();
  const esFuturo    = año > now.getFullYear() || (año === now.getFullYear() && mes > now.getMonth() + 1);

  document.getElementById('modal-pago-title').textContent = `Registrar pago · ${c.nombre}`;
  document.getElementById('pay-context').innerHTML = `
    <div class="pay-context-name">${c.nombre}</div>
    <div class="pay-context-sub">
      ${MONTHS_FULL[mes - 1]} ${año} · Cuota: <span>Q${c.cuota}</span>
      ${esFuturo ? ' &nbsp;·&nbsp; <span style="color:var(--yellow)">📅 Pago anticipado</span>' : ''}
    </div>`;
  document.getElementById('pay-monto').value    = montoSugerido !== null ? montoSugerido : c.cuota;
  document.getElementById('pay-monto').disabled = false;
  document.getElementById('pay-parcial').checked = false;
  document.getElementById('pay-paused').checked  = false;
  document.getElementById('pay-nota').value      = '';
  document.getElementById('pay-mensaje').textContent = `Saldo restante: Q${restante}`;
  openModal('modal-pago');
}

// ── TOGGLES DEL FORMULARIO ────────────────────────────────────────────────────
window.toggleParcial = () => {
  if (document.getElementById('pay-parcial').checked) {
    document.getElementById('pay-paused').checked  = false;
    document.getElementById('pay-monto').disabled  = false;
  }
};

window.togglePaused = () => {
  const paused = document.getElementById('pay-paused').checked;
  document.getElementById('pay-monto').disabled = paused;
  if (paused) {
    document.getElementById('pay-monto').value     = 0;
    document.getElementById('pay-parcial').checked = false;
  }
};

// ── GUARDAR PAGO ──────────────────────────────────────────────────────────────
window.guardarPago = async () => {
  const isPaused = document.getElementById('pay-paused').checked;
  let monto      = parseFloat(document.getElementById('pay-monto').value);
  if (isPaused) monto = 0;
  let nota = document.getElementById('pay-nota').value.trim();
  if (isPaused && !nota) nota = 'Servicio pausado';

  const { clienteId, año, mes } = payingContext;
  const c = clientes.find(x => x.id === clienteId);
  if (!c) { toast('Cliente no encontrado', 'error'); return; }

  const pagosExistentes     = getPagosMes(clienteId, año, mes);
  const totalPagadoAnterior = pagosExistentes.reduce((sum, p) => sum + p.monto, 0);
  const restante            = c.cuota - totalPagadoAnterior;

  if (!isPaused && (isNaN(monto) || monto < 0)) { toast('Ingresa un monto válido', 'error'); return; }
  if (!isPaused && monto > restante) { toast(`El monto no puede exceder el saldo restante de Q${restante}`, 'error'); return; }

  const esParcial = document.getElementById('pay-parcial').checked;
  if (esParcial && monto >= c.cuota) { toast('Para pago parcial el monto debe ser menor a la cuota', 'error'); return; }

  const codigo = 'REC-' + año + String(mes).padStart(2, '0') + '-' +
                 Math.random().toString(36).substr(2, 4).toUpperCase();
  const data = { clienteId, año, mes, monto, fechaRegistro: new Date().toISOString(), nota, codigoComprobante: codigo, paused: isPaused };

  try {
    const ref = await addDoc(collection(db, 'pagos'), data);
    pagos.push({ id: ref.id, ...data });
    closeModal('modal-pago');
    render();

    const nuevoTotal = getPagosMes(clienteId, año, mes).reduce((sum, p) => sum + p.monto, 0);
    const nuevoSaldo = Math.max(0, c.cuota - nuevoTotal);
    toast('Pago registrado ✓', 'success');
    if (!isPaused) showReceipt(c, año, mes, monto, nota, codigo, nuevoTotal, nuevoSaldo);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
};

// ── ELIMINAR PAGO ─────────────────────────────────────────────────────────────
window.eliminarPago = async (pagoId) => {
  if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db, 'pagos', pagoId));
    pagos = pagos.filter(p => p.id !== pagoId);
    closeModal('modal-mes-pagos');
    render();
    toast('Pago eliminado', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
};

// ── REIMPRIMIR COMPROBANTE ────────────────────────────────────────────────────
window.reimprimirComprobante = async (pagoId) => {
  const pago    = pagos.find(p => p.id === pagoId);
  if (!pago)    { toast('Pago no encontrado', 'error'); return; }
  const cliente = clientes.find(c => c.id === pago.clienteId);
  if (!cliente) { toast('Cliente no encontrado', 'error'); return; }

  // Si el pago no tiene código guardado, generarlo y persistirlo
  let codigo = pago.codigoComprobante;
  if (!codigo) {
    codigo = 'REC-' + pago.año + String(pago.mes).padStart(2, '0') + '-' +
             Math.random().toString(36).substr(2, 4).toUpperCase();
    try {
      await setDoc(doc(db, 'pagos', pagoId), { codigoComprobante: codigo }, { merge: true });
      pago.codigoComprobante = codigo; // actualizar en memoria
    } catch (e) {
      console.warn('No se pudo guardar el código:', e.message);
    }
  }

  const pagosMes    = getPagosMes(cliente.id, pago.año, pago.mes);
  const totalPagado = pagosMes.reduce((sum, p) => sum + p.monto, 0);
  const saldo       = Math.max(0, cliente.cuota - totalPagado);
  showReceipt(cliente, pago.año, pago.mes, pago.monto, pago.nota, codigo, totalPagado, saldo);
};

// ── COMPROBANTE ───────────────────────────────────────────────────────────────
function showReceipt(cliente, año, mes, montoActual, nota, codigo, totalPagado, saldoRestante) {
  const now         = new Date();
  const fecha       = now.toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' });
  const esParcial   = totalPagado < cliente.cuota && totalPagado > 0;
  const pagosMes    = getPagosMes(cliente.id, año, mes);
  const previosTotal = totalPagado - montoActual;

  const previosText = pagosMes.length > 1 && previosTotal > 0
    ? `<div class="receipt-row"><span class="rlabel">Pagos previos</span><span class="rval">Q${previosTotal.toFixed(2)}</span></div>`
    : '';

  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-header">
      <div class="receipt-brand">📡 SERVICIOS DE RED</div>
      <div class="receipt-sub">Comprobante de pago de servicio</div>
    </div>
    <div class="receipt-row"><span class="rlabel">Cliente</span><span class="rval">${cliente.nombre}</span></div>
    <div class="receipt-row"><span class="rlabel">Período</span><span class="rval">${MONTHS_FULL[mes - 1]} ${año}</span></div>
    <div class="receipt-row"><span class="rlabel">Fecha de pago</span><span class="rval">${fecha}</span></div>
    <div class="receipt-row"><span class="rlabel">Plan</span><span class="rval">${cliente.plan || 'Servicio mensual'}</span></div>
    <div class="receipt-row"><span class="rlabel">Cuota mensual</span><span class="rval">Q${cliente.cuota}</span></div>
    ${previosText}
    <div class="receipt-row"><span class="rlabel">Este pago</span><span class="rval">Q${montoActual.toFixed(2)}</span></div>
    <hr class="receipt-divider">
    <div class="receipt-total"><span>Total acumulado</span><span class="rval">Q${totalPagado.toFixed(2)}</span></div>
    ${esParcial ? `<div style="display:flex;justify-content:space-between;font-size:0.9rem;color:var(--yellow);margin-top:4px;">
      <span>Saldo pendiente</span><span>Q${saldoRestante.toFixed(2)}</span></div>` : ''}
    ${!esParcial && totalPagado >= cliente.cuota ? `<div style="display:flex;justify-content:space-between;font-size:0.9rem;color:var(--green);margin-top:4px;">
      <span>✅ Mes completado</span><span>Saldo Q0</span></div>` : ''}
    <div class="receipt-footer">Código: <strong>${codigo}</strong><br>Gracias por su pago.</div>
    <div class="receipt-folio">${codigo}</div>`;
  openModal('modal-receipt');
}

// ── TABLA ANUAL ───────────────────────────────────────────────────────────────
function renderTable() {
  const now    = new Date();
  const thead  = document.querySelector('#annual-table thead');
  const tbody  = document.querySelector('#annual-table tbody');
  const tfoot  = document.querySelector('#annual-table tfoot');
  thead.innerHTML = `<tr><th>Cliente</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr>`;

  const monthTotals = Array(12).fill(0);
  let grandTotal    = 0;
  const list        = showInactive ? clientes : clientes.filter(c => c.activo);

  tbody.innerHTML = list.map(c => {
    const startDate  = c.fechaInicio ? new Date(c.fechaInicio) : new Date('2024-01-01');
    const startYear  = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    let rowTotal = 0;

    const cells = MONTHS.map((_, i) => {
      const mes         = i + 1;
      const beforeStart = selectedYear < startYear || (selectedYear === startYear && mes < startMonth);
      if (beforeStart) return `<td class="cell-future" style="opacity:.3">·</td>`;

      const estado = getEstadoMes(c.id, selectedYear, mes, c.cuota);
      const total  = getTotalPagosMes(c.id, selectedYear, mes);
      let cls, label;

      switch (estado) {
        case 'paid':    cls = 'cell-paid';    label = 'Q' + total; rowTotal += total; monthTotals[i] += total; grandTotal += total; break;
        case 'partial': cls = 'cell-partial'; label = 'Q' + total; rowTotal += total; monthTotals[i] += total; grandTotal += total; break;
        case 'paused':  cls = 'cell-paused';  label = '⏸'; break;
        default: {
          const isPast = selectedYear < now.getFullYear() || (selectedYear === now.getFullYear() && mes <= now.getMonth() + 1);
          cls   = isPast ? 'cell-pending' : 'cell-future';
          label = isPast ? 'Q' + c.cuota : '+';
        }
      }
      return `<td class="${cls}" style="cursor:pointer" onclick="abrirDetalleMes('${c.id}',${selectedYear},${mes})">${label}</td>`;
    }).join('');

    const inactiveMark = !c.activo ? ' <span style="font-size:.7rem;color:var(--text3)">(inactivo)</span>' : '';
    return `<tr><td>${c.nombre}${inactiveMark}</td>${cells}<td style="font-weight:700;color:var(--accent)">Q${rowTotal}</td></tr>`;
  }).join('');

  tfoot.innerHTML = `<tr><td>TOTAL</td>${monthTotals.map(t => `<td>Q${t}</td>`).join('')}<td>Q${grandTotal}</td></tr>`;
}

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────────
function initSearch() {
  const input = document.getElementById('search-input');
  const drop  = document.getElementById('autocomplete');

  input.addEventListener('input', () => {
    const q    = input.value.toLowerCase().trim();
    const base = showInactive ? clientes : clientes.filter(c => c.activo);
    if (!q) { drop.style.display = 'none'; renderCards(base); return; }

    const matches = base.filter(c => c.nombre.toLowerCase().includes(q));
    drop.innerHTML = matches.length
      ? matches.map(c => `<div class="autocomplete-item" onclick="selectClient('${c.id}')">
          ${c.nombre} <span style="color:var(--text3);font-size:.75rem">— Q${c.cuota}/mes</span>
        </div>`).join('')
      : `<div class="autocomplete-item" style="color:var(--text3)">Sin resultados</div>`;
    drop.style.display = 'block';
    renderCards(matches);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#search-wrap')) drop.style.display = 'none';
  });
}

window.selectClient = (id) => {
  const c = clientes.find(x => x.id === id);
  if (!c) return;
  document.getElementById('search-input').value      = c.nombre;
  document.getElementById('autocomplete').style.display = 'none';
  renderCards([c]);
};

// ── TABS ──────────────────────────────────────────────────────────────────────
window.switchTab = (tab) => {
  document.getElementById('tab-cards').classList.toggle('active', tab === 'cards');
  document.getElementById('tab-table').classList.toggle('active', tab === 'table');
  document.getElementById('clients-grid').style.display  = tab === 'cards' ? 'grid'  : 'none';
  document.getElementById('table-view').style.display    = tab === 'table' ? 'block' : 'none';
  document.getElementById('search-wrap').style.display   = tab === 'cards' ? 'block' : 'none';
  if (tab === 'table') renderTable();
};

// ── MODAL: CLIENTE ────────────────────────────────────────────────────────────
window.openClientModal = (id = null) => {
  editingClienteId = id;
  const c = id ? clientes.find(x => x.id === id) : null;
  document.getElementById('modal-cliente-title').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('cl-nombre').value     = c?.nombre     || '';
  document.getElementById('cl-wan').value        = c?.wan        || '';
  document.getElementById('cl-lan').value        = c?.lan        || '';
  document.getElementById('cl-plan').value       = c?.plan       || '';
  document.getElementById('cl-cuota').value      = c?.cuota      || '';
  document.getElementById('cl-fecha').value      = c?.fechaInicio || '';
  document.getElementById('cl-activo').value     = c ? String(c.activo) : 'true';
  document.getElementById('cl-nota').value       = c?.nota       || '';
  document.getElementById('btn-delete-client').style.display = c ? 'block' : 'none';
  openModal('modal-cliente');
};

window.guardarCliente = async () => {
  const data = {
    nombre:      document.getElementById('cl-nombre').value.trim(),
    wan:         document.getElementById('cl-wan').value.trim(),
    lan:         document.getElementById('cl-lan').value.trim(),
    plan:        document.getElementById('cl-plan').value.trim(),
    cuota:       parseFloat(document.getElementById('cl-cuota').value) || 0,
    fechaInicio: document.getElementById('cl-fecha').value,
    activo:      document.getElementById('cl-activo').value === 'true',
    nota:        document.getElementById('cl-nota').value.trim(),
  };
  if (!data.nombre) { toast('El nombre es obligatorio', 'error'); return; }

  try {
    if (editingClienteId) {
      await setDoc(doc(db, 'clientes', editingClienteId), data);
      const idx = clientes.findIndex(c => c.id === editingClienteId);
      clientes[idx] = { id: editingClienteId, ...data };
    } else {
      const ref = await addDoc(collection(db, 'clientes'), data);
      clientes.push({ id: ref.id, ...data });
    }
    clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
    closeModal('modal-cliente');
    render();
    toast('Cliente guardado ✓', 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
};

window.deleteCliente = async () => {
  if (!confirm('¿Eliminar este cliente? Sus pagos se conservan.')) return;
  try {
    await deleteDoc(doc(db, 'clientes', editingClienteId));
    clientes = clientes.filter(c => c.id !== editingClienteId);
    closeModal('modal-cliente');
    render();
    toast('Cliente eliminado', 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
};

// ── BOTONES GLOBALES ──────────────────────────────────────────────────────────
document.getElementById('btn-add-client').addEventListener('click', () => openClientModal(null));
document.getElementById('btn-toggle-inactive').addEventListener('click', () => {
  showInactive = !showInactive;
  document.getElementById('btn-toggle-inactive').classList.toggle('active', showInactive);
  render();
});

// ── HELPERS MODALES ───────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
window.closeModal = (id) => { document.getElementById(id).classList.remove('open'); };
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'show ' + type;
  setTimeout(() => el.className = '', 3000);
}
