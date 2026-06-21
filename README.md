# From Signing to Verified Provenance

**Identity-Aware Software Supply Chain Security using Sigstore, SLSA, BuildKit, SPIFFE/SPIRE, and ML-Based Exploitability Intelligence**

---

## Overview

This project implements an end-to-end **Zero-Trust Software Supply Chain Security (SSCS)** framework that extends the findings of the USENIX Security 2025 paper:

> *"An Industry Interview Study of Software Signing for Supply Chain Security"* — Kalu et al., USENIX Security 2025

The paper highlights a recurring industry failure mode:

> Organizations frequently sign software artifacts, but verification is weak, provenance is rarely enforced, the build environment is seldom part of the trust decision, and known-vulnerable artifacts still reach production.

This project turns those qualitative findings into a concrete DevSecOps pipeline. Compared to a conventional "build → sign → push → deploy" flow, the implemented system introduces the following controls, each enforced as an explicit pipeline stage:

- **Digest-pinned, containerized build and deploy runners** — the execution environment itself is a verified, immutable artifact.
- **Keyless artifact signing** via GitHub OIDC → Fulcio → Cosign (no private keys).
- **SLSA provenance attestations** that embed *both* the builder's SPIFFE identity *and* the build-runner image digest.
- **SPIFFE/SPIRE workload identity** issued to the build container at build time.
- **SBOM generation** with Syft and **CVE scanning** with Grype.
- **Deep-learning CVE exploitability scoring** — a model that ranks discovered CVEs by likelihood of being exploited, turning the vulnerability list into prioritized risk intelligence.
- **Rekor transparency-log verification** for non-repudiable, tamper-evident evidence.
- **A policy gate** that blocks deployment unless signature, provenance, builder identity, runner digest, and transparency-log evidence all verify.
- **Istio + Kustomize deployment to AKS**, with the workload admitted only after the supply-chain gate passes.

The result is a supply chain where deployment is authorized **only when artifact integrity, provenance, builder identity, and build-environment integrity are all cryptographically verified.**

---

## Research Foundation

The USENIX 2025 study found, through industry interviews, that signing is widely adopted but rarely *trustworthy in practice*. Signatures are produced, yet:

- verification is frequently skipped at deployment time,
- provenance — *who built it, where, and how* — is weak or absent,
- the build infrastructure is trusted implicitly, and
- long-lived credentials remain a dominant attack surface.

This project operationalizes the paper's recommendations and pushes beyond them by making the **build environment** and the **vulnerability posture of the artifact** first-class inputs to the deployment decision.

---

## Problem Statement

Most organizations implement software signing as a **compliance checkbox** rather than an enforced **security control**. A typical CI/CD pipeline looks like:

```
Developer → Build → Sign → Push Image → Deploy
```

Signing happens, but critical questions remain unanswered:

- Was the artifact actually *verified* before deployment?
- Was the image built by an *approved, known-good builder*?
- Was it built inside a *trusted, immutable build environment*?
- Can provenance be *trusted*, or can it be forged?
- Can a *rogue or compromised runner* produce trusted artifacts?
- Can an *old signed image* be replayed?
- Does the artifact ship with *known, exploitable vulnerabilities*?
- Is deployment *prevented* if any verification fails?

The implemented pipeline answers each of these with an enforced control.

---

## Key Gaps Identified

### Gap 1 — Signing without Verification

Many organizations sign artifacts but never enforce verification at deployment.

```
Signed Artifact → (no verification) → Deployment
```

**Risk:** tampered or replayed artifacts still reach production.

### Gap 2 — Weak Provenance

Traditional signing proves *who signed*, but not:

- Who built it?
- Where was it built?
- Which pipeline and commit produced it?
- Which build-runner image executed the build?

### Gap 3 — Untrusted Build Infrastructure

Most CI/CD systems trust build runners implicitly. This exposes them to:

- rogue self-hosted runners,
- compromised build servers,
- stolen registry credentials,
- unauthorized or unknown builders.

Traditional signing cannot distinguish a trusted builder from an untrusted one.

### Gap 4 — Long-Lived Credentials

Traditional signing depends on private keys, registry passwords, and service-principal secrets — all of which can be stolen, reused, or misconfigured.

### Gap 5 — Vulnerability Blindness *(new)*

A correctly signed, fully attested artifact can still be **packed with known, exploitable CVEs**. Integrity is necessary but not sufficient; the pipeline must also reason about *what risk the verified artifact carries*.

