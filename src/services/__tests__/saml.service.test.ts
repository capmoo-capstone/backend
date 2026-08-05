import { Profile } from '@node-saml/node-saml';
import { inflateRawSync } from 'zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from '../../test/prisma-mock';
import {
  createSamlLoginUrl,
  extractCuPortalClaims,
  getSamlMetadata,
  parseIdpMetadata,
  resetSamlClientForTest,
} from '../saml.service';

const idpMetadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="liferay-idp">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>MIIBfakeCertificate</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://portal.it.chula.ac.th/c/portal/saml/sso" />
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

const setSamlEnvironment = () => {
  process.env.SAML_SP_ENTITY_ID = 'nexusproc';
  process.env.SAML_SP_ACS_URL =
    'https://api.example.chula.ac.th/api/v1/auth/saml/acs';
  process.env.SAML_IDP_METADATA_URL = 'https://portal.it.chula.ac.th/metadata';
  process.env.SAML_IDP_ENTITY_ID = 'liferay-idp';
  process.env.SAML_FRONTEND_SUCCESS_URL = 'https://www.example.chula.ac.th/';
  process.env.SAML_FRONTEND_FAILURE_URL =
    'https://www.example.chula.ac.th/login?error=sso_failed';
};

describe('SAML service', () => {
  beforeEach(() => {
    setSamlEnvironment();
    resetSamlClientForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSamlClientForTest();
  });

  it('parses CU Portal signing metadata and prefers the redirect endpoint', () => {
    expect(parseIdpMetadata(idpMetadata, 'liferay-idp')).toEqual({
      entryPoint: 'https://portal.it.chula.ac.th/c/portal/saml/sso',
      certificates: ['MIIBfakeCertificate'],
    });
  });

  it('generates SP metadata with the configured entity ID', () => {
    const metadata = getSamlMetadata();

    expect(metadata).toContain('entityID="nexusproc"');
    expect(metadata).toContain('WantAssertionsSigned="true"');
  });

  it('starts a ForceAuthn request and persists its request ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue(null) },
        text: vi.fn().mockResolvedValue(idpMetadata),
      })
    );
    prismaMock.samlRequestCache.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.samlRequestCache.upsert.mockResolvedValue({});

    const url = await createSamlLoginUrl('api.example.chula.ac.th');

    expect(url).toMatch(
      /^https:\/\/portal\.it\.chula\.ac\.th\/c\/portal\/saml\/sso\?/
    );
    expect(url).toContain('SAMLRequest=');
    const encodedRequest = new URL(url).searchParams.get('SAMLRequest')!;
    const authnRequest = inflateRawSync(
      Buffer.from(encodedRequest, 'base64')
    ).toString('utf8');
    expect(authnRequest).toContain('ForceAuthn="true"');
    expect(prismaMock.samlRequestCache.upsert).toHaveBeenCalledOnce();
  });

  it('requires every CU Portal identity claim', () => {
    expect(
      extractCuPortalClaims({
        issuer: 'liferay-idp',
        nameID: 'staff.user',
        nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
        emailAddress: 'staff@chula.ac.th',
        firstName: 'Staff',
        lastName: 'User',
      } as Profile)
    ).toEqual({
      screenName: 'staff.user',
      emailAddress: 'staff@chula.ac.th',
      firstName: 'Staff',
      lastName: 'User',
    });

    expect(() =>
      extractCuPortalClaims({
        issuer: 'liferay-idp',
        nameID: 'staff.user',
        nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
        emailAddress: 'staff@chula.ac.th',
        firstName: 'Staff',
      } as Profile)
    ).toThrow('lastName');
  });
});
