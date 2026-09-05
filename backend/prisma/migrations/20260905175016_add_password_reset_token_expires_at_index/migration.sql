-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_expires_at" ON "password_reset_tokens"("expires_at");
