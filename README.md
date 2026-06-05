# Next.js Tailwind MongoDB App

This is a container-ready Next.js application using Tailwind CSS and MongoDB. It exposes a small message board UI backed by `/api/messages`.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `MONGODB_URI` to a reachable MongoDB connection string before using the message board.

## Container build

```bash
docker build -t ghcr.io/your-org/nextjs-webapp:latest .
docker push ghcr.io/your-org/nextjs-webapp:latest
```

The Docker image uses Next.js standalone output and runs as a non-root user on port `3000`.

## Kubernetes and Istio deployment

Update these placeholders before deploying:

- `k8s/deployment.yaml`: replace `ghcr.io/your-org/nextjs-webapp:latest` with your image.
- `k8s/secret.example.yaml`: replace `MONGODB_URI` with your production MongoDB URI.
- `k8s/istio-gateway.yaml` and `k8s/istio-virtualservice.yaml`: replace `nextjs.example.com` with your host.

Create the MongoDB secret, then apply the app resources:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.example.yaml
kubectl apply -k k8s
```

Traffic enters through the Istio ingress gateway, matches the configured host, and routes to the `nextjs-webapp` Kubernetes Service.
