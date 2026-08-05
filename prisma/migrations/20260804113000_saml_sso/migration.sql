CREATE TABLE "saml_request_cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_request_cache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "saml_request_cache_expires_at_idx" ON "saml_request_cache"("expires_at");

CREATE TABLE "saml_response_replays" (
    "response_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_response_replays_pkey" PRIMARY KEY ("response_hash")
);

CREATE INDEX "saml_response_replays_expires_at_idx" ON "saml_response_replays"("expires_at");
