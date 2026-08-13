-- Historial de búsquedas de prospectos (Google Places y LinkedIn).
--
-- Dos tablas nuevas; no se toca nada existente, así que no hay riesgo para los
-- datos actuales. Guardar los resultados evita depender del dataset de Apify,
-- que se borra a los pocos días en el plan gratuito, y permite decidir a quién
-- importar sin volver a pagar la búsqueda.

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'linkedin',
    "label" TEXT NOT NULL,
    "filters" TEXT,
    "runId" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT,
    "company" TEXT,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "linkedinUrl" TEXT,
    "photo" TEXT,
    "about" TEXT,
    "connections" INTEGER,
    "rating" DOUBLE PRECISION,
    "importedLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchResult_pkey" PRIMARY KEY ("id")
);

-- El historial se lista por fuente y fecha, y se purga por fecha.
-- CreateIndex
CREATE INDEX "SearchRun_source_createdAt_idx" ON "SearchRun"("source", "createdAt");

-- CreateIndex
CREATE INDEX "SearchRun_createdAt_idx" ON "SearchRun"("createdAt");

-- CreateIndex
CREATE INDEX "SearchResult_runId_idx" ON "SearchResult"("runId");

-- Al borrar una búsqueda (a mano o por antigüedad) se van sus resultados.
-- AddForeignKey
ALTER TABLE "SearchResult" ADD CONSTRAINT "SearchResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