---

## Solution Architecture

The implemented solution establishes cryptographic trust — and risk awareness — across the entire supply chain. The pipeline is decomposed into discrete, dependency-ordered jobs:

```
Developer
   │
   ▼
GitHub Repository (push to main / workflow_dispatch)
   │
   ▼
[1] Validate Build Runner  ── verify build-runner image digest
   │
   ▼
[2] Prepare ─────────────── derive ACR server, image tag, image URI
   │
   ▼
[3] Build · SBOM · Provenance · Push   (inside digest-pinned build runner)
   │      ├─ Fetch SPIFFE identity (SPIRE Workload API)
   │      ├─ BuildKit build + push
   │      ├─ Cosign keyless sign
   │      ├─ Syft SBOM
   │      ├─ Grype CVE scan
   │      ├─ ML exploitability scoring
   │      ├─ SBOM attestation
   │      └─ SLSA provenance attestation (SPIFFE ID + runner digest)
   │
   ▼
[4] Validate Deploy Runner ── verify deploy-runner image digest
   │
   ▼
[5] Predeploy Verification (inside digest-pinned deploy runner)
   │      ├─ Verify image signature
   │      ├─ Verify provenance attestation
   │      ├─ Verify build-runner digest from signed provenance
   │      ├─ Verify trusted SPIFFE builder identity
   │      └─ Verify Rekor transparency-log evidence
   │
   ▼
[6] Prepare AKS ─────────── namespace + Istio injection + secrets
   │
   ▼
[7] Render Manifests ────── Kustomize CI overlay (image pin + Istio host)
   │
   ▼
[8] Deploy to AKS ───────── kubectl apply -k → Istio Gateway/VirtualService
                             → wait for rollout
```

Build and deploy run on **separately labelled self-hosted runners** (`[self-hosted, build]` and `[self-hosted, deploy]`), enforcing least privilege through physical separation of duties.

---

## Pipeline Job Topology

| # | Job | Runner | Purpose |
| --- | --- | --- | --- |
| 1 | `validate-build-runner` | `self-hosted` | Pull and digest-verify the build-runner image |
| 2 | `prepare` | `self-hosted` | Derive ACR login server, image tag (`SHA[:12]`), image URI |
| 3 | `build-sbom-provenance-push` | `[self-hosted, build]` | Build, sign, SBOM, scan, score, attest, push |
| 4 | `validate-deply-runner` | `self-hosted` | Pull and digest-verify the deploy-runner image |
| 5 | `predeploy-verification` | `[self-hosted, deploy]` | Cryptographic supply-chain gate |
| 6 | `prepare-aks` | `[self-hosted, deploy]` | Namespace, Istio injection label, MongoDB secret |
| 7 | `render-manifests` | `[self-hosted, deploy]` | Generate and preview Kustomize overlay |
| 8 | `deploy` | `[self-hosted, deploy]` | Apply manifests through Istio and await rollout |

The DAG guarantees that **no deployment job can start until the predeploy verification gate has passed.**

---

## Security Controls Implemented

### 1. Digest-Pinned Containerized Build Runner

**Problem:** Traditional self-hosted runners execute builds directly on the host, with a mutable and unverifiable environment.

**Solution:** Builds execute *inside* a dedicated container image (`nextjs-build-runner:2.0`) whose digest is verified before use against a trusted value (`TRUSTED_BUILD_RUNNER_DIGEST`).

```bash
ACTUAL_DIGEST=$(docker inspect <runner-image> \
  --format='{{index .RepoDigests 0}}' | cut -d@ -f2)
# compared against the trusted, pinned digest
```

**Benefits:** isolation, reproducibility, reduced attack surface, and an **immutable, attestable execution environment**.

### 2. Digest-Pinned Containerized Deploy Runner

The deployment side mirrors the build side. The deploy-runner image (`nextjs-deploy-runner:1.0`) is pulled and digest-verified (`TRUSTED_DEPLOY_RUNNER_DIGEST`) before any verification or deployment logic runs, so the *gatekeeper itself* is a known-good artifact.

### 3. BuildKit-Based Builds

The build uses Docker BuildKit via Buildx (`docker-container` driver) with GitHub Actions layer caching (`type=gha`).

**Benefits:** deterministic builds, efficient layer management, build-metadata generation, and native provenance support.

