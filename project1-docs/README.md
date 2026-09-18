# Capstone Project 1: Scalable Web Application on Kubernetes (AWS EKS)

## Overview
A 3-tier task-tracker web application (static HTML/JS frontend, Node.js/Express
backend API, PostgreSQL database) containerized with Docker and deployed on a
managed Kubernetes cluster (Amazon EKS), with autoscaling, load balancing,
secrets management, monitoring, and an automated CI/CD pipeline.

## Business Problem
Demonstrates a production-style deployment pattern for a simple internal tool:
a small team task tracker that needs to stay available under variable load,
recover automatically from failures, and be redeployed safely and repeatably
without manual server management.

## Architecture
```
Internet
   |
AWS Application Load Balancer (via Kubernetes Ingress / AWS Load Balancer Controller)
   |
   +-- Frontend Service (2 pods, Nginx serving static files, reverse-proxies /api)
   |
   +-- Backend Service (2-6 pods, autoscaled by HPA on CPU, Node.js/Express API)
           |
           +-- Postgres (1 pod, backed by an EBS-provisioned PersistentVolume)

Supporting infrastructure:
- Amazon EKS cluster (3x t3.small managed worker nodes)
- Amazon ECR (container image registry)
- AWS Load Balancer Controller (provisions the ALB from the Ingress resource)
- Amazon EBS CSI driver (provisions persistent storage for Postgres)
- Kubernetes Secrets (database credentials)
- Horizontal Pod Autoscaler (backend, 2-6 replicas, 60% CPU target)
- Amazon CloudWatch Container Insights (metrics + logs)
- GitHub Actions (CI/CD: build -> push to ECR -> deploy to EKS)
```

## Technologies Used
- **Application**: Node.js, Express, PostgreSQL, vanilla HTML/CSS/JS, Nginx
- **Containers**: Docker, Docker Compose (local dev)
- **Orchestration**: Kubernetes (Amazon EKS), eksctl
- **Networking**: AWS Application Load Balancer, Kubernetes Ingress, VPC-CNI
- **Storage**: Amazon EBS (via the EBS CSI driver), Kubernetes PersistentVolumeClaim
- **CI/CD**: GitHub Actions
- **Monitoring**: Amazon CloudWatch Container Insights, metrics-server
- **IaC**: Terraform (see `/terraform`) describing the equivalent infrastructure;
  eksctl and the AWS CLI were used for the actual cluster provisioning in this
  submission (see note in Deployment Instructions)

## Prerequisites
- AWS account with billing enabled
- AWS CLI v2, configured (`aws configure`)
- `kubectl`, `eksctl`, `helm`, Docker Desktop installed
- A GitHub account and repository

## Installation Instructions (local)
```bash
git clone <this-repo-url>
cd todo-app
docker compose up --build
```
Visit `http://localhost:8080`.

## Deployment Instructions (AWS)
> Note: for this submission, the cluster and supporting AWS resources were
> provisioned interactively with `eksctl` and the AWS CLI rather than by
> running `terraform apply`. The `/terraform` folder documents the equivalent
> infrastructure as code and is a faithful, reviewable representation of what
> was built, but was not itself the exact command path executed end-to-end.
> To reproduce via the CLI path actually used:

1. Create ECR repositories and push images:
   ```bash
   aws ecr create-repository --repository-name todo-backend --region eu-central-1
   aws ecr create-repository --repository-name todo-frontend --region eu-central-1
   docker build -t <account-id>.dkr.ecr.eu-central-1.amazonaws.com/todo-backend:v1 ./backend
   docker build -t <account-id>.dkr.ecr.eu-central-1.amazonaws.com/todo-frontend:v1 ./frontend
   docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/todo-backend:v1
   docker push <account-id>.dkr.ecr.eu-central-1.amazonaws.com/todo-frontend:v1
   ```
2. Create the EKS cluster:
   ```bash
   eksctl create cluster --name capstone-cluster --region eu-central-1 --nodes 3 --node-type t3.small
   ```
