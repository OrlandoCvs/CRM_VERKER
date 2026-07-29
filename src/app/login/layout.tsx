// La página de login no lleva el sidebar del CRM; este layout lo anula
// renderizando solo su contenido a pantalla completa.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-gray-50">{children}</div>
}
