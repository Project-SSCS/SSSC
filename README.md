# From Signing to Verified Provenance

**Identity-Aware Software Supply Chain Security using Sigstore, SLSA, BuildKit and SPIFFE/SPIRE**

## Overview

This project implements an end-to-end Software Supply Chain Security (SSCS) framework that extends the findings of the USENIX Security 2025 paper:

> *"An Industry Interview Study of Software Signing for Supply Chain Security"* — Kalu et al., USENIX Security 2025

The paper highlights a critical industry problem:

> Organizations frequently sign software artifacts, but verification is weak, provenance is not consistently enforced, and build environments are often not part of the trust decision.

This project transforms those qualitative findings into a practical DevSecOps implementation that introduces:

- Keyless artifact signing
- SLSA provenance attestations
- Containerized build environments
- Containerized deployment environments
- Policy-based deployment gates
- BuildKit-based builds
- SPIFFE/SPIRE workload identity
- Identity-aware provenance
- Cryptographic verification before deployment

The result is a **Zero-Trust Software Supply Chain** where deployment is allowed only when artifact integrity, provenance, and builder identity are verified.

## Problem Statement

Most organizations implement software signing as a compliance requirement rather than a security control.

Typical CI/CD pipelines follow:

```
Developer
  ↓
Build
  ↓
Sign
  ↓
Push Image
  ↓
Deploy
```

Although signing is performed, several questions remain unanswered:

- Was the artifact actually verified?
- Was the image built by an approved builder?
- Can provenance be trusted?
- Can a rogue build runner produce trusted artifacts?
- Can a compromised runner sign malicious software?
- Can an old signed image be replayed?
- Is deployment prevented if verification fails?

The USENIX paper found that software signing alone does not adequately address these concerns.

## Key Gaps Identified

### Gap 1 – Signing without Verification

Many organizations sign artifacts but do not enforce verification during deployment.

**Risk:**

```
Signed Artifact
  ↓
No Verification
  ↓
Deployment
```

Tampered artifacts may still reach production.

### Gap 2 – Weak Provenance

Traditional signing proves:

- Who signed?

but not:

- Who built?
- Where was it built?
- Which pipeline built it?

### Gap 3 – Untrusted Build Infrastructure

Most CI/CD systems trust build runners implicitly.

Examples:

- Rogue self-hosted runner
- Compromised build server
- Stolen registry credentials
- Unauthorized builder

Traditional signing cannot distinguish trusted and untrusted builders.

### Gap 4 – Long-Lived Credentials

Traditional signing relies on:

- Private keys
- Registry passwords
- Service principal secrets

These credentials can be:

- Stolen
- Reused
- Misconfigured

## Solution Architecture

The implemented solution introduces cryptographic trust across the entire software supply chain.

```
Developer
  ↓
GitHub Repository
  ↓
Containerized Build Runner
  ↓
SPIFFE/SPIRE Identity Issuance
  ↓
BuildKit Build
  ↓
SBOM Generation
  ↓
Provenance Generation
  ↓
Cosign Keyless Signing
  ↓
Azure Container Registry
  ↓
Containerized Deploy Runner
  ↓
Signature Verification
  ↓
Provenance Verification
  ↓
SPIFFE Builder Verification
  ↓
Policy Enforcement
  ↓
AKS Deployment
```

## Security Controls Implemented

### 1. Containerized Build Runner

**Problem:** Traditional self-hosted runners execute builds directly on the host.

**Solution:** Builds execute inside a dedicated container.

**Benefits:**

- Isolation
- Reproducibility
- Reduced attack surface
- Immutable execution environment

### 2. BuildKit-Based Builds

The pipeline uses Docker BuildKit.

**Benefits:**

- Deterministic builds
- Efficient layer management
- Build metadata generation
- Native support for provenance

### 3. Keyless Signing using Sigstore

Traditional:

```
Private Key
  ↓
Sign
```

Implemented:

```
GitHub OIDC
  ↓
Fulcio Certificate
  ↓
Cosign Keyless Signing
```

**Benefits:**

- No private key management
- No key rotation overhead
- No key theft risk
- Transparency log integration

### 4. Artifact Signing

Every image is signed.

Example:

```bash
cosign sign nextapp.azurecr.io/nextjs-webapp@sha256:<digest>
```

**Benefits:**

- Integrity verification
- Authenticity verification
- Tamper detection

### 5. Software Bill of Materials (SBOM)

SBOMs are generated using Syft.

**Purpose:** Provide visibility into:

- Dependencies
- Libraries
- Components
- Licenses

**Example:**

- Next.js
- React
- Node.js
- Express
- OpenSSL

### 6. Provenance Attestation

Provenance captures:

- Repository
- Commit SHA
- Workflow
- Build invocation
- Builder identity

**Example:**

```json
{
  "builder": {
    "id": "spiffe://supplychain.local/ci/docker-builder/nextjs-webapp"
  }
}
```