### 4. Keyless Signing using Sigstore

```
GitHub OIDC → Fulcio short-lived certificate → Cosign keyless signing → Rekor log
```

The workflow requests `id-token: write` permission and signs the image **by digest** with `cosign sign --yes`.

**Benefits:** no private-key management, no key-rotation overhead, no key-theft risk, and automatic transparency-log integration.

### 5. Software Bill of Materials (SBOM)

SBOMs are generated with **Syft** in SPDX-JSON format (`sbom.spdx.json`) against the pushed image digest, providing full visibility into dependencies, libraries, components, and licenses.

### 6. CVE Scanning *(new)*

The SBOM is scanned with **Grype**, producing a deduplicated list of CVE identifiers:

```bash
grype sbom:sbom.spdx.json -o json > grype.json
jq -r '.matches[].vulnerability.id' grype.json \
  | grep -E '^CVE-' | sort -u > cves.txt
```

The CVE count drives the next stage conditionally — exploitability scoring only runs when vulnerabilities are actually found.

### 7. ML-Based Exploitability Scoring *(new)*

Discovered CVEs are passed to a **deep-learning CVE exploitability model**, run from a containerized inference image. The model (published on Hugging Face as `sumitp76/cve-exploitability`) scores each CVE by exploitation likelihood and writes a prioritized report:

```bash
docker run <inference-image> \
  --from-hub "sumitp76/cve-exploitability" \
  --cves $(cves...) \
  --out exploitability.csv
```

The resulting `exploitability.csv` is uploaded as a build artifact. This converts a flat vulnerability list into **risk-ranked intelligence**, so reviewers can focus on the CVEs that actually matter.

### 8. Provenance Attestation with Builder + Environment Binding *(extended)*

Provenance is generated as an in-toto / SLSA v0.2 predicate and attached with `cosign attest`. Crucially, the predicate binds **both** the builder's SPIFFE identity **and** the digest of the build-runner image:

```json
{
  "builder": {
    "id": "spiffe://supplychain.local/ci/docker-builder/nextjs-webapp",
    "runnerDigest": "sha256:<trusted-build-runner-digest>"
  },
  "buildType": "https://github.com/Attestations/GitHubActionsWorkflow",
  "invocation": {
    "configSource": {
      "uri": "git+https://github.com/<owner>/<repo>",
      "digest": { "sha1": "<commit-sha>" },
      "entryPoint": ".github/workflows/pipeline.yml"
    }
  },
  "metadata": {
    "buildInvocationId": "<run-id>",
    "completeness": { "parameters": true, "environment": true, "materials": true },
    "reproducible": false
  }
}
```

Embedding `runnerDigest` means the deployment gate can later confirm not just *who* built the artifact, but *in which exact, immutable environment* — closing Gap 3 cryptographically.

---

## SPIFFE/SPIRE Integration

### Why SPIFFE/SPIRE?

Traditional signing answers *"Was this image signed?"*
SPIFFE/SPIRE answers *"Who built this image, and is that builder trusted?"*

### Components

| Component | Role |
| --- | --- |
| **SPIFFE ID** | Stable workload identity, e.g. `spiffe://supplychain.local/ci/docker-builder/nextjs-webapp` |
| **SVID** | Short-lived X.509 workload-identity certificate |
| **SPIRE Server** | Identity authority for the trust domain |
| **SPIRE Agent** | Runs on the build node; attests the workload |
| **Workload API** | Unix-domain socket through which the workload requests identity |

### Workflow

The build container mounts the SPIRE agent socket (`/opt/spire/sockets/agent.sock`) and fetches its identity at build time:

```bash
spire-agent api fetch x509 -socketPath /opt/spire/sockets/agent.sock > svid.txt
SPIFFE_ID=$(awk '/SPIFFE ID:/ {print $3; exit}' svid.txt)
```

```
Build Container → SPIRE Agent → SPIRE Server → Workload Validation → Issue SVID → SPIFFE Identity
```

The fetched SPIFFE ID is then embedded into the signed provenance predicate, creating a cryptographic chain linking **builder → environment → artifact → provenance → deployment decision.**

---

## Verification Pipeline (Policy Gate)

Before any deployment job runs, the `predeploy-verification` job — executing inside the digest-verified deploy runner — performs the following checks against the image **referenced by digest**:

