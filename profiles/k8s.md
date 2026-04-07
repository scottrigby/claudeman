# k8s Profile

Installs kubectl and Helm for Kubernetes development inside claudeman.

## Kubeconfig Setup

Export a single cluster context securely into `.claude-config/` (gitignored, already mounted):

```bash
# Export a specific context (replace CONTEXT_NAME with your context)
kubectl config view --minify --flatten --context=CONTEXT_NAME > .claude-config/kubeconfig
```

### Container access

The kubeconfig API server address must be reachable from inside the container.
For local clusters (Kind, minikube, etc.), replace `127.0.0.1` with
`host.containers.internal` (Podman's bridge to the host):

```bash
CONTEXT_NAME=kind-k8laude
kubectl config view --minify --flatten --context=$CONTEXT_NAME \
  | sed -e 's/127.0.0.1/host.containers.internal/g' \
        -e 's/certificate-authority-data:.*/insecure-skip-tls-verify: true/' \
  > .claude-config/kubeconfig
```

`insecure-skip-tls-verify` is needed because local cluster certs are issued
for `127.0.0.1`, not `host.containers.internal`. For remote clusters (EKS,
GKE, etc.) this isn't needed — the API server address is already a public
hostname.

### Firewall

The API server hostname must be whitelisted. `host.containers.internal` is
already allowed by claudeman. For remote clusters, add the domain:

```bash
claudeman run --profile=k8s \
  --extra-domains your-cluster.region.eks.amazonaws.com \
  --env KUBECONFIG=/workspace/.claude-config/kubeconfig
```

## Usage

```bash
claudeman run --profile=k8s \
  --env KUBECONFIG=/workspace/.claude-config/kubeconfig
```

## What's installed

- `kubectl` (latest)
- `helm` (latest)
- Firewall domains for K8s and Helm doc sites, ArtifactHub for chart and plugin discovery, example chart registries
