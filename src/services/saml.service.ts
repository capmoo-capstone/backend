import fs from 'fs';
import path from 'path';
import { Profile, SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import { XMLParser } from 'fast-xml-parser';
import { PrismaSamlRequestCache, claimSamlResponse } from '../utils/saml-cache';
import { ServiceUnavailableError, UnauthorizedError } from '../utils/errors';

const HTTP_REDIRECT_BINDING =
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';
const NAME_ID_UNSPECIFIED =
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified';
const DEFAULT_IDP_METADATA_URL =
  'https://portal.it.chula.ac.th/c/portal/saml/metadata';
const METADATA_TIMEOUT_MS = 10_000;
const MAX_METADATA_BYTES = 1_000_000;

type SamlRuntimeConfig = {
  spEntityId: string;
  idpEntityId: string;
  idpMetadataUrl: string;
  acsUrl: string;
  frontendRedirectUrl: string;
};

type IdpMetadata = {
  entryPoint: string;
  certificates: string[];
};

export type CuPortalClaims = {
  screenName: string;
  emailAddress: string;
  firstName: string;
  lastName: string;
};

let samlClientPromise: Promise<SAML> | undefined;

const asArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const requireHttpsUrl = (
  name: string,
  rawValue: string | undefined
): string => {
  if (!rawValue) {
    throw new ServiceUnavailableError(`${name} is not configured`);
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== 'https:') throw new Error('not HTTPS');
    return url.toString();
  } catch {
    throw new ServiceUnavailableError(`${name} must be a valid HTTPS URL`);
  }
};

const getRuntimeConfig = (): SamlRuntimeConfig => {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test' &&
    !process.env.VITEST
  ) {
    throw new ServiceUnavailableError(
      'SAML authentication is only enabled in production environment'
    );
  }

  const spEntityId = process.env.SAML_SP_ENTITY_ID || 'nexusproc';
  if (!/^[A-Za-z0-9]{8,10}$/.test(spEntityId)) {
    throw new ServiceUnavailableError(
      'SAML_SP_ENTITY_ID must contain 8-10 English letters or digits'
    );
  }

  const acsUrl = requireHttpsUrl(
    'SAML_SP_ACS_URL',
    process.env.SAML_SP_ACS_URL
  );

  return {
    spEntityId,
    idpEntityId: process.env.SAML_IDP_ENTITY_ID || 'liferay-idp',
    idpMetadataUrl: requireHttpsUrl(
      'SAML_IDP_METADATA_URL',
      process.env.SAML_IDP_METADATA_URL || DEFAULT_IDP_METADATA_URL
    ),
    acsUrl,
    frontendRedirectUrl: requireHttpsUrl(
      'SAML_FRONTEND_REDIRECT_URL',
      process.env.SAML_FRONTEND_REDIRECT_URL
    ),
  };
};

const findIdpEntityDescriptor = (
  value: unknown,
  expectedEntityId: string
): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findIdpEntityDescriptor(item, expectedEntityId);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (
    record.entityID === expectedEntityId &&
    record.IDPSSODescriptor !== undefined
  ) {
    return record;
  }

  for (const child of Object.values(record)) {
    const found = findIdpEntityDescriptor(child, expectedEntityId);
    if (found) return found;
  }

  return null;
};

const getTextValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(getTextValues);
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  if (typeof record['#text'] === 'string') return [record['#text']];
  return Object.values(record).flatMap(getTextValues);
};

export const parseIdpMetadata = (
  metadataXml: string,
  expectedEntityId: string
): IdpMetadata => {
  const parser = new XMLParser({
    attributeNamePrefix: '',
    ignoreAttributes: false,
    processEntities: false,
    removeNSPrefix: true,
  });
  const parsed = parser.parse(metadataXml);
  const entity = findIdpEntityDescriptor(parsed, expectedEntityId);

  if (!entity) {
    throw new ServiceUnavailableError(
      'Configured IdP entity was not found in SAML metadata'
    );
  }

  const descriptors = asArray(entity.IDPSSODescriptor).filter(
    (descriptor): descriptor is Record<string, unknown> =>
      !!descriptor && typeof descriptor === 'object'
  );
  const services = descriptors.flatMap((descriptor) =>
    asArray(descriptor.SingleSignOnService).filter(
      (service): service is Record<string, unknown> =>
        !!service && typeof service === 'object'
    )
  );
  const endpoint =
    services.find((service) => service.Binding === HTTP_REDIRECT_BINDING) ||
    services[0];

  if (!endpoint || typeof endpoint.Location !== 'string') {
    throw new ServiceUnavailableError(
      'SAML metadata does not contain an IdP single sign-on endpoint'
    );
  }

  const keyDescriptors: Record<string, unknown>[] = descriptors.flatMap(
    (descriptor) =>
      asArray<unknown>(descriptor.KeyDescriptor).filter(
        (key): key is Record<string, unknown> =>
          !!key && typeof key === 'object'
      )
  );
  const certificates = keyDescriptors
    .filter((key) => key.use === undefined || key.use === 'signing')
    .flatMap((key) => {
      const keyInfo = key.KeyInfo as Record<string, unknown> | undefined;
      const x509Data = keyInfo?.X509Data as Record<string, unknown> | undefined;
      return getTextValues(x509Data?.X509Certificate).map((certificate) =>
        certificate.replace(/\s+/g, '')
      );
    });

  if (certificates.length === 0) {
    throw new ServiceUnavailableError(
      'SAML metadata does not contain an IdP signing certificate'
    );
  }

  return {
    entryPoint: requireHttpsUrl('IdP SSO endpoint', endpoint.Location),
    certificates,
  };
};

