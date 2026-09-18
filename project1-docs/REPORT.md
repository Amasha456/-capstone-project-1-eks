# Project 1 Report: Scalability, Security, Availability, Monitoring, and Cost

## Scalability
The backend Deployment runs behind a Horizontal Pod Autoscaler configured for
2-6 replicas, targeting 60% average CPU utilization. This was load-tested
directly: a busybox pod looping HTTP requests against the backend Service
drove CPU usage to over 120% of the target, and the HPA scaled the backend
from 2 to 6 replicas (its configured maximum) within a couple of minutes.
During this test, the cluster's own capacity became the binding constraint
before the HPA's replica ceiling did — a 6th backend pod, and later the
CloudWatch monitoring controller pod, both went `Pending` with a "too many
pods" scheduling error. This is because `t3.small` EC2 instances have a low
per-node pod limit driven by available ENI/IP capacity, not CPU or memory.
The fix applied was scaling the node group from 2 to 3 nodes. This is a real,
observed scalability limit worth noting: **for this workload, node count
(and node size) becomes the binding scalability constraint before CPU-based
autoscaling limits do**, and a production sizing exercise would need to
account for pods-per-node headroom, not just CPU/memory requests, when
choosing instance types.

## Security
Database credentials are managed as a Kubernetes Secret rather than being
hard-coded into manifests or images. The CI/CD pipeline injects AWS
credentials via GitHub Actions repository secrets rather than committing them
to the repo. Container images are scanned on push in ECR.

The most significant, honestly-documented gap is that AWS CLI access for
this project used the AWS account's root credentials rather than a scoped
IAM user, due to time constraints. This was a deliberate tradeoff under a
tight deadline, not an oversight, and in a real deployment this would be
replaced with a least-privilege IAM user or role (ideally an OIDC-based
GitHub Actions role requiring no long-lived keys at all). The application API
also has no authentication layer, which is acceptable for this demo's scope
but would not be for a real multi-user deployment.

## Availability
Availability was tested against all three scenarios the assignment
specifies:
1. **Pod deletion** — a running backend pod was deleted with
   `kubectl delete pod`. The app remained reachable throughout (the second
   backend replica served traffic), and Kubernetes automatically created a
   replacement pod to restore the desired replica count within seconds.
2. **Traffic increase** — see Scalability above; the app remained responsive
   throughout the load test and the autoscaling event.
3. **New version deployment** — a real bug was found and fixed during this
   project: the backend's PostgreSQL connection pool had no error handler,
   so any dropped database connection (such as the database pod being
   deleted) crashed the entire Node.js process, causing a CrashLoopBackOff.
   This was fixed by adding a `pool.on('error', ...)` handler, rebuilt as
   image `v2`, and rolled out with `kubectl set image`. Because the backend
   Deployment runs 2 replicas, this rollout happened with no observed
   downtime to the running application.

## Monitoring
Amazon CloudWatch Container Insights (the `amazon-cloudwatch-observability`
EKS add-on) was installed and confirmed to be actively collecting cluster,
node, and pod-level metrics and logs. `metrics-server` was installed
separately, since it's a distinct requirement for the Horizontal Pod
Autoscaler to read live CPU utilization — this was not obvious at first, and
the HPA showed `<unknown>` targets until `metrics-server` was added, which
is worth noting as a practical setup gotcha for anyone reproducing this.

## Cost
Running components and their approximate hourly cost:
| Component | Approx. cost |
|---|---|
| EKS control plane | $0.10/hour |
| 3x t3.small nodes | ~$0.062/hour combined |
| Application Load Balancer | ~$0.0225/hour + data |
| EBS volume (2Gi gp2) | negligible |
| ECR image storage | negligible |
| **Total while running** | **~$0.20-0.25/hour** |

To control cost, the cluster was not left running continuously between work
sessions — it was deleted (`eksctl delete cluster`) when not actively being
used, since the control plane and load balancer both accrue cost every hour
regardless of traffic. A production deployment running continuously would
instead look at Savings Plans / Reserved Instances for the node group and
right-sizing node count against actual traffic patterns rather than the
fixed 3-node minimum used here for demo/testing purposes.