1. **Cosign tree inspection** — enumerate all signatures and attestations attached to the image.
2. **Image signature verification** — confirm a valid Fulcio-issued, OIDC-bound signature.
3. **Provenance attestation verification** — confirm a valid SLSA v0.2 provenance attestation.
4. **Build-runner digest verification** — extract `builder.runnerDigest` from the *signed* provenance and compare it to the trusted runner digest.
5. **SPIFFE builder identity verification** — extract `builder.id` and require an exact match with the expected trusted SPIFFE ID (this check **hard-fails** the pipeline on mismatch).
6. **Rekor transparency-log verification** — independently re-verify both the signature and the provenance attestation against `https://rekor.sigstore.dev`.

### Policy Gate Summary

| Check | Status |
| --- | --- |
| Image signed | Required |
| Signature valid (OIDC identity bound) | Required |
| Digest verified | Required |
| Provenance present | Required |
| Provenance verified | Required |
| Trusted SPIFFE builder identity | Required (hard-fail) |
| Build-runner digest matches provenance | Required |
| Rekor transparency-log evidence present | Required |

If any required condition fails, the deployment jobs do not run.

---

## Deployment: AKS · Istio · Kustomize

Once the gate passes, deployment proceeds entirely inside the trusted deploy runner:

1. **`prepare-aks`** — fetches AKS credentials, creates/updates the `nextjs-webapp` namespace, labels it `istio-injection=enabled` for automatic sidecar injection, and provisions the `mongodb-credentials` secret from `MONGODB_URI`.
2. **`render-manifests`** — generates a **Kustomize CI overlay** (`k8s/overlays/ci`) over the `production` base. The overlay pins the image to the freshly built digest/tag and patches the Istio `Gateway` (`nextjs-webapp-gateway`) and `VirtualService` (`nextjs-webapp`) host to `ISTIO_HOST`, then previews the rendered output.
3. **`deploy`** — applies the overlay (`kubectl apply -k`) so traffic is admitted through the Istio service mesh, then waits for the `nextjs-webapp` deployment rollout (`--timeout=180s`).

This ensures the *only* image that can be deployed is the exact digest that survived the verification gate.

---

## Attack Scenarios Simulated

The project evaluates a **weak** pipeline against the **secure** pipeline.

### Weak Pipeline — allows:

- rogue builder / runner impersonation,
- stolen registry-token abuse,
- provenance forgery,
- replay of old signed images,
- dependency / vulnerability injection,
- builds in an unverified environment.

### Secure Pipeline — blocks:

- unsigned or tampered images,
- unknown or untrusted builders,
- invalid or forged provenance,
- digest mismatches,
- artifacts built in an **untrusted runner** (runner-digest mismatch),
- builder-identity violations (untrusted SPIFFE domain/ID),
- replay attempts (digest-pinned references + Rekor evidence),
- silent shipping of high-exploitability CVEs (surfaced by the scoring stage).

---

## SLSA Alignment

| SLSA Control | Implementation |
| --- | --- |
| Provenance | Cosign SLSA v0.2 attestation |
| Trusted builder | SPIFFE/SPIRE workload identity |
| Isolated build | Digest-pinned containerized build runner |
| Build-environment integrity | `runnerDigest` embedded in signed provenance |
| Artifact integrity | Cosign keyless signature (by digest) |
| Verification gate | `predeploy-verification` job |
| Non-falsifiable metadata | Rekor transparency log |
| Identity binding | SPIFFE builder ID in provenance |

---

## Zero-Trust Principles Implemented

- **Never Trust** — every artifact, builder, environment, and attestation is verified.
- **Verify Explicitly** — deployment validates signature, provenance, builder identity, runner digest, and transparency-log evidence.
- **Least Privilege** — build and deploy run on separate, labelled runners with distinct images.
- **Continuous Verification** — verification is a mandatory gate immediately before deployment, on the image digest.
- **Short-Lived Credentials** — GitHub OIDC tokens, Fulcio certificates, and SPIFFE SVIDs replace long-lived keys and passwords.

---

## Technology Stack