3. Install the EBS CSI driver (for the database's persistent storage) and the
   AWS Load Balancer Controller (for the public Ingress) — see the full
   command sequence in `/docs/cluster-addons.md` (IAM role creation via
   `eksctl create iamserviceaccount`, then `eksctl create addon` / `helm install`).
4. Deploy the application:
   ```bash
   kubectl apply -f k8s/
   ```
5. Get the public URL:
   ```bash
   kubectl get ingress
   ```

To reproduce via Terraform instead:
```bash
cd terraform
terraform init
terraform apply
aws eks update-kubeconfig --name capstone-cluster --region eu-central-1
kubectl apply -f ../k8s/
```

## Testing Instructions
- **Local**: `docker compose up --build`, then add/complete/delete a task at
  `localhost:8080` and confirm it persists across a `docker compose restart`.
- **Pod failure resilience**: `kubectl delete pod <backend-pod-name>` while
  using the app — the app stays available and Kubernetes replaces the pod
  automatically (verified; see screenshots).
- **Autoscaling under load**: ran a busybox pod looping requests against the
  backend Service; HPA scaled the backend from 2 to 6 replicas as CPU usage
  rose above the 60% target, then scaled back down once load stopped
  (verified; see screenshots).
- **Rolling update**: pushed a bug-fix to `backend/server.js` (unhandled DB
  connection error was crashing the process) as `v2`, rolled it out with
  `kubectl set image`, and confirmed zero-downtime replacement of pods.

## Security Considerations
- Database credentials are stored as a Kubernetes Secret, not hard-coded.
- Container images are scanned on push (ECR scan-on-push enabled in the
  Terraform config).
- **Known limitation**: AWS CLI access for this submission used the AWS
  **root account's** access keys for expediency under a tight deadline. In a
  production setup this should be a dedicated IAM user (or OIDC-based GitHub
  Actions role) scoped to only ECR push and EKS deploy permissions —
  demonstrated conceptually in the CI/CD workflow's use of repository
  secrets rather than hard-coded credentials.
- The API itself has no authentication layer — acceptable for this demo
  scope, called out explicitly as a limitation rather than left implicit.
- Secrets are not committed to Git; they're injected via Kubernetes Secrets
  and, in CI/CD, via GitHub Actions repository secrets.

## Monitoring Strategy
Amazon CloudWatch Container Insights (installed via the
`amazon-cloudwatch-observability` EKS add-on) collects cluster, node, pod,
and container-level CPU/memory metrics and application logs automatically.
`metrics-server` is installed separately to feed live CPU metrics to the
Horizontal Pod Autoscaler.

## Cost Considerations
- EKS control plane: ~$0.10/hour (~$73/month if left running continuously)
- 3x t3.small worker nodes: ~$0.0208/hour each ~= $0.062/hour combined
- One Application Load Balancer: ~$0.0225/hour + data processed
- EBS gp2 volume (2Gi): negligible (<$1/month)
- ECR storage: negligible for 2 small images
- **Estimated cost while actively working**: roughly $0.20-$0.25/hour total
- **Mitigation**: cluster was not left running continuously; scaled down /
  deleted between working sessions to control cost
  (`eksctl delete cluster --name capstone-cluster --region eu-central-1`)

## Cleanup Instructions
```bash
kubectl delete -f k8s/
eksctl delete cluster --name capstone-cluster --region eu-central-1
aws ecr delete-repository --repository-name todo-backend --region eu-central-1 --force
aws ecr delete-repository --repository-name todo-frontend --region eu-central-1 --force
```
This removes the load balancer, EBS volume, all pods, the node group, and the
cluster control plane. Confirm in the AWS Console that no orphaned
CloudFormation stacks, ALBs, or EBS volumes remain, since these continue to
incur cost if leftover.

## Known Limitations
- No authentication/authorization on the API.
- Used AWS root account credentials rather than a scoped IAM user (see
  Security Considerations).
- Database runs as a single pod with no automated backup strategy; a
  production deployment should use Amazon RDS instead of a self-managed
  Postgres pod.
- CI/CD pipeline deploys directly to production on every push to `main` with
  no staging environment or manual approval gate.
- The cluster hit its pod-per-node limit during testing (t3.small nodes have
  a low max-pods ceiling); documented as a real scalability constraint
  encountered and resolved by adding a third node.
