-- CreateTable
CREATE TABLE "ai_usage" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "backend" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "cost_usd" DECIMAL(12,8) NOT NULL DEFAULT 0,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ai_usage_backend_created_at" ON "ai_usage"("backend", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_usage_user_created_at" ON "ai_usage"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

