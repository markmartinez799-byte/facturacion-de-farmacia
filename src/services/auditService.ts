import { supabase } from '@/lib/supabase';

export type AuditAction =
  | 'login_admin'
  | 'login_cajero'
  | 'login_failed'
  | 'logout'
  | 'cajero_creado'
  | 'cajero_editado'
  | 'cajero_desactivado'
  | 'cajero_activado'
  | 'turno_apertura'
  | 'turno_cierre'
  | 'venta_realizada'
  | 'reembolso_procesado'
  | 'cambio_password';

export interface AuditEntry {
  id: string;
  usuarioId?: string;
  usuarioNombre?: string;
  accion: AuditAction;
  entidad?: string;
  entidadId?: string;
  detalles?: string;
  ip?: string;
  resultado: 'exito' | 'fallido' | 'bloqueado';
  createdAt: string;
}

export async function registrarAuditoria(params: {
  usuarioId?: string;
  usuarioNombre?: string;
  accion: AuditAction;
  entidad?: string;
  entidadId?: string;
  detalles?: Record<string, unknown>;
  resultado?: 'exito' | 'fallido' | 'bloqueado';
}): Promise<void> {
  try {
    await supabase.from('logs_auditoria').insert({
      usuario_id: params.usuarioId || null,
      usuario_nombre: params.usuarioNombre || null,
      accion: params.accion,
      entidad: params.entidad || null,
      entidad_id: params.entidadId || null,
      detalles: params.detalles ? JSON.stringify(params.detalles) : null,
      resultado: params.resultado || 'exito',
    });
  } catch (e: any) {
    // Never throw from audit — it's a side effect
    console.warn('[auditoria] Error al registrar:', e.message);
  }
}

export async function fetchLogsAuditoria(filters?: {
  usuarioId?: string;
  accion?: AuditAction;
  limit?: number;
}): Promise<AuditEntry[]> {
  let query = supabase
    .from('logs_auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit || 200);

  if (filters?.usuarioId) query = query.eq('usuario_id', filters.usuarioId);
  if (filters?.accion) query = query.eq('accion', filters.accion);

  const { data, error } = await query;
  if (error) {
    console.error('[fetchLogsAuditoria] Error:', error.message);
    return [];
  }

  return (data || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    usuarioId: (r.usuario_id as string) || undefined,
    usuarioNombre: (r.usuario_nombre as string) || undefined,
    accion: r.accion as AuditAction,
    entidad: (r.entidad as string) || undefined,
    entidadId: (r.entidad_id as string) || undefined,
    detalles: (r.detalles as string) || undefined,
    ip: (r.ip as string) || undefined,
    resultado: (r.resultado as 'exito' | 'fallido' | 'bloqueado') || 'exito',
    createdAt: (r.created_at as string) || '',
  }));
}