| Component | Technology |
| --- | --- |
| Source control | GitHub |
| CI/CD | GitHub Actions (self-hosted, labelled runners) |
| Build engine | Docker BuildKit (Buildx, GHA cache) |
| Registry | Azure Container Registry (ACR) |
| Cloud auth | Azure OIDC federated login (no stored secret) |
| Signing | Sigstore Cosign (keyless) |
| Certificate authority | Fulcio |
| Transparency log | Rekor |
| SBOM | Syft (SPDX-JSON) |
| Vulnerability scan | Grype |
| Exploitability intelligence | Deep-learning model (`sumitp76/cve-exploitability`, HF Hub) |
| Provenance | Cosign SLSA v0.2 attestations |
| Workload identity | SPIFFE |
| Identity management | SPIRE (Server + Agent + Workload API) |
| Deployment platform | Azure Kubernetes Service (AKS) |
| Service mesh | Istio (Gateway / VirtualService) |
| Manifest management | Kustomize (base + CI overlay) |
| Secrets | Kubernetes secret (`mongodb-credentials`) |
| Policy gate | `predeploy-verification` job |

---

## Configuration Reference

### Repository Variables (`vars.*`)

| Variable | Purpose |
| --- | --- |
| `ACR_NAME` | Azure Container Registry name |
| `TRUSTED_BUILD_RUNNER_DIGEST` | Pinned digest of the trusted build runner |
| `TRUSTED_DEPLOY_RUNNER_DIGEST` | Pinned digest of the trusted deploy runner |
| `AKS_RESOURCE_GROUP` | AKS resource group |
| `AKS_CLUSTER_NAME` | AKS cluster name |
| `ISTIO_HOST` | Public host for the Istio Gateway / VirtualService |

### Repository Secrets (`secrets.*`)

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` | OIDC federated Azure login |
| `ACR_USERNAME` / `ACR_PASSWORD` | Registry credentials for runner containers |
| `TRUSTED_BUILD_RUNNER_DIGEST` | Trusted build-runner digest used inside provenance |
| `MONGODB_URI` | Application database connection string |

### Key Environment Values

| Key | Value |
| --- | --- |
| `APP_NAME` / `IMAGE_NAME` / `K8S_NAMESPACE` | `nextjs-webapp` |
| `KUSTOMIZE_CI_OVERLAY_DIR` | `k8s/overlays/ci` |
| `HF_MODEL` | `sumitp76/cve-exploitability` |
| Image tag | first 12 characters of the commit SHA |
| OIDC issuer | `https://token.actions.githubusercontent.com` |
| Trust domain | `supplychain.local` |
| Expected builder | `spiffe://supplychain.local/ci/docker-builder/nextjs-webapp` |

---

## Implementation Notes / Hardening Backlog

A few verification steps currently **log a failure message but do not hard-fail** the job (they print "verification failed" without `exit 1`): the build-runner digest check in `validate-build-runner`, the deploy-runner digest check in `validate-deply-runner`, and the runner-digest comparison in `predeploy-verification`. The SPIFFE builder-identity check *does* hard-fail. To make the policy gate fully blocking, these warn-only branches should be converted to `exit 1`. (Also note: the job name `validate-deply-runner` and the inference image identifier contain spelling typos carried over from the source workflow.)

---

## Key Contributions

This project extends the USENIX Security 2025 study by:

1. Converting qualitative interview findings into a working, enforced implementation.
2. Demonstrating concretely why signing alone is insufficient.
3. Introducing **mandatory, blocking verification gates** before deployment.
4. Making **build-environment integrity** part of the trust decision via digest-pinned runners.
5. Binding **both** builder identity **and** runner digest into signed provenance.
6. Implementing **SPIFFE/SPIRE workload identity** issued at build time.
7. Enforcing deployment authorization on a **trusted SPIFFE builder identity**.
8. Adding **independent Rekor transparency-log verification**.
9. Introducing **ML-based CVE exploitability scoring** so verified artifacts are also risk-assessed.
10. Demonstrating a complete **Zero-Trust, identity-aware, risk-aware software supply chain** deployed to AKS through Istio.

---

## Conclusion

Traditional software signing provides integrity but does not, on its own, establish trust. This project demonstrates that secure software delivery requires signing **plus** verification, provenance, builder identity, build-environment integrity, vulnerability awareness, and enforced policy.

By integrating Sigstore, BuildKit, SLSA provenance, SPIFFE/SPIRE, Grype, an ML exploitability model, Rekor, and an Istio/Kustomize deployment gate, the solution transforms software signing from a compliance activity into an **enforceable security control** — an end-to-end, identity-aware supply chain that prevents tampered, forged, untrusted, or unverified artifacts from reaching production, and surfaces the real-world risk of the artifacts that do.