## SPIFFE/SPIRE Integration

### Why SPIFFE/SPIRE?

Traditional signing answers:

> Was this image signed?

SPIFFE/SPIRE answers:

> Who built this image?

### SPIFFE Components

**SPIFFE ID** — Example:

```
spiffe://supplychain.local/ci/docker-builder/nextjs-webapp
```

**SVID** — Short-lived workload identity certificate.

**SPIRE Server** — Acts as identity authority.

**SPIRE Agent** — Runs on the build node.

**Workload API** — Allows workloads to request identity.

### SPIFFE Workflow

```
Build Container
  ↓
Requests Identity
  ↓
SPIRE Agent
  ↓
SPIRE Server
  ↓
Workload Validation
  ↓
Issue SVID
  ↓
Return SPIFFE Identity
```

### Builder Identity Binding

The SPIFFE identity is embedded into signed provenance.

Example:

```json
{
  "builder": {
    "id": "spiffe://supplychain.local/ci/docker-builder/nextjs-webapp"
  }
}
```

This creates a cryptographic link between:

- Builder
- Artifact
- Provenance
- Deployment Decision

## Verification Pipeline

Before deployment the following checks occur.

### Signature Verification

```
Image
  ↓
Cosign Verify
```

Validates:

- Signature
- Signer identity
- Digest integrity

### Provenance Verification

```
Image
  ↓
Provenance
  ↓
Verification
```

Validates:

- Build source
- Commit
- Builder information

### SPIFFE Builder Verification

Validates that the builder belongs to a trusted SPIFFE trust domain.

Example:

```
spiffe://supplychain.local/ci/docker-builder/*
```

Deployment is rejected if provenance contains an untrusted builder.

### Policy Gate

Deployment is allowed only if:

| Check | Status |
| --- | --- |
| Image Signed | Required |
| Signature Valid | Required |
| Digest Verified | Required |
| Provenance Present | Required |
| Provenance Verified | Required |
| Trusted Builder | Required |
| Trusted SPIFFE Domain | Required |
| Identity Not Expired | Required |

## Attack Scenarios Simulated

The project evaluates both weak and secure pipelines.

### Weak Pipeline

Allowed:

- Rogue builder
- Runner impersonation
- Stolen registry token abuse
- Provenance forgery
- Replay attack
- Dependency injection

### Secure Pipeline

Blocked:

- Unsigned images
- Tampered images
- Unknown builders
- Invalid provenance
- Digest mismatch
- Rogue runner artifacts
- Replay attempts
- Builder identity violations

## SLSA Alignment

| SLSA Control | Implementation |
| --- | --- |
| Provenance | Cosign Attestations |
| Trusted Builder | SPIFFE/SPIRE |
| Isolated Build | Containerized Build Runner |
| Artifact Integrity | Cosign Signature |
| Verification Gate | Deployment Policy |
| Non-Falsifiable Metadata | Rekor Transparency Log |
| Identity Binding | SPIFFE Builder ID |

## Zero-Trust Principles Implemented

**Never Trust** — Everything is verified.

**Verify Explicitly** — Deployment validates:

- Signature
- Provenance
- Builder identity

**Least Privilege** — Separate:

- Build runner
- Deployment runner

**Continuous Verification** — Verification occurs before deployment.

**Short-Lived Credentials** — Implemented using:

- GitHub OIDC
- Fulcio certificates
- SPIFFE SVIDs

## Technology Stack

| Component | Technology |
| --- | --- |
| Source Control | GitHub |
| CI/CD | GitHub Actions |
| Build Engine | Docker BuildKit |
| Registry | Azure Container Registry |
| Signing | Sigstore Cosign |
| Transparency Log | Rekor |
| SBOM | Syft |
| Provenance | Cosign Attestations |
| Workload Identity | SPIFFE |
| Identity Management | SPIRE |
| Deployment Platform | AKS |
| Service Mesh | Istio |
| Policy Gate | Deployment Verification Logic |

## Key Contributions

This project extends the USENIX Security 2025 study by:

1. Converting qualitative findings into a practical implementation.
2. Demonstrating why signing alone is insufficient.
3. Introducing mandatory verification gates.
4. Introducing identity-aware provenance.
5. Binding builder identity into cryptographic attestations.
6. Implementing SPIFFE/SPIRE-based workload identity.
7. Enforcing deployment authorization based on trusted builder identity.
8. Demonstrating a Zero-Trust Software Supply Chain architecture.

## Conclusion

Traditional software signing provides integrity but does not fully establish trust.

This project demonstrates that secure software delivery requires:

- Signing
- Verification
- Provenance
- Builder identity
- Policy enforcement

By integrating Sigstore, BuildKit, SLSA provenance, SPIFFE/SPIRE, and deployment verification gates, the solution transforms software signing from a compliance activity into an enforceable security control.

The result is an end-to-end identity-aware software supply chain capable of preventing tampered, forged, or untrusted artifacts from reaching production.
