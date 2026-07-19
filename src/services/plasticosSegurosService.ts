import { supabase } from '@/lib/supabase';
import type { PlasticoSeguro, PlasticoSeguroHistorial, ConsultaSeguroResultado } from '@/types';
import { generateId, now } from '@/utils/formatters';

// ─── ROW CONVERTERS ─────────────────────────────────────────────────────────

function plasticoToRow(p: Omit<PlasticoSeguro, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string; updatedAt?: string }) {
  return {
    id: p.id,
    numero_referencia: p.numeroReferencia,
    nombre_cliente: p.nombreCliente,
    telefono: p.telefono || null,
    cedula: p.cedula || null,
    tipo_vehiculo: p.tipoVehiculo,
    marca_vehiculo: p.marcaVehiculo || null,
    modelo: p.modelo || null,
    ano: p.ano || null,
    placa: p.placa,
    aseguradora: p.aseguradora || null,
    numero_poliza: p.numeroPoliza || null,
    fecha_emision_seguro: p.fechaEmisionSeguro || null,
    fecha_vencimiento_seguro: p.fechaVencimientoSeguro || null,
    fecha_llegada: p.fechaLlegada || null,
    lote_mes: p.loteMes || null,
    observaciones: p.observaciones || null,
    estado: p.estado,
    plastico_recibido: p.plasticoRecibido ?? false,
    fecha_recibido: p.fechaRecibido || null,
    fecha_entrega: p.fechaEntrega || null,
    hora_entrega: p.horaEntrega || null,
    empleado_entrego: p.empleadoEntrego || null,
    observaciones_entrega: p.observacionesEntrega || null,
    renovacion_de: p.renovacionDe || null,
    sucursal_id: p.sucursalId || null,
    created_by: p.createdBy || null,
    updated_by: p.updatedBy || null,
    updated_at: new Date().toISOString(),
  };
}

function rowToPlastico(row: Record<string, unknown>): PlasticoSeguro {
  return {
    id: row.id as string,
    numeroReferencia: (row.numero_referencia as string) || '',
    nombreCliente: (row.nombre_cliente as string) || '',
    telefono: (row.telefono as string) || undefined,
    cedula: (row.cedula as string) || undefined,
    tipoVehiculo: (row.tipo_vehiculo as PlasticoSeguro['tipoVehiculo']) || 'automovil',
    marcaVehiculo: (row.marca_vehiculo as string) || undefined,
    modelo: (row.modelo as string) || undefined,
    ano: (row.ano as string) || undefined,
    placa: (row.placa as string) || '',
    aseguradora: (row.aseguradora as string) || undefined,
    numeroPoliza: (row.numero_poliza as string) || undefined,
    fechaEmisionSeguro: (row.fecha_emision_seguro as string) || undefined,
    fechaVencimientoSeguro: (row.fecha_vencimiento_seguro as string) || undefined,
    fechaLlegada: (row.fecha_llegada as string) || '',
    loteMes: (row.lote_mes as string) || undefined,
    observaciones: (row.observaciones as string) || undefined,
    estado: (row.estado as PlasticoSeguro['estado']) || 'pendiente',
    plasticoRecibido: (row.plastico_recibido as boolean) || false,
    fechaRecibido: (row.fecha_recibido as string) || undefined,
    fechaEntrega: (row.fecha_entrega as string) || undefined,
    horaEntrega: (row.hora_entrega as string) || undefined,
    empleadoEntrego: (row.empleado_entrego as string) || undefined,
    observacionesEntrega: (row.observaciones_entrega as string) || undefined,
    renovacionDe: (row.renovacion_de as string) || undefined,
    sucursalId: (row.sucursal_id as string) || undefined,
    createdAt: (row.created_at as string) || now(),
    updatedAt: (row.updated_at as string) || now(),
    createdBy: (row.created_by as string) || undefined,
    updatedBy: (row.updated_by as string) || undefined,
  };
}

function historialToRow(h: Omit<PlasticoSeguroHistorial, 'id' | 'createdAt'> & { id?: string }) {
  return {
    id: h.id,
    plastico_id: h.plasticoId,
    accion: h.accion,
    usuario: h.usuario || null,
    cambios: h.cambios || null,
  };
}

// ─── FETCH ALL ──────────────────────────────────────────────────────────────

