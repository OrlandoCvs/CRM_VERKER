import { getEmailStatus } from '@/lib/email'

// Indica a la UI si el envío de correo está configurado y con qué proveedor.
export async function GET() {
  return Response.json(getEmailStatus())
}
