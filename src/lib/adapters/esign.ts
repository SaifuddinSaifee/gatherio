/**
 * Interface only — no implementation in Phase 1a (roadmap seams: Signing).
 * `signature_envelope` (src/db/schema/signature.ts) already mirrors this
 * shape so a provider integration is a driver file plus a webhook route,
 * not a schema change.
 *
 * For India, statutory eSign (Aadhaar, DSC) requires a CCA-empanelled
 * provider (Digio/Leegality) — this is a regulatory fact, not an
 * implementation preference, so no driver here may attempt to construct
 * that flow itself. See the plan's "Aadhaar" roadmap-seam note: Gather
 * never stores an Aadhaar number: only the provider's envelope reference
 * and evidence artifact are persisted.
 */
export type SignatureStatus = 'not_sent' | 'opened' | 'signed' | 'declined' | 'voided' | 'expired';

export interface ESignAdapter {
  createEnvelope(params: {
    documentAssetKey: string;
    signerEmail: string;
    signerName: string;
  }): Promise<{ providerEnvelopeId: string }>;

  getStatus(providerEnvelopeId: string): Promise<{ status: SignatureStatus }>;

  /** Called from the provider's webhook handler once a route exists for it. */
  handleWebhookEvent(payload: unknown): Promise<{ providerEnvelopeId: string; status: SignatureStatus }>;
}

export async function getESignAdapter(): Promise<ESignAdapter> {
  throw new Error(
    'No ESignAdapter is implemented yet. Signing is a Phase 2 roadmap seam — see the plan.',
  );
}