export async function fetchPlasticosSeguros(): Promise<PlasticoSeguro[]> {
  const allData: Record<string, unknown>[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('plasticos_seguros')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchPlasticosSeguros] error:', error.message);
      break;
    }

    if (data && data.length > 0) {
      allData.push(...data);
    }

    if (!data || data.length < pageSize) {
      hasMore = false;
    } else {
      from += pageSize;
    }
  }

  // Recalculate states based on dates — aseguramos que nada vencido tenga fecha futura
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const treintaDias = new Date(hoy);
  treintaDias.setDate(treintaDias.getDate() + 30);

  return allData.map((r) => {
    const plastico = rowToPlastico(r);
    // Solo recalculamos estados que dependen del vencimiento del seguro
    // No tocamos 'entregado' ni 'renovado'
    if (plastico.estado !== 'entregado' && plastico.estado !== 'renovado' && plastico.fechaVencimientoSeguro) {
      const venc = new Date(plastico.fechaVencimientoSeguro + 'T00:00:00');
      if (venc < hoy) {
        plastico.estado = 'vencido';
      } else if (venc <= treintaDias) {
        plastico.estado = 'proximo_vencer';
      } else {
        plastico.estado = 'pendiente';
      }
    }
    return plastico;
  });
}

// ─── FETCH ONE ──────────────────────────────────────────────────────────────

export async function fetchPlasticoById(id: string): Promise<PlasticoSeguro | null> {
  const { data, error } = await supabase
    .from('plasticos_seguros')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return rowToPlastico(data as Record<string, unknown>);
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function insertPlastico(
  formData: Omit<PlasticoSeguro, 'id' | 'createdAt' | 'updatedAt' | 'estado' | 'numeroReferencia'> & { estado?: PlasticoSeguro['estado'] }
): Promise<PlasticoSeguro> {
  const id = generateId();
  const numeroReferencia = 'PS-' + id.substring(0, 8).toUpperCase();

  const plastico: Omit<PlasticoSeguro, 'id' | 'createdAt' | 'updatedAt'> & { id: string; createdAt?: string; updatedAt?: string } = {
    id,
    numeroReferencia,
    ...formData,
    estado: formData.estado || 'pendiente',
    plasticoRecibido: false,
    createdAt: now(),
    updatedAt: now(),
  };

  await supabase.from('plasticos_seguros').insert(plasticoToRow(plastico));
  return { ...plastico, createdAt: plastico.createdAt!, updatedAt: plastico.updatedAt! };
}

export async function updatePlastico(id: string, updates: Partial<PlasticoSeguro>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.nombreCliente !== undefined) row.nombre_cliente = updates.nombreCliente;
  if (updates.telefono !== undefined) row.telefono = updates.telefono || null;
  if (updates.cedula !== undefined) row.cedula = updates.cedula || null;
  if (updates.tipoVehiculo !== undefined) row.tipo_vehiculo = updates.tipoVehiculo;
  if (updates.marcaVehiculo !== undefined) row.marca_vehiculo = updates.marcaVehiculo || null;
  if (updates.modelo !== undefined) row.modelo = updates.modelo || null;
  if (updates.ano !== undefined) row.ano = updates.ano || null;
  if (updates.placa !== undefined) row.placa = updates.placa;
  if (updates.aseguradora !== undefined) row.aseguradora = updates.aseguradora || null;
  if (updates.numeroPoliza !== undefined) row.numero_poliza = updates.numeroPoliza || null;
  if (updates.fechaEmisionSeguro !== undefined) row.fecha_emision_seguro = updates.fechaEmisionSeguro || null;
  if (updates.fechaVencimientoSeguro !== undefined) row.fecha_vencimiento_seguro = updates.fechaVencimientoSeguro || null;
  if (updates.fechaLlegada !== undefined) row.fecha_llegada = updates.fechaLlegada;
  if (updates.loteMes !== undefined) row.lote_mes = updates.loteMes || null;
  if (updates.observaciones !== undefined) row.observaciones = updates.observaciones || null;
  if (updates.estado !== undefined) row.estado = updates.estado;
  if (updates.fechaEntrega !== undefined) row.fecha_entrega = updates.fechaEntrega || null;
  if (updates.empleadoEntrego !== undefined) row.empleado_entrego = updates.empleadoEntrego || null;
  if (updates.observacionesEntrega !== undefined) row.observaciones_entrega = updates.observacionesEntrega || null;
  if (updates.renovacionDe !== undefined) row.renovacion_de = updates.renovacionDe || null;
  if (updates.sucursalId !== undefined) row.sucursal_id = updates.sucursalId || null;
  if (updates.updatedBy !== undefined) row.updated_by = updates.updatedBy || null;
  row.updated_at = new Date().toISOString();

  await supabase.from('plasticos_seguros').update(row).eq('id', id);
}

export async function deletePlastico(id: string): Promise<void> {
  await supabase.from('plasticos_seguros').delete().eq('id', id);
}

// ─── DELIVERY ───────────────────────────────────────────────────────────────

