# Capstone Task Tracker (base app)

A deliberately small 3-tier app — static HTML/JS frontend, Node/Express backend,
Postgres database — meant to be reused across all three capstone projects
(Kubernetes/EKS, multi-cloud failover, serverless).

## Run it locally right now

Requirements: Docker + Docker Compose installed.

```bash
cd todo-app
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend directly: http://localhost:3000/api/tasks
- Health checks: http://localhost:3000/healthz and /readyz

Add a task in the browser, refresh, delete one — confirm it's actually
hitting Postgres (data survives a `docker compose restart`).

## Push images to a registry (needed for Project 1 / EKS)

```bash
docker build -t <your-dockerhub-or-ecr>/todo-backend:v1 ./backend
docker build -t <your-dockerhub-or-ecr>/todo-frontend:v1 ./frontend
docker push <your-dockerhub-or-ecr>/todo-backend:v1
docker push <your-dockerhub-or-ecr>/todo-frontend:v1
```

For ECR specifically:
```bash
aws ecr create-repository --repository-name todo-backend
aws ecr create-repository --repository-name todo-frontend
aws ecr get-login-password --region <your-region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<your-region>.amazonaws.com
```

## Next steps (Project 1 - Kubernetes on EKS)

1. Create the cluster: `eksctl create cluster --name capstone-cluster --region <region> --nodes 2 --node-type t3.small`
2. Write Kubernetes manifests: Deployment + Service for backend, Deployment + Service
   for frontend, ConfigMap for non-secret env vars, Secret for DB credentials,
   Ingress routing `/api` to the backend service and `/` to the frontend service
   (mirrors the nginx.conf logic here), HPA on the backend Deployment.
3. `/healthz` and `/readyz` are already wired up — use them directly as
   `livenessProbe` / `readinessProbe` in the backend Deployment spec.
4. Use RDS (managed Postgres) instead of a Pod for the database in the cluster —
   simpler, and closer to what a real deployment would use.

## Known limitations (mention in your report)

- No auth on the API — fine for this demo scope, call it out explicitly.
- Single replica DB with no managed backups in local dev — RDS should be used
  in the cloud deployment instead of a self-hosted Postgres pod.
