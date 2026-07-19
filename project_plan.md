# GENOSAN — Sistema de Facturación para Farmacia

## 1. Descripción del Proyecto
Sistema completo de punto de venta (POS) y facturación fiscal para la Farmacia GENOSAN. Diseñado para uso multisucursal, multiusuario con dos roles (Administrador y Cajero), cumplimiento DGII (República Dominicana) con generación de NCF, gestión de inventario, reportes y modo offline-first para el módulo de cobro.

## 2. Estructura de Páginas
- `/` → Redirige a `/acceso`
- `/acceso` — Pantalla de Login (selector de rol, teclado virtual cajero, login admin)
- `/panel` — Dashboard Administrador (estadísticas, alertas stock, vencimientos)
- `/pago` — Pantalla POS Cajero (búsqueda productos, carrito, cobro, NCF)
- `/productos` — Gestión de Productos e Inventario
- `/reportes` — Reportes exportables (PDF/Excel)
- `/configuracion` — Configuración general (empresa, NCF, impresión)

## 3. Funcionalidades Principales
- [ ] Login dual: Admin (usuario+contraseña) / Cajero (código numérico + teclado virtual)
- [ ] Modo oscuro/claro con toggle persistido
- [ ] Sonidos (beep + caja) con toggle persistido
- [ ] Dashboard con KPIs, alertas stock, medicamentos por vencer
- [ ] POS: búsqueda por nombre/código, carrito, descuentos, ITBIS 18%
- [ ] POS: tipos de cobro (efectivo, tarjeta, mixto)
- [ ] POS: generación de NCF (B01, B02, B14, B15)
- [ ] POS: cálculo de vuelto, impresión de ticket 80mm con QR DGII
- [ ] Gestión de productos: alta, edición, importación Excel (.xlsx)
- [ ] Gestión de sucursales: crear, editar, desactivar
- [ ] Gestión de cajeros: crear, código de acceso, asignar sucursal
- [ ] Consulta de stock entre sucursales
- [ ] Reportes: ventas por día/cajero/sucursal/producto, exportables PDF/Excel
- [ ] Configuración: datos empresa, RNC, secuencias NCF, formato impresión
- [ ] Offline-first para módulo de cobro (localStorage + sync)

## 4. Modelos de Datos

### users
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | UUID |
| name | string | Nombre completo |
| role | 'admin'\|'cashier' | Rol |
| username | string | Solo admin |
| password | string | Solo admin |
| accessCode | string | Solo cajero (numérico) |
| branchId | string | Sucursal asignada |
| isActive | boolean | Estado |

### branches
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | UUID |
| name | string | Nombre sucursal |
| address | string | Dirección |
| phone | string | Teléfono |
| rnc | string | RNC propio (opcional) |
| isActive | boolean | Estado |

### products
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | UUID |
| barcode | string | Código de barras |
| commercialName | string | Nombre comercial |
| genericName | string | Nombre genérico |
| lab | string | Laboratorio |
| presentation | string | Presentación |
| price | number | Precio de venta RD$ |
| itbisApplicable | boolean | ITBIS aplica |
| stock | Record<branchId, number> | Stock por sucursal |
| expiryDate | string | Fecha vencimiento |
| image | string | URL imagen |

### sales
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | UUID |
| branchId | string | Sucursal |
| cashierId | string | Cajero |
| items | SaleItem[] | Artículos |
| subtotal | number | Subtotal |
| itbis | number | ITBIS calculado |
| discount | number | Descuento % |
| total | number | Total |
| paymentMethod | string | Método de pago |
| ncf | string | Número NCF |
| ncfType | string | Tipo comprobante |
| clientRnc | string | RNC/cédula cliente |
| clientName | string | Nombre cliente |
| timestamp | string | Fecha/hora |

### ncfSequences
| Campo | Tipo | Descripción |
|-------|------|-------------|
| type | string | B01/B02/B14/B15 |
| prefix | string | Prefijo NCF |
| lastNumber | number | Último número usado |
| limit | number | Límite secuencia |

## 5. Integraciones
- Supabase: Pendiente (fase futura — multiusuario real en tiempo real)
- xlsx (SheetJS): Importación/exportación Excel
- Zustand: Estado global con persistencia localStorage
- Web Audio API: Sonidos beep/caja registradora
- CSS @media print: Tickets 80mm y carta

## 6. Plan de Fases

### Fase 1: UI Fundación + Login + POS + Dashboard ✅
- Estructura de archivos, stores, mock data
- Pantalla de login completa con teclado virtual
- Layout principal (sidebar, topbar, dark mode, sonidos)
- Dashboard con estadísticas
- Pantalla de cobro POS completa
- ✅ CORREGIDO: Persistencia de cajeros en Supabase (RLS, Auth, sincronización)
- ✅ CORREGIDO: Creación de usuarios con registro en Supabase Auth + usuarios_farmacia
- ✅ CORREGIDO: Edición de perfil con sincronización inmediata a Supabase

### Fase 1.5: Gestión de Cajeros — CRUD Base 🆕 ✅ COMPLETADO
- Página `/cajeros` con tabla completa (código único, nombre, sucursal, estado, fecha)
- Identificador único CAJ-00001 generado automáticamente al crear cajeros
- Crear, editar y activar/desactivar cajeros desde panel admin
- Sincronización completa con Supabase (Auth + usuarios_farmacia)
- Nuevo campo `codigo_cajero` en tabla `usuarios_farmacia`
- Feedback visual en operaciones (banners success/error)

### Fase 2: Gestión (Productos, Cajeros, Sucursales)
- CRUD completo de productos con importación Excel
- CRUD de cajeros y sucursales
- Consulta de stock entre sucursales

### Fase 3: Reportes + Exportación
- Reportes exportables a PDF y Excel
- Historial de ventas del cajero

### Fase 4: Impresión y NCF
- Ticket 80mm optimizado
- QR de verificación DGII
- Configuración de secuencias NCF