const loadIdpMetadata = async (
  config: SamlRuntimeConfig
): Promise<IdpMetadata> => {
  try {
    const response = await fetch(config.idpMetadataUrl, {
      headers: {
        Accept: 'application/samlmetadata+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`metadata request failed with ${response.status}`);
    }

    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_METADATA_BYTES) {
      throw new Error('metadata response is too large');
    }

    const metadataXml = await response.text();
    if (metadataXml.length > MAX_METADATA_BYTES) {
      throw new Error('metadata response is too large');
    }

    return parseIdpMetadata(metadataXml, config.idpEntityId);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    console.error('Unable to load CU Portal SAML metadata', err);
    throw new ServiceUnavailableError('CU Portal SAML metadata is unavailable');
  }
};

const getSpKeyAndCert = () => {
  let privateKey = process.env.SAML_SP_PRIVATE_KEY;
  let cert = process.env.SAML_SP_CERT;

  if (!privateKey) {
    const defaultKeyPath = path.join(process.cwd(), 'certs', 'sp.key');
    if (fs.existsSync(defaultKeyPath)) {
      privateKey = fs.readFileSync(defaultKeyPath, 'utf8');
    }
  }

  if (!cert) {
    const defaultCertPath = path.join(process.cwd(), 'certs', 'sp.crt');
    if (fs.existsSync(defaultCertPath)) {
      cert = fs.readFileSync(defaultCertPath, 'utf8');
    }
  }

  return { privateKey, cert };
};

const createSamlClient = async (): Promise<SAML> => {
  const config = getRuntimeConfig();
  const idp = await loadIdpMetadata(config);
  const { privateKey } = getSpKeyAndCert();

  return new SAML({
    issuer: config.spEntityId,
    callbackUrl: config.acsUrl,
    entryPoint: idp.entryPoint,
    idpIssuer: config.idpEntityId,
    idpCert: idp.certificates,
    privateKey: privateKey ?? undefined,
    audience: config.spEntityId,
    identifierFormat: NAME_ID_UNSPECIFIED,
    allowCreate: false,
    forceAuthn: true,
    disableRequestedAuthnContext: true,
    wantAssertionsSigned: false,
    wantAuthnResponseSigned: true,
    validateInResponseTo: ValidateInResponseTo.always,
    cacheProvider: new PrismaSamlRequestCache(),
    acceptedClockSkewMs: 30000,
  });
};

const getSamlClient = async (): Promise<SAML> => {
  if (!samlClientPromise) {
    samlClientPromise = createSamlClient().catch((err) => {
      samlClientPromise = undefined;
      throw err;
    });
  }

  return samlClientPromise;
};

const getRequiredClaim = (value: unknown, claimName: string): string => {
  const values = asArray(value);
  if (values.length !== 1 || typeof values[0] !== 'string') {
    throw new UnauthorizedError(`Missing required SAML claim: ${claimName}`);
  }

  const normalized = values[0].trim();
  if (!normalized) {
    throw new UnauthorizedError(`Missing required SAML claim: ${claimName}`);
  }

  return normalized;
};

export const extractCuPortalClaims = (profile: Profile): CuPortalClaims => ({
  screenName: getRequiredClaim(
    profile.nameID || profile.screenName,
    'screenName'
  ),
  emailAddress: getRequiredClaim(profile.emailAddress, 'emailAddress'),
  firstName: getRequiredClaim(profile.firstName, 'firstName'),
  lastName: getRequiredClaim(profile.lastName, 'lastName'),
});

export const getSamlMetadata = (): string => {
  const config = getRuntimeConfig();
  const { cert } = getSpKeyAndCert();
  const validUntil = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const cleanCert = cert
    ? cert
        .replace(
          /-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|[\r\n]/g,
          ''
        )
        .trim()
    : '';

  const keyDescriptorXml = cleanCert
    ? `
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>${cleanCert}</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" validUntil="${validUntil}" cacheDuration="PT604800S" entityID="${config.spEntityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">${keyDescriptorXml}
    <md:NameIDFormat>${NAME_ID_UNSPECIFIED}</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${config.acsUrl}" index="1" isDefault="true"/>
    <md:AttributeConsumingService index="1">
      <md:ServiceName xml:lang="en">${config.spEntityId}</md:ServiceName>
      <md:ServiceDescription xml:lang="en">Nexus Procure SAML Service Provider</md:ServiceDescription>
      <md:RequestedAttribute Name="urn:oid:0.9.2342.19200300.100.1.3" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="email" isRequired="true"/>
      <md:RequestedAttribute Name="urn:oid:2.5.4.42" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="firstName"/>
      <md:RequestedAttribute Name="urn:oid:2.5.4.4" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="lastName"/>
      <md:RequestedAttribute Name="urn:oid:2.16.840.1.113730.3.1.241" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri" FriendlyName="screenName" isRequired="true"/>
    </md:AttributeConsumingService>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
};

export const createSamlLoginUrl = async (host: string | undefined) => {
  const saml = await getSamlClient();
  return saml.getAuthorizeUrlAsync('', host, {});
};

export const validateSamlResponse = async (
  encodedResponse: string
): Promise<CuPortalClaims> => {
  if (!encodedResponse || typeof encodedResponse !== 'string') {
    throw new UnauthorizedError('SAML response is missing');
  }

  const saml = await getSamlClient();
  const { profile, loggedOut } = await saml.validatePostResponseAsync({
    SAMLResponse: encodedResponse,
  });

  if (loggedOut || !profile) {
    throw new UnauthorizedError('SAML response did not authenticate a user');
  }

  await claimSamlResponse(encodedResponse);
  return extractCuPortalClaims(profile);
};

export const getSamlFrontendRedirectUrl = () =>
  getRuntimeConfig().frontendRedirectUrl;

export const resetSamlClientForTest = () => {
  samlClientPromise = undefined;
};
