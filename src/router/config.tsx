import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Layout } from "@/components/feature/Layout";
import NotFound from "@/pages/NotFound";
import LoginPage from "@/pages/login/page";
import ConsultaSeguroPage from "@/pages/consulta-seguro/page";
import PanelPage from "@/pages/panel/page";
import PagoPage from "@/pages/pago/page";
import ProductosPage from "@/pages/productos/page";
import ReportesPage from "@/pages/reportes/page";
import ConfiguracionPage from "@/pages/configuracion/page";
import ProveedoresPage from "@/pages/proveedores/page";
import CajerosPage from "@/pages/cajeros/page";
import ComprasPage from "@/pages/compras/page";
import VencimientosPage from "@/pages/vencimientos/page";
import ListaInteresPage from "@/pages/lista-interes/page";
import BuscarFacturaPage from "@/pages/buscar-factura/page";
import ReembolsosPage from "@/pages/reembolsos/page";
import PlasticosSegurosPage from "@/pages/plasticos-seguros/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Navigate to="/acceso" replace />,
  },
  {
    path: "/acceso",
    element: <LoginPage />,
  },
  {
    path: "/consulta-seguro",
    element: <ConsultaSeguroPage />,
  },
  {
    path: "/",
    element: <Layout />,
    children: [
      { path: "panel", element: <PanelPage /> },
      { path: "pago", element: <PagoPage /> },
      { path: "productos", element: <ProductosPage /> },
      { path: "reportes", element: <ReportesPage /> },
      { path: "configuracion", element: <ConfiguracionPage /> },
      { path: "proveedores", element: <ProveedoresPage /> },
      { path: "cajeros", element: <CajerosPage /> },
      { path: "compras", element: <ComprasPage /> },
      { path: "vencimientos", element: <VencimientosPage /> },
      { path: "lista-interes", element: <ListaInteresPage /> },
      { path: "buscar-factura", element: <BuscarFacturaPage /> },
      { path: "reembolsos", element: <ReembolsosPage /> },
      { path: "plasticos-seguros", element: <PlasticosSegurosPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