export async function registrarEntrega(
  id: string,
  empleado: string,
  observaciones?: string
): Promise<void> {
  const ahora = new Date();
  const hoy = ahora.toISOString().split('T')[0];
  const hora = ahora.toTimeString().split(' ')[0]; // HH:MM:SS
  await supabase.from('plasticos_seguros').update({
    estado: 'entregado',
    fecha_entrega: hoy,
    hora_entrega: hora,
    empleado_entrego: empleado,
    observaciones_entrega: observaciones || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
}

// ─── REVERTIR ENTREGA ────────────────────────────────────────────────────────

export async function revertirEntrega(
  id: string,
  usuario: string,
  justificacion: string
): Promise<void> {
  await supabase.from('plasticos_seguros').update({
    estado: 'pendiente',
    fecha_entrega: null,
    hora_entrega: null,
    empleado_entrego: null,
    observaciones_entrega: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  await insertHistorial(id, 'Reversión de entrega', usuario, {
    accion: 'Entrega revertida por administrador',
    justificacion,
  });
}

// ─── RENEWAL ────────────────────────────────────────────────────────────────

export async function renovarPlastico(
  plasticoOriginal: PlasticoSeguro,
  nuevaFechaVencimiento: string,
  nuevoNumeroPoliza?: string,
  usuario?: string
): Promise<PlasticoSeguro> {
  // Mark original as renovado
  await updatePlastico(plasticoOriginal.id, { estado: 'renovado', updatedBy: usuario });

  // Create new plastico as renewal
  const nuevo: Omit<PlasticoSeguro, 'id' | 'createdAt' | 'updatedAt' | 'estado'> & { estado?: PlasticoSeguro['estado'] } = {
    nombreCliente: plasticoOriginal.nombreCliente,
    telefono: plasticoOriginal.telefono,
    cedula: plasticoOriginal.cedula,
    tipoVehiculo: plasticoOriginal.tipoVehiculo,
    marcaVehiculo: plasticoOriginal.marcaVehiculo,
    modelo: plasticoOriginal.modelo,
    ano: plasticoOriginal.ano,
    placa: plasticoOriginal.placa,
    aseguradora: plasticoOriginal.aseguradora,
    numeroPoliza: nuevoNumeroPoliza || plasticoOriginal.numeroPoliza,
    fechaEmisionSeguro: new Date().toISOString().split('T')[0],
    fechaVencimientoSeguro: nuevaFechaVencimiento,
    fechaLlegada: new Date().toISOString().split('T')[0],
    loteMes: plasticoOriginal.loteMes,
    observaciones: plasticoOriginal.observaciones,
    estado: 'pendiente',
    renovacionDe: plasticoOriginal.id,
    createdBy: usuario,
  };

  return insertPlastico(nuevo);
}

// ─── AUTO-UPDATE VENCIMIENTOS ───────────────────────────────────────────────

export async function autoUpdateEstados(): Promise<{ actualizados: number; vencidos: number; proximos: number }> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyStr = hoy.toISOString().split('T')[0];
  const treintaDias = new Date(hoy);
  treintaDias.setDate(treintaDias.getDate() + 30);
  const treintaDiasStr = treintaDias.toISOString().split('T')[0];

  // 1. Corregir plásticos marcados como 'vencido' que ya no deberían estarlo (fecha >= hoy)
  //    → Si fecha <= hoy+30: 'proximo_vencer', si fecha > hoy+30: 'pendiente'
  const { data: corregirVencidosProximos } = await supabase
    .from('plasticos_seguros')
    .update({ estado: 'proximo_vencer', updated_at: new Date().toISOString() })
    .eq('estado', 'vencido')
    .gte('fecha_vencimiento_seguro', hoyStr)
    .lte('fecha_vencimiento_seguro', treintaDiasStr)
    .select('id');

  const { data: corregirVencidosPendientes } = await supabase
    .from('plasticos_seguros')
    .update({ estado: 'pendiente', updated_at: new Date().toISOString() })
    .eq('estado', 'vencido')
    .gt('fecha_vencimiento_seguro', treintaDiasStr)
    .select('id');

  // 2. Corregir plásticos 'proximo_vencer' que ya pasaron de 30 días → 'pendiente'
  const { data: corregirProximosPendientes } = await supabase
    .from('plasticos_seguros')
    .update({ estado: 'pendiente', updated_at: new Date().toISOString() })
    .eq('estado', 'proximo_vencer')
    .gt('fecha_vencimiento_seguro', treintaDiasStr)
    .select('id');

  // 3. Mark as vencido: estado IN ('pendiente', 'proximo_vencer') AND vencimiento < hoy
  const { data: vencidos } = await supabase
    .from('plasticos_seguros')
    .update({ estado: 'vencido', updated_at: new Date().toISOString() })
    .in('estado', ['pendiente', 'proximo_vencer'])
    .lt('fecha_vencimiento_seguro', hoyStr)
    .select('id');

  // 4. Mark as proximo_vencer: estado = 'pendiente' AND vencimiento <= hoy+30 AND vencimiento >= hoy
  const { data: proximos } = await supabase
    .from('plasticos_seguros')
    .update({ estado: 'proximo_vencer', updated_at: new Date().toISOString() })
    .eq('estado', 'pendiente')
    .lte('fecha_vencimiento_seguro', treintaDiasStr)
    .gte('fecha_vencimiento_seguro', hoyStr)
    .select('id');

  const totalVencidos = (vencidos?.length || 0);
  const totalProximos = (proximos?.length || 0);
  const corregidos = (corregirVencidosProximos?.length || 0) + (corregirVencidosPendientes?.length || 0) + (corregirProximosPendientes?.length || 0);

  return {
    actualizados: totalVencidos + totalProximos + corregidos,
    vencidos: totalVencidos,
    proximos: totalProximos,
  };
}

// ─── HISTORIAL ──────────────────────────────────────────────────────────────

export async function fetchHistorial(plasticoId: string): Promise<PlasticoSeguroHistorial[]> {
  const { data } = await supabase
    .from('plasticos_seguros_historial')
    .select('*')
    .eq('plastico_id', plasticoId)
    .order('created_at', { ascending: false });

  return (data || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    plasticoId: r.plastico_id as string,
    accion: r.accion as string,
    usuario: (r.usuario as string) || undefined,
    cambios: (r.cambios as Record<string, unknown>) || undefined,
    createdAt: (r.created_at as string) || now(),
  }));
}

export async function insertHistorial(
  plasticoId: string,
  accion: string,
  usuario?: string,
  cambios?: Record<string, unknown>
): Promise<void> {
  await supabase.from('plasticos_seguros_historial').insert(
    historialToRow({
      id: generateId(),
      plasticoId,
      accion,
      usuario,
      cambios,
    })
  );
}

// ─── MARK PLASTIC AS RECEIVED ────────────────────────────────────────────────

export async function marcarPlasticoRecibido(id: string, usuario?: string): Promise<void> {
  const hoy = new Date().toISOString().split('T')[0];
  await supabase.from('plasticos_seguros').update({
    plastico_recibido: true,
    fecha_recibido: hoy,
    updated_at: new Date().toISOString(),
    updated_by: usuario || null,
  }).eq('id', id);
}

// ─── CHECK DUPLICATE ────────────────────────────────────────────────────────

export async function checkPlacaDuplicada(placa: string, excludeId?: string): Promise<PlasticoSeguro | null> {
  let query = supabase
    .from('plasticos_seguros')
    .select('*')
    .ilike('placa', placa.trim())
    .in('estado', ['pendiente', 'proximo_vencer']);

  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query.limit(1).maybeSingle();
  return data ? rowToPlastico(data as Record<string, unknown>) : null;
}

// ─── COUNT BY STATUS ────────────────────────────────────────────────────────

export async function getConteoEstados(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('plasticos_seguros')
    .select('estado');

  const conteo: Record<string, number> = {
    total: 0,
    pendiente: 0,
    entregado: 0,
    vencido: 0,
    proximo_vencer: 0,
    renovado: 0,
  };

  (data || []).forEach((r: Record<string, unknown>) => {
    conteo.total++;
    const estado = (r.estado as string) || 'pendiente';
    if (conteo[estado] !== undefined) conteo[estado]++;
  });

  return conteo;
}

// ─── PUBLIC SEARCH BY CEDULA ─────────────────────────────────────────────────

export async function buscarPorCedula(cedula: string): Promise<ConsultaSeguroResultado> {
  const { data, error } = await supabase
    .rpc('consultar_seguro_publico_v2', { cedula_param: cedula.trim() });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return { encontrado: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    encontrado: true,
    nombreCliente: row.nombre_cliente || undefined,
    tipoVehiculo: row.tipo_vehiculo || undefined,
    marcaVehiculo: row.marca_vehiculo || undefined,
    modelo: row.modelo || undefined,
    ano: row.ano || undefined,
    placa: row.placa || undefined,
    aseguradora: row.aseguradora || undefined,
    estadoSeguro: row.estado_seguro || undefined,
    fechaEmisionSeguro: row.fecha_emision_seguro || undefined,
    fechaVencimientoSeguro: row.fecha_vencimiento_seguro || undefined,
    diasRestantes: row.dias_restantes ?? null,
    plasticoRecibido: row.plastico_recibido ?? undefined,
    fechaRecibido: row.fecha_recibido || undefined,
    fechaEntrega: row.fecha_entrega || undefined,
    horaEntrega: row.hora_entrega || undefined,
    numeroReferencia: row.numero_referencia || undefined,
    sucursalNombre: row.sucursal_nombre || undefined,
    sucursalDireccion: row.sucursal_direccion || undefined,
    sucursalTelefono: row.sucursal_telefono || undefined,
    sucursalHorario: row.sucursal_horario || undefined,
    numeroPolizaParcial: row.numero_poliza_parcial || undefined,
  };
}