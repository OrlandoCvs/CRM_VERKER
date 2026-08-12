-- Baja voluntaria de leads.
--
-- Dos columnas opcionales: no hay riesgo para los datos existentes, que
-- quedan con NULL (= nadie dado de baja hasta que alguien lo solicite).
--
--   unsubscribedAt    → cuándo pidió la baja. NULL = sigue siendo contactable.
--   unsubscribeSource → cómo se dio de baja (enlace del correo, a mano…),
--                       útil para justificar la baja si alguien reclama.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "unsubscribedAt" TIMESTAMP(3),
ADD COLUMN     "unsubscribeSource" TEXT;

-- El envío filtra por este campo en cada campaña, así que conviene indexarlo.
-- CreateIndex
CREATE INDEX "Lead_unsubscribedAt_idx" ON "Lead"("unsubscribedAt");